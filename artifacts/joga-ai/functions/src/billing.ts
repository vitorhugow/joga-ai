/**
 * billing.ts — Stripe: checkout, portal de gestão e webhook.
 *
 * Segurança:
 * - A secret key vive num Secret do Firebase (nunca no código/repositório).
 * - Só o webhook (com assinatura verificada) concede `entitlements` —
 *   o cliente nunca escreve PRO (as firestore.rules bloqueiam).
 *
 * Configuração (sem redeploy):
 * - Firestore doc `appConfig/billing`:
 *   { playerMonthly, playerYearly, organizerMonthly, organizerYearly } → price IDs
 */

import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { defineSecret } from "firebase-functions/params";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import type { Transaction, DocumentSnapshot, DocumentReference, Firestore, DocumentData } from "firebase-admin/firestore";
import Stripe from "stripe";
import {
  formatEuroCents,
  loadUserDisplayName,
  notifyOrganizerPaymentReceived,
  notifyUser,
} from "./notify";
import { isUserMensalistaActive, scheduleMensalistaCancellations } from "./mensalistas";
import { callableBase, REGION } from "./callableOptions";
import { assertRateLimit } from "./rateLimit";
import { stripeSecretKey, createStripeClient } from "./stripeClient";

const stripeWebhookSecret = defineSecret("STRIPE_WEBHOOK_SECRET");

const ALLOWED_ORIGINS = new Set([
  "https://jogaai.pt",
  "https://www.jogaai.pt",
  "https://jogaai.geniai.pt",
  "https://joga-ai.pages.dev",
  "http://localhost:5173",
  "http://localhost:4173",
]);

type Plan = "player_pro" | "organizer_pro";
type Interval = "month" | "year";

function priceKeyFor(plan: Plan, interval: Interval): string {
  if (plan === "player_pro") return interval === "year" ? "playerYearly" : "playerMonthly";
  return interval === "year" ? "organizerYearly" : "organizerMonthly";
}

async function loadPriceId(plan: Plan, interval: Interval): Promise<string> {
  const snap = await getFirestore().doc("appConfig/billing").get();
  const priceId = snap.data()?.[priceKeyFor(plan, interval)];
  if (typeof priceId !== "string" || !priceId.startsWith("price_")) {
    throw new HttpsError(
      "failed-precondition",
      `Price ID em falta para ${plan}/${interval} — preenche appConfig/billing no Firestore.`,
    );
  }
  return priceId;
}

/** Cria (ou reutiliza) o customer Stripe ligado a este utilizador */
async function ensureStripeCustomer(stripe: Stripe, uid: string): Promise<string> {
  const db = getFirestore();
  const userRef = db.doc(`users/${uid}`);
  const snap = await userRef.get();
  const existing = snap.data()?.stripeCustomerId;
  if (typeof existing === "string" && existing.startsWith("cus_")) return existing;

  const customer = await stripe.customers.create({
    metadata: { firebaseUid: uid },
    email: snap.data()?.email ?? undefined,
    name: snap.data()?.displayName ?? undefined,
  });
  await userRef.set({ stripeCustomerId: customer.id }, { merge: true });
  return customer.id;
}

function safeOrigin(origin: unknown): string {
  return typeof origin === "string" && ALLOWED_ORIGINS.has(origin)
    ? origin
    : "https://jogaai.pt";
}

const ALLOWED_RETURN_PREFIXES = ["/perfil", "/criar-partida", "/partida/", "/premium", "/jogos"];

function safeReturnPath(path: unknown): string {
  if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//")) {
    return "/perfil";
  }
  if (path.length > 220) return "/perfil";
  if (!ALLOWED_RETURN_PREFIXES.some((p) => path === p || path.startsWith(p))) {
    return "/perfil";
  }
  return path;
}

function stripeConnectReturnUrl(
  origin: string,
  returnPath: string,
  status: "ligado" | "recomecar",
): string {
  const sep = returnPath.includes("?") ? "&" : "?";
  return `${origin}${returnPath}${sep}stripe=${status}`;
}

function stripeErrorMessage(err: unknown): string {
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message?: string }).message ?? "");
  }
  return "";
}

/** Erros de configuração Connect → mensagem legível (evita INTERNAL no cliente). */
function throwStripeConnectError(err: unknown): never {
  const stripeMsg = stripeErrorMessage(err);
  if (stripeMsg.includes("signed up for Connect")) {
    throw new HttpsError(
      "failed-precondition",
      "Stripe Connect ainda não está activo. No Dashboard (modo Test), abre dashboard.stripe.com/test/connect, clica «Continuar configuração», escolhe Plataforma e completa o guia até ao fim.",
    );
  }
  if (
    stripeMsg.includes("platform-profile") ||
    stripeMsg.includes("managing losses")
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Falta aceitar perdas no Modo de teste NORMAL (não na área restrita). No seletor de contas escolhe a conta principal → Modo de teste → dashboard.stripe.com/test/settings/connect/platform-profile → confirma e guarda.",
    );
  }
  if (stripeMsg) {
    throw new HttpsError("failed-precondition", stripeMsg.slice(0, 280));
  }
  throw err;
}

export const createCheckoutSession = onCall(
  { ...callableBase({ secrets: [stripeSecretKey] }) },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Inicia sessão para assinar o PRO.");
    await assertRateLimit(uid, "createCheckoutSession", 10, 60);

    const plan = request.data?.plan as Plan;
    const interval = (request.data?.interval as Interval) ?? "month";
    const communityId = typeof request.data?.communityId === "string"
      ? request.data.communityId.trim()
      : "";
    if (plan !== "player_pro" && plan !== "organizer_pro") {
      throw new HttpsError("invalid-argument", "Plano inválido.");
    }
    if (plan === "organizer_pro" && !communityId) {
      throw new HttpsError(
        "invalid-argument",
        "Escolhe o clube/comunidade para activar o Clube PRO.",
      );
    }
    if (interval !== "month" && interval !== "year") {
      throw new HttpsError("invalid-argument", "Intervalo inválido.");
    }

    const stripe = createStripeClient(stripeSecretKey.value());
    const origin = safeOrigin(request.data?.origin);
    const [priceId, customerId] = await Promise.all([
      loadPriceId(plan, interval),
      ensureStripeCustomer(stripe, uid),
    ]);

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: uid,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        metadata: {
          firebaseUid: uid,
          plan,
          ...(communityId ? { communityId } : {}),
        },
      },
      allow_promotion_codes: true,
      success_url: `${origin}/premium?checkout=sucesso&plan=${plan}${communityId ? `&community=${communityId}` : ""}`,
      cancel_url: `${origin}/premium?checkout=cancelado`,
    });

    if (!session.url) throw new HttpsError("internal", "Stripe não devolveu URL.");
    return { url: session.url };
  },
);

export const createPortalSession = onCall(
  { ...callableBase({ secrets: [stripeSecretKey] }) },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Inicia sessão.");
    await assertRateLimit(uid, "createPortalSession", 10, 60);

    const customerId = (await getFirestore().doc(`users/${uid}`).get()).data()
      ?.stripeCustomerId;
    if (typeof customerId !== "string") {
      throw new HttpsError("failed-precondition", "Sem assinatura associada a esta conta.");
    }

    const stripe = createStripeClient(stripeSecretKey.value());
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${safeOrigin(request.data?.origin)}/premium`,
    });
    return { url: session.url };
  },
);

/**
 * Repara o vínculo entre uma subscrição Clube PRO já activa e a comunidade
 * administrada por quem chama — corrige contas afectadas por um bug em que
 * eventos de subscrição sem `metadata.communityId` (renovação, alteração via
 * portal) apagavam o `proCommunityId` mesmo com o Clube PRO continuado.
 * Nunca concede Clube PRO a quem não o tem — só realinha um que já existe.
 */
export const relinkOrganizerProCommunity = onCall(
  { ...callableBase() },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Inicia sessão.");
    await assertRateLimit(uid, "relinkOrganizerProCommunity", 10, 60);

    const communityId = typeof request.data?.communityId === "string"
      ? request.data.communityId.trim()
      : "";
    if (!communityId) throw new HttpsError("invalid-argument", "communityId em falta.");

    const db = getFirestore();
    const communitySnap = await db.doc(`communities/${communityId}`).get();
    if (!communitySnap.exists || communitySnap.data()?.adminId !== uid) {
      throw new HttpsError("permission-denied", "Só o admin desta comunidade pode fazer isto.");
    }

    const userRef = db.doc(`users/${uid}`);
    const userSnap = await userRef.get();
    const entitlements = (userSnap.data()?.entitlements ?? {}) as Record<string, unknown>;
    const organizerPro = readPlanSlotFromFirestore(entitlements, "organizerPro", "organizer_pro");

    if (!isPlanSlotActive(organizerPro)) {
      throw new HttpsError("failed-precondition", "Sem Clube PRO activo nesta conta.");
    }
    if (organizerPro.proCommunityId === communityId) {
      return { relinked: false };
    }

    const nextOrganizerPro: PlanEntitlementSlot = { ...organizerPro, proCommunityId: communityId };
    const currentProCommunities = (entitlements.proCommunities ?? {}) as Record<string, unknown>;
    const nextProCommunities = {
      ...currentProCommunities,
      [communityId]: { proUntil: organizerPro.proUntil, subscriptionId: organizerPro.subscriptionId },
    };

    await userRef.set(
      {
        entitlements: {
          ...entitlements,
          organizerPro: nextOrganizerPro,
          proCommunityId: communityId,
          proCommunities: nextProCommunities,
        },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    console.log(`[relinkOrganizerProCommunity] ${uid} -> ${communityId}`);
    return { relinked: true };
  },
);

/** Concede/atualiza/revoga entitlements a partir da subscrição */
type PlanEntitlementSlot = {
  active: boolean;
  proUntil: string | null;
  subscriptionId: string | null;
  proCommunityId?: string;
};

function isPlanSlotActive(slot: PlanEntitlementSlot): boolean {
  if (!slot.active) return false;
  if (!slot.proUntil) return true;
  return Date.now() < new Date(slot.proUntil).getTime();
}

function readPlanSlotFromFirestore(
  current: Record<string, unknown>,
  slotKey: "playerPro" | "organizerPro",
  legacyPlan: Plan,
): PlanEntitlementSlot {
  const raw = current[slotKey];
  if (raw && typeof raw === "object") {
    const s = raw as Record<string, unknown>;
    return {
      active: s.active === true,
      proUntil: typeof s.proUntil === "string" ? s.proUntil : null,
      subscriptionId: typeof s.subscriptionId === "string" ? s.subscriptionId : null,
      ...(typeof s.proCommunityId === "string" ? { proCommunityId: s.proCommunityId } : {}),
    };
  }
  if (current.plan === legacyPlan && current.pro === true) {
    return {
      active: true,
      proUntil: typeof current.proUntil === "string" ? current.proUntil : null,
      subscriptionId: null,
      ...(legacyPlan === "organizer_pro" && typeof current.proCommunityId === "string"
        ? { proCommunityId: current.proCommunityId }
        : {}),
    };
  }
  return { active: false, proUntil: null, subscriptionId: null };
}

async function applySubscription(sub: Stripe.Subscription): Promise<void> {
  const uid = sub.metadata?.firebaseUid;
  if (!uid) {
    console.warn("[stripeWebhook] subscrição sem firebaseUid:", sub.id);
    return;
  }
  const plan: Plan = sub.metadata?.plan === "organizer_pro" ? "organizer_pro" : "player_pro";
  const rawCommunityId = typeof sub.metadata?.communityId === "string"
    ? sub.metadata.communityId
    : "";
  const active = sub.status === "active" || sub.status === "trialing";
  const periodEnd = sub.current_period_end ?? null;
  const proUntil = periodEnd ? new Date(periodEnd * 1000).toISOString() : null;

  const db = getFirestore();
  const userRef = db.doc(`users/${uid}`);
  const userSnap = await userRef.get();
  const current = (userSnap.data()?.entitlements ?? {}) as Record<string, unknown>;

  const previousSlot =
    plan === "organizer_pro"
      ? readPlanSlotFromFirestore(current, "organizerPro", "organizer_pro")
      : readPlanSlotFromFirestore(current, "playerPro", "player_pro");
  const wasActive = isPlanSlotActive(previousSlot);

  // Eventos de subscrição subsequentes (renovação, alteração via portal) nem
  // sempre trazem `metadata.communityId` na subscrição — sem isto, cada
  // renovação apagava silenciosamente o vínculo à comunidade mesmo com a
  // subscrição continuada, e o Clube PRO ficava "activo" mas sem a comunidade
  // certa associada (mensalistas e outras features com gate por comunidade
  // ficavam bloqueadas para quem já era Clube PRO há mais tempo).
  const communityId = rawCommunityId || (plan === "organizer_pro" ? (previousSlot.proCommunityId ?? "") : "");

  const updatedSlot: PlanEntitlementSlot = {
    active,
    proUntil,
    subscriptionId: active ? sub.id : null,
    ...(plan === "organizer_pro" && communityId && active ? { proCommunityId: communityId } : {}),
  };

  const playerPro =
    plan === "player_pro"
      ? updatedSlot
      : readPlanSlotFromFirestore(current, "playerPro", "player_pro");
  const organizerPro =
    plan === "organizer_pro"
      ? updatedSlot
      : readPlanSlotFromFirestore(current, "organizerPro", "organizer_pro");

  const proActive = isPlanSlotActive(playerPro) || isPlanSlotActive(organizerPro);
  const primaryPlan: Plan | undefined = isPlanSlotActive(organizerPro)
    ? "organizer_pro"
    : isPlanSlotActive(playerPro)
      ? "player_pro"
      : undefined;
  const derivedProUntil = isPlanSlotActive(organizerPro)
    ? organizerPro.proUntil
    : isPlanSlotActive(playerPro)
      ? playerPro.proUntil
      : null;

  const entitlements: Record<string, unknown> = {
    pro: proActive,
    playerPro,
    organizerPro,
  };
  if (primaryPlan) entitlements.plan = primaryPlan;
  if (derivedProUntil) entitlements.proUntil = derivedProUntil;
  if (isPlanSlotActive(organizerPro) && organizerPro.proCommunityId) {
    entitlements.proCommunityId = organizerPro.proCommunityId;
  }

  // IMPORTANTE: `proCommunities` tem de viver DENTRO de `entitlements` — é o
  // único sítio que o cliente lê (isOrganizerProForCommunity em
  // entitlements.ts). Escrever num campo `proCommunities` ao nível da raiz do
  // documento (sibling de `entitlements`) é uma escrita morta que nunca é
  // lida por ninguém. Mesclado manualmente com o que já existia — um `set`
  // com merge não mescla objetos aninhados passados por valor, só substitui.
  const currentProCommunities = (current.proCommunities ?? {}) as Record<string, unknown>;
  if (plan === "organizer_pro" && communityId) {
    const nextProCommunities = { ...currentProCommunities };
    if (active) {
      nextProCommunities[communityId] = { proUntil, subscriptionId: sub.id };
    } else {
      delete nextProCommunities[communityId];
    }
    entitlements.proCommunities = nextProCommunities;
  } else if (Object.keys(currentProCommunities).length > 0) {
    entitlements.proCommunities = currentProCommunities;
  }

  const patch: Record<string, unknown> = {
    entitlements,
    stripeSubscriptionId: sub.id,
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (plan === "organizer_pro" && communityId) {
    if (active) {
      await db.doc(`communities/${communityId}`).set(
        {
          proActive: true,
          proUntil,
          proOrganizerId: uid,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    } else {
      await db.doc(`communities/${communityId}`).set(
        {
          proActive: false,
          proUntil: null,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      await scheduleMensalistaCancellations(communityId, "pro_revoked");
    }
  }

  await userRef.set(patch, { merge: true });
  console.log(`[stripeWebhook] entitlements ${active ? "ativos" : "revogados"} para ${uid} (${plan}${communityId ? ` @ ${communityId}` : ""})`);

  if (active && !wasActive) {
    await notifyUser(uid, {
      id: `pro-on-${plan}`,
      priority: "popup",
      type: "system",
      title: plan === "player_pro" ? "PRO Jogador ativo! 🔥" : "Clube PRO ativo! 🏆",
      body:
        plan === "player_pro"
          ? "Evolução ilimitada, estatísticas avançadas e distintivos exclusivos."
          : "Gestão do clube, lembretes de pagamento e badge PRO na comunidade.",
      link: "/premium",
    });
  } else if (!active && wasActive) {
    await notifyUser(uid, {
      id: `pro-off-${sub.id}`,
      priority: "center",
      type: "system",
      title: "PRO terminado",
      body: "A tua subscrição terminou. Podes reativar quando quiseres.",
      link: "/premium",
    });
  }
}

export const stripeWebhook = onRequest(
  { region: REGION, secrets: [stripeSecretKey, stripeWebhookSecret] },
  async (req, res) => {
    const stripe = createStripeClient(stripeSecretKey.value());
    const signature = req.headers["stripe-signature"];

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        req.rawBody,
        signature as string,
        stripeWebhookSecret.value(),
      );
    } catch (err) {
      console.error("[stripeWebhook] assinatura inválida:", err);
      res.status(400).send("assinatura inválida");
      return;
    }

    try {
      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;
          if (session.mode === "payment" && session.metadata?.kind === "pelada") {
            await handlePeladaCheckoutSession(session);
          }
          if (session.mode === "subscription" && session.subscription) {
            const sub = await stripe.subscriptions.retrieve(
              session.subscription as string,
            );
            await applySubscription(sub);
          }
          break;
        }
        case "checkout.session.async_payment_succeeded": {
          const session = event.data.object as Stripe.Checkout.Session;
          if (session.mode === "payment" && session.metadata?.kind === "pelada") {
            await handlePeladaCheckoutSession(session);
            const { matchId, uid } = (session.metadata ?? {}) as Record<string, string>;
            if (matchId && uid) {
              const matchSnap = await getFirestore().doc(`matches/${matchId}`).get();
              const title = String(matchSnap.data()?.title ?? "pelada");
              await notifyUser(uid, {
                id: `payok-${matchId}-${uid}`,
                priority: "popup",
                type: "match",
                title: "Pagamento confirmado ✅",
                body: `Presença garantida em «${title}».`,
                link: `/partida/${matchId}/pre-jogo`,
              });
            }
          }
          break;
        }
        case "checkout.session.async_payment_failed": {
          const session = event.data.object as Stripe.Checkout.Session;
          if (session.mode === "payment" && session.metadata?.kind === "pelada") {
            const { matchId, uid } = (session.metadata ?? {}) as Record<string, string>;
            console.log(
              "[stripeWebhook] pagamento assíncrono falhou:",
              session.id,
              "matchId=",
              matchId ?? "?",
              "uid=",
              uid ?? "?",
            );
            if (matchId && uid) {
              const matchSnap = await getFirestore().doc(`matches/${matchId}`).get();
              const title = String(matchSnap.data()?.title ?? "pelada");
              await notifyUser(uid, {
                id: `payfail-${matchId}-${uid}`,
                priority: "popup",
                type: "match",
                title: "Pagamento falhou",
                body: `O pagamento de «${title}» não foi concluído — tenta novamente para garantir a vaga.`,
                link: `/partida/${matchId}/pre-jogo`,
              });
            }
          }
          break;
        }
        case "invoice.payment_failed": {
          const invoice = event.data.object as Stripe.Invoice;
          const subRef = invoice.subscription;
          const subId = typeof subRef === "string" ? subRef : subRef?.id;
          if (subId) {
            const sub = await stripe.subscriptions.retrieve(subId);
            const firebaseUid = sub.metadata?.firebaseUid;
            if (firebaseUid) {
              await notifyUser(firebaseUid, {
                id: `pro-payfail-${subId}`,
                priority: "popup",
                type: "system",
                title: "Pagamento do PRO falhou",
                body: "Atualiza o método de pagamento para não perder as vantagens PRO.",
                link: "/premium",
              });
            }
          }
          break;
        }
        case "customer.subscription.updated":
        case "customer.subscription.deleted": {
          await applySubscription(event.data.object as Stripe.Subscription);
          break;
        }
        default:
          break;
      }
      res.status(200).send("ok");
    } catch (err) {
      console.error("[stripeWebhook] erro a processar", event.type, err);
      res.status(500).send("erro interno");
    }
  },
);


/* ═══════════════════ SPRINT 3B — Pagamentos de pelada (Connect) ═══════════════════ */

const PLAYER_FEE_CENTS = 50; // taxa de conveniência do jogador
const MAX_PELADA_PRICE_CENTS = 500; // máx. 5€/jogador na app

function parsePriceCents(price: unknown): number | null {
  if (typeof price !== "string") return null;
  const value = parseFloat(price.replace(",", ".").replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(value) || value <= 0) return null;
  const cents = Math.round(value * 100);
  return cents >= 50 && cents <= MAX_PELADA_PRICE_CENTS ? cents : null;
}

/** Nome da carta → primeiro/último para pré-preencher o Stripe */
function splitDisplayName(displayName: string): { first_name?: string; last_name?: string } {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return {};
  if (parts.length === 1) return { first_name: parts[0] };
  return { first_name: parts[0], last_name: parts.slice(1).join(" ") };
}

/** Conta Express mínima: organizador = pessoa, não empresa */
function organizerAccountParams(
  uid: string,
  user: Record<string, unknown>,
  email?: string,
): Stripe.AccountCreateParams {
  const displayName = String(user.displayName ?? "").trim();
  const individual = splitDisplayName(displayName);

  return {
    type: "express",
    country: "PT",
    email: email || undefined,
    business_type: "individual",
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
      // MB WAY (Portugal) — contas Express não o pedem sozinhas no
      // Dashboard próprio; tem de ser pedido pela plataforma. Ver também
      // assertOrganizerChargesEnabled em mensalistas.ts, que pede isto
      // retroactivamente para contas já criadas antes desta linha existir.
      mb_way_payments: { requested: true },
    } as unknown as Stripe.AccountCreateParams.Capabilities,
    business_profile: {
      mcc: "7941",
      product_description: "Organização de peladas de futebol amador",
      url: "https://jogaai.pt",
    },
    individual: {
      email: email || undefined,
      ...individual,
    },
    metadata: { firebaseUid: uid, role: "organizer" },
  };
}

async function syncOrganizerAccountPrefill(
  stripe: Stripe,
  accountId: string,
  uid: string,
  user: Record<string, unknown>,
  email?: string,
): Promise<void> {
  const account = await stripe.accounts.retrieve(accountId);
  if (account.details_submitted) return;

  const params = organizerAccountParams(uid, user, email);
  await stripe.accounts.update(accountId, {
    email: params.email,
    business_type: params.business_type,
    business_profile: params.business_profile,
    individual: params.individual,
  });
}

/** Onboarding ou gestão Stripe Connect Express do organizador */
export const createConnectOnboarding = onCall(
  { ...callableBase({ secrets: [stripeSecretKey] }) },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Inicia sessão.");
    await assertRateLimit(uid, "createConnectOnboarding", 10, 60);

    const intent = request.data?.intent === "manage" ? "manage" : "onboard";
    const returnPath = safeReturnPath(request.data?.returnPath);

    const stripe = createStripeClient(stripeSecretKey.value());
    const db = getFirestore();
    const userRef = db.doc(`users/${uid}`);
    const userSnap = await userRef.get();
    const user = userSnap.data() ?? {};
    const email =
      (typeof request.auth?.token?.email === "string" && request.auth.token.email) ||
      (typeof user.email === "string" ? user.email : undefined);

    let accountId = user.stripeAccountId;

    if (typeof accountId !== "string" || !accountId.startsWith("acct_")) {
      if (intent === "manage") {
        throw new HttpsError(
          "failed-precondition",
          "Ainda não ligaste uma conta de recebimentos.",
        );
      }
      try {
        const account = await stripe.accounts.create(
          organizerAccountParams(uid, user, email),
        );
        accountId = account.id;
        await userRef.set({ stripeAccountId: accountId }, { merge: true });
      } catch (err) {
        throwStripeConnectError(err);
      }
    } else {
      try {
        await syncOrganizerAccountPrefill(stripe, accountId, uid, user, email);
      } catch (err) {
        console.warn("[createConnectOnboarding] prefill:", err);
      }
    }

    const origin = safeOrigin(request.data?.origin);

    try {
      const account = await stripe.accounts.retrieve(accountId);

      if (intent === "manage" && account.charges_enabled) {
        const login = await stripe.accounts.createLoginLink(accountId);
        return { url: login.url };
      }

      const linkType = account.details_submitted ? "account_update" : "account_onboarding";
      const link = await stripe.accountLinks.create({
        account: accountId,
        type: linkType,
        refresh_url: stripeConnectReturnUrl(origin, returnPath, "recomecar"),
        return_url: stripeConnectReturnUrl(origin, returnPath, "ligado"),
        collection_options: { fields: "currently_due" },
      });
      return { url: link.url };
    } catch (err) {
      throwStripeConnectError(err);
    }
  },
);

/** Checkout de UMA pelada: preço → organizador; taxa → plataforma */
export const createPeladaCheckout = onCall(
  { ...callableBase({ secrets: [stripeSecretKey] }) },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Inicia sessão.");
    await assertRateLimit(uid, "createPeladaCheckout", 10, 60);
    const matchId = String(request.data?.matchId ?? "");
    if (!matchId) throw new HttpsError("invalid-argument", "matchId em falta.");

    const db = getFirestore();

    if (await tryApplyMensalistaPeladaPayment(db, matchId, uid)) {
      return { url: "", mensalista: true, paid: true };
    }

    const matchSnap = await db.doc(`matches/${matchId}`).get();
    const match = matchSnap.data();
    if (!match) throw new HttpsError("not-found", "Pelada não encontrada.");
    if (match.paymentsEnabled !== true) {
      throw new HttpsError("failed-precondition", "Esta pelada não aceita pagamentos na app.");
    }
    const players: Array<{ userId?: string; paid?: boolean }> = Array.isArray(match.players)
      ? match.players
      : [];
    const paidUserIds: string[] = Array.isArray(match.paidUserIds) ? match.paidUserIds : [];
    if (players.find((pl) => pl.userId === uid)?.paid === true || paidUserIds.includes(uid)) {
      throw new HttpsError("already-exists", "Já está pago. ✅");
    }

    const priceCents = parsePriceCents(match.price);
    if (!priceCents) {
      throw new HttpsError(
        "failed-precondition",
        "Preço inválido — define entre 0,50€ e 5€ por jogador.",
      );
    }

    const organizerId = String(match.organizerId ?? "");
    const orgSnap = await db.doc(`users/${organizerId}`).get();
    const org = orgSnap.data() ?? {};
    const accountId = org.stripeAccountId;
    if (typeof accountId !== "string") {
      throw new HttpsError("failed-precondition", "O organizador ainda não ligou a Caixa.");
    }

    const stripe = createStripeClient(stripeSecretKey.value());
    const account = await stripe.accounts.retrieve(accountId);
    if (!account.charges_enabled) {
      throw new HttpsError("failed-precondition", "A conta do organizador ainda está em verificação no Stripe.");
    }

    const totalCents = priceCents + PLAYER_FEE_CENTS;

    const origin = safeOrigin(request.data?.origin);
    // Cobrança na plataforma (separate charge) — transferência ao organizador só quando
    // a pelada é concluída, para o org não levantar antes do jogo acabar.
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      client_reference_id: uid,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "eur",
            unit_amount: totalCents,
            product_data: {
              name: `Pelada — ${String(match.title ?? "Joga AI").slice(0, 60)}`,
              description:
                "Inclui 0,50€ de taxa de serviço não reembolsável. Cancelamentos são creditados como saldo Joga AI.",
            },
          },
        },
      ],
      payment_intent_data: {
        metadata: {
          kind: "pelada",
          matchId,
          uid,
          organizerId,
          organizerAccountId: accountId,
        },
      },
      metadata: {
        kind: "pelada",
        matchId,
        uid,
        organizerId,
        organizerAccountId: accountId,
      },
      success_url: `${origin}/partida/${matchId}/pre-jogo?pagamento=sucesso`,
      cancel_url: `${origin}/partida/${matchId}/pre-jogo?pagamento=cancelado`,
    });

    if (!session.url) throw new HttpsError("internal", "Stripe não devolveu URL.");
    return { url: session.url, totalCents };
  },
);

/** Marca o jogador como pago e confirma presença automaticamente */
type PeladaPayInput = {
  sessionId: string;
  paymentIntentId: string;
  amountCents: number;
  paidVia: "app" | "balance" | "mensalista";
  stripeTransferId?: string;
  organizerPriceCents?: number;
  releasedToOrganizer?: boolean;
  organizerAccountId?: string;
  method?: "mensalista";
};

function applyPeladaPlayerPaidInTx(
  tx: Transaction,
  ref: DocumentReference,
  snap: DocumentSnapshot,
  uid: string,
  user: Record<string, unknown>,
  payment: PeladaPayInput,
): void {
  if (!snap.exists) return;
  const data = snap.data() ?? {};
  const players: Array<Record<string, unknown>> = Array.isArray(data.players)
    ? [...(data.players as Array<Record<string, unknown>>)]
    : [];
  const peladaPayments: Array<Record<string, unknown>> = Array.isArray(data.peladaPayments)
    ? [...(data.peladaPayments as Array<Record<string, unknown>>)]
    : [];

  if (
    payment.paymentIntentId &&
    !peladaPayments.some((p) => p.paymentIntentId === payment.paymentIntentId)
  ) {
    peladaPayments.push({
      userId: uid,
      sessionId: payment.sessionId,
      paymentIntentId: payment.paymentIntentId,
      amountCents: payment.amountCents,
      paidAt: new Date().toISOString(),
      paidVia: payment.paidVia,
      ...(payment.method ? { method: payment.method } : {}),
      ...(payment.stripeTransferId ? { stripeTransferId: payment.stripeTransferId } : {}),
      ...(payment.organizerPriceCents != null
        ? { organizerPriceCents: payment.organizerPriceCents }
        : {}),
      releasedToOrganizer: payment.releasedToOrganizer === true,
      ...(payment.organizerAccountId ? { organizerAccountId: payment.organizerAccountId } : {}),
    });
  } else if (payment.paidVia === "mensalista" && payment.method === "mensalista") {
    const already = peladaPayments.some(
      (p) => p.userId === uid && p.method === "mensalista" && p.paidVia === "mensalista",
    );
    if (!already) {
      peladaPayments.push({
        userId: uid,
        sessionId: "",
        paymentIntentId: `mensalista_${uid}_${Date.now()}`,
        amountCents: 0,
        paidAt: new Date().toISOString(),
        paidVia: "mensalista",
        method: "mensalista",
        releasedToOrganizer: true,
      });
    }
  }

  const paidAt = new Date().toISOString();
  const idx = players.findIndex((pl) => pl.userId === uid);
  if (idx >= 0) {
    players[idx] = {
      ...players[idx],
      paid: true,
      paidVia: payment.paidVia,
      paidAt,
    };
    tx.update(ref, { players, peladaPayments, savedAt: FieldValue.serverTimestamp() });
    return;
  }

  const maxPlayers = Math.max(4, Number(data.maxPlayers) || 14);
  if (players.length >= maxPlayers) {
    const paidUserIds: string[] = Array.isArray(data.paidUserIds)
      ? [...(data.paidUserIds as string[])]
      : [];
    if (!paidUserIds.includes(uid)) paidUserIds.push(uid);
    tx.update(ref, { paidUserIds, peladaPayments, savedAt: FieldValue.serverTimestamp() });
    return;
  }

  const newPlayer = {
    id: uid,
    userId: uid,
    name: String(user.displayName ?? "Jogador").trim() || "Jogador",
    position: String(user.position ?? "MEI"),
    overall: Number(user.overall ?? 50) || 50,
    paid: true,
    paidVia: payment.paidVia,
    paidAt,
    isMe: false,
  };
  const playerTeams = {
    ...(typeof data.playerTeams === "object" && data.playerTeams
      ? (data.playerTeams as Record<string, unknown>)
      : {}),
    [uid]: "BENCH",
  };
  const participantUserIds = Array.from(
    new Set([
      ...(Array.isArray(data.participantUserIds) ? (data.participantUserIds as string[]) : []),
      uid,
    ]),
  );
  const paidUserIds = (Array.isArray(data.paidUserIds) ? (data.paidUserIds as string[]) : [])
    .filter((id) => id !== uid);

  tx.update(ref, {
    players: [...players, newPlayer],
    playerTeams,
    participantUserIds,
    paidUserIds,
    peladaPayments,
    savedAt: FieldValue.serverTimestamp(),
  });
}

async function promoteWaitlistAfterLeave(
  db: Firestore,
  matchId: string,
): Promise<{ uid: string } | null> {
  let promotedUid: string | null = null;

  await db.runTransaction(async (tx) => {
    const ref = db.doc(`matches/${matchId}`);
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const data = snap.data() ?? {};
    const waitlist: Array<Record<string, unknown>> = Array.isArray(data.waitlist)
      ? [...(data.waitlist as Array<Record<string, unknown>>)]
      : [];
    if (!waitlist.length) return;

    const maxPlayers = Math.max(4, Number(data.maxPlayers) || 14);
    const players: Array<Record<string, unknown>> = Array.isArray(data.players)
      ? [...(data.players as Array<Record<string, unknown>>)]
      : [];
    if (players.length >= maxPlayers) return;

    const promoted = waitlist.shift()!;
    const uid = String(promoted.userId ?? "");
    if (!uid) return;
    promotedUid = uid;

    const playerTeams = {
      ...(typeof data.playerTeams === "object" && data.playerTeams
        ? (data.playerTeams as Record<string, unknown>)
        : {}),
      [uid]: "BENCH",
    };
    const newPlayer = {
      id: uid,
      userId: uid,
      name: String(promoted.name ?? "Jogador"),
      position: String(promoted.position ?? "MEI"),
      overall: Number(promoted.overall ?? 50) || 50,
      paid: false,
    };

    tx.update(ref, {
      players: [...players, newPlayer],
      waitlist,
      playerTeams,
      savedAt: FieldValue.serverTimestamp(),
    });
  });

  if (promotedUid) {
    return { uid: promotedUid };
  }

  return null;
}

function assertPeladaPayable(
  match: DocumentData,
  uid: string,
): { priceCents: number; totalCents: number } {
  if (match.paymentsEnabled !== true) {
    throw new HttpsError("failed-precondition", "Esta pelada não aceita pagamentos na app.");
  }
  const players: Array<{ userId?: string; paid?: boolean }> = Array.isArray(match.players)
    ? match.players
    : [];
  const paidUserIds: string[] = Array.isArray(match.paidUserIds) ? match.paidUserIds : [];
  if (players.find((pl) => pl.userId === uid)?.paid === true || paidUserIds.includes(uid)) {
    throw new HttpsError("already-exists", "Já está pago. ✅");
  }

  const priceCents = parsePriceCents(match.price);
  if (!priceCents) {
    throw new HttpsError(
      "failed-precondition",
      "Preço inválido — define entre 0,50€ e 5€ por jogador.",
    );
  }

  return { priceCents, totalCents: priceCents + PLAYER_FEE_CENTS };
}

/** Marca jogador como pago via mensalista (sem cobrança avulsa). */
async function tryApplyMensalistaPeladaPayment(
  db: Firestore,
  matchId: string,
  uid: string,
): Promise<boolean> {
  const matchSnap = await db.doc(`matches/${matchId}`).get();
  const match = matchSnap.data();
  if (!match) return false;

  const communityId = String(match.communityId ?? "");
  if (!communityId) return false;

  const isMensalista = await isUserMensalistaActive(db, communityId, uid);
  if (!isMensalista) return false;

  const userSnap = await db.doc(`users/${uid}`).get();
  const user = userSnap.data() ?? {};

  await db.runTransaction(async (tx) => {
    const ref = db.doc(`matches/${matchId}`);
    const snap = await tx.get(ref);
    applyPeladaPlayerPaidInTx(tx, ref, snap, uid, user, {
      sessionId: "",
      paymentIntentId: `mensalista_${uid}_${Date.now()}`,
      amountCents: 0,
      paidVia: "mensalista",
      method: "mensalista",
      releasedToOrganizer: true,
    });
  });

  console.log(`[mensalista] pelada ${matchId}: ${uid} isento (passe mensal).`);
  return true;
}

async function loadOrganizerStripeAccount(db: Firestore, organizerId: string): Promise<string> {
  const orgSnap = await db.doc(`users/${organizerId}`).get();
  const accountId = orgSnap.data()?.stripeAccountId;
  if (typeof accountId !== "string") {
    throw new HttpsError("failed-precondition", "O organizador ainda não ligou a Caixa.");
  }
  return accountId;
}

async function assertOrganizerChargesEnabled(stripe: Stripe, accountId: string): Promise<void> {
  const account = await stripe.accounts.retrieve(accountId);
  if (!account.charges_enabled) {
    throw new HttpsError(
      "failed-precondition",
      "A conta do organizador ainda está em verificação no Stripe.",
    );
  }
}

/** ID da transferência Connect criada num pagamento com cartão */
async function getChargeTransferId(stripe: Stripe, paymentIntentId: string): Promise<string | null> {
  const pi = await stripe.paymentIntents.retrieve(paymentIntentId, {
    expand: ["latest_charge"],
  });
  const chargeId =
    typeof pi.latest_charge === "string" ? pi.latest_charge : pi.latest_charge?.id;
  if (!chargeId) return null;
  const charge = await stripe.charges.retrieve(chargeId);
  return typeof charge.transfer === "string" ? charge.transfer : null;
}

/** Envia o preço da pelada para a Caixa do organizador (pagamento com saldo) */
async function transferPeladaPriceToOrganizer(
  stripe: Stripe,
  opts: {
    accountId: string;
    priceCents: number;
    matchId: string;
    uid: string;
    organizerId: string;
    paymentIntentId: string;
    kind?: "rel" | "bal";
  },
): Promise<string> {
  const idempotencyKey =
    `pel_${opts.kind ?? "rel"}_${opts.matchId}_${opts.uid}_${opts.paymentIntentId}`.slice(0, 255);
  const transfer = await stripe.transfers.create(
    {
      amount: opts.priceCents,
      currency: "eur",
      destination: opts.accountId,
      transfer_group: `pelada_${opts.matchId}`,
      metadata: {
        kind: "pelada_balance",
        matchId: opts.matchId,
        uid: opts.uid,
        organizerId: opts.organizerId,
      },
    },
    { idempotencyKey },
  );
  return transfer.id;
}

async function reverseOrganizerPeladaTransfer(
  stripe: Stripe,
  transferId: string,
  amountCents: number,
  reason: string,
): Promise<void> {
  await stripe.transfers.createReversal(transferId, {
    amount: amountCents,
    metadata: { reason },
  });
}

/** Pagamentos antigos (destination charge) já tinham ido para o org; novos ficam retidos até concluída */
function paymentWasReleasedToOrganizer(payment: Record<string, unknown>): boolean {
  if (payment.releasedToOrganizer === false) return false;
  if (payment.releasedToOrganizer === true) return true;
  return (
    String(payment.paidVia ?? "app") === "app" &&
    String(payment.paymentIntentId ?? "").startsWith("pi_")
  );
}

function peladaPriceFromPayment(
  payment: Record<string, unknown>,
  matchPrice: unknown,
): number {
  const fromPayment = Number(payment.organizerPriceCents);
  if (fromPayment > 0) return fromPayment;
  return parsePriceCents(matchPrice) ?? 0;
}

/** Liberta pagamentos retidos → Caixa do organizador (só após concluída) */
export async function releaseHeldPeladaPayments(
  stripe: Stripe,
  db: Firestore,
  matchId: string,
): Promise<number> {
  const ref = db.doc(`matches/${matchId}`);
  const snap = await ref.get();
  const match = snap.data();
  if (!match || match.paymentsEnabled !== true) return 0;

  const organizerId = String(match.organizerId ?? "");
  let accountId = "";
  try {
    accountId = await loadOrganizerStripeAccount(db, organizerId);
    await assertOrganizerChargesEnabled(stripe, accountId);
  } catch (err) {
    console.error("[releaseHeldPeladaPayments] org sem caixa:", matchId, err);
    return 0;
  }

  const payments: Array<Record<string, unknown>> = Array.isArray(match.peladaPayments)
    ? [...(match.peladaPayments as Array<Record<string, unknown>>)]
    : [];

  let released = 0;
  let totalReleasedCents = 0;
  for (let i = 0; i < payments.length; i++) {
    const payment = payments[i];
    if (
      payment.refunded === true ||
      payment.creditedToBalance === true ||
      payment.releasedToOrganizer === true
    ) {
      continue;
    }

    const payerId = String(payment.userId ?? "");
    const priceCents = peladaPriceFromPayment(payment, match.price);
    if (!payerId || priceCents <= 0) continue;

    const destAccount = String(payment.organizerAccountId ?? accountId);
    const paymentIntentId = String(payment.paymentIntentId ?? `bal_${payerId}_${i}`);
    try {
      const transferId = await transferPeladaPriceToOrganizer(stripe, {
        accountId: destAccount,
        priceCents,
        matchId,
        uid: payerId,
        organizerId,
        paymentIntentId,
        kind: "rel",
      });
      payments[i] = {
        ...payment,
        releasedToOrganizer: true,
        stripeTransferId: transferId,
        organizerPriceCents: priceCents,
        releasedAt: new Date().toISOString(),
      };
      released += 1;
      totalReleasedCents += priceCents;
    } catch (err) {
      console.warn("[releaseHeldPeladaPayments] transfer:", matchId, payerId, err);
    }
  }

  if (released > 0) {
    await ref.set(
      { peladaPayments: payments, savedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
    console.log(`[releaseHeldPeladaPayments] ${matchId}: ${released} pagamento(s) libertados.`);

    const title = String(match.title ?? "pelada");
    await notifyUser(organizerId, {
      id: `released-${matchId}`,
      priority: "center",
      type: "match",
      title: "Dinheiro na Caixa",
      body: `«${title}» concluída — ${formatEuroCents(totalReleasedCents)} enviados para a tua Caixa (${released} pagamentos).`,
      link: "/perfil",
    });
  }

  return released;
}

export const releasePeladaPaymentsOnMatchComplete = onDocumentUpdated(
  {
    document: "matches/{matchId}",
    region: REGION,
    secrets: [stripeSecretKey],
  },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after || before.status === after.status) return;
    if (after.status !== "concluida" || after.paymentsEnabled !== true) return;

    const stripe = createStripeClient(stripeSecretKey.value());
    const db = getFirestore();
    await releaseHeldPeladaPayments(stripe, db, event.params.matchId);
  },
);

export async function markPlayerPaidFromSession(
  session: Stripe.Checkout.Session,
): Promise<void> {
  const { matchId, uid, organizerAccountId } = (session.metadata ?? {}) as Record<string, string>;
  if (!matchId || !uid) return;

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? "";
  const amountCents = session.amount_total ?? 0;
  const organizerPriceCents = Math.max(0, amountCents - PLAYER_FEE_CENTS);

  const db = getFirestore();
  const userSnap = await db.doc(`users/${uid}`).get();
  const user = userSnap.data() ?? {};

  await db.runTransaction(async (tx) => {
    const ref = db.doc(`matches/${matchId}`);
    const snap = await tx.get(ref);
    applyPeladaPlayerPaidInTx(tx, ref, snap, uid, user, {
      sessionId: session.id,
      paymentIntentId,
      amountCents,
      paidVia: "app",
      organizerPriceCents,
      releasedToOrganizer: false,
      organizerAccountId: organizerAccountId || undefined,
    });
  });
  console.log(`[stripeWebhook] pelada ${matchId}: ${uid} pago e confirmado.`);
  await notifyOrganizerPaymentReceived(matchId, uid);
}

async function handlePeladaCheckoutSession(session: Stripe.Checkout.Session): Promise<void> {
  if (session.mode !== "payment" || session.metadata?.kind !== "pelada") return;
  if (session.payment_status !== "paid") {
    const { matchId, uid } = (session.metadata ?? {}) as Record<string, string>;
    console.log(
      "[stripeWebhook] pelada checkout pendente (pagamento assíncrono):",
      session.id,
      "matchId=",
      matchId ?? "?",
      "uid=",
      uid ?? "?",
      "status=",
      session.payment_status,
    );
    return;
  }
  await markPlayerPaidFromSession(session);
}

/** @deprecated use releasePeladaPaymentsOnMatchComplete */
export const releasePeladaPaymentsOnMatchLive = releasePeladaPaymentsOnMatchComplete;

/** Paga pelada com saldo — valor retido até a pelada ser concluída */
export const payPeladaWithBalance = onCall(
  { ...callableBase({ secrets: [stripeSecretKey] }) },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Inicia sessão.");
    await assertRateLimit(uid, "payPeladaWithBalance", 5, 60);
    const matchId = String(request.data?.matchId ?? "");
    if (!matchId) throw new HttpsError("invalid-argument", "matchId em falta.");

    const db = getFirestore();

    if (await tryApplyMensalistaPeladaPayment(db, matchId, uid)) {
      return { paid: true, mensalista: true, balanceUsedCents: 0, remainingBalanceCents: 0 };
    }

    const matchRef = db.doc(`matches/${matchId}`);
    const userRef = db.doc(`users/${uid}`);
    const matchSnap = await matchRef.get();
    const match = matchSnap.data();
    if (!match) throw new HttpsError("not-found", "Pelada não encontrada.");

    const { priceCents } = assertPeladaPayable(match, uid);
    const organizerId = String(match.organizerId ?? "");
    const accountId = await loadOrganizerStripeAccount(db, organizerId);
    const stripe = createStripeClient(stripeSecretKey.value());
    await assertOrganizerChargesEnabled(stripe, accountId);

    let balanceUsedCents = 0;
    let remainingBalanceCents = 0;

    await db.runTransaction(async (tx) => {
      const [freshMatchSnap, freshUserSnap] = await Promise.all([
        tx.get(matchRef),
        tx.get(userRef),
      ]);
      const freshMatch = freshMatchSnap.data();
      if (!freshMatch) throw new HttpsError("not-found", "Pelada não encontrada.");
      assertPeladaPayable(freshMatch, uid);

      const freshBalance = Number(freshUserSnap.data()?.peladaBalanceCents) || 0;
      if (freshBalance < priceCents) {
        throw new HttpsError("failed-precondition", "Saldo insuficiente.", {
          reason: "INSUFFICIENT_BALANCE",
        });
      }

      balanceUsedCents = priceCents;
      remainingBalanceCents = freshBalance - priceCents;
      tx.update(userRef, {
        peladaBalanceCents: remainingBalanceCents,
        updatedAt: FieldValue.serverTimestamp(),
      });

      const paymentIntentId = `balance_${uid}_${Date.now()}`;
      applyPeladaPlayerPaidInTx(tx, matchRef, freshMatchSnap, uid, freshUserSnap.data() ?? {}, {
        sessionId: "",
        paymentIntentId,
        amountCents: priceCents,
        paidVia: "balance",
        organizerPriceCents: priceCents,
        releasedToOrganizer: false,
        organizerAccountId: accountId,
      });
    });

    console.log(`[payPeladaWithBalance] ${matchId}: ${uid} usou ${balanceUsedCents}c (retido até concluída).`);
    await notifyOrganizerPaymentReceived(matchId, uid);
    return { paid: true, balanceUsedCents, remainingBalanceCents };
  },
);

/** Sai da pelada e credita o preço ao saldo — reverte a transferência do organizador */
export const leavePeladaWithBalanceCredit = onCall(
  { ...callableBase({ secrets: [stripeSecretKey] }) },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Inicia sessão.");
    await assertRateLimit(uid, "leavePeladaWithBalanceCredit", 5, 60);
    const matchId = String(request.data?.matchId ?? "");
    if (!matchId) throw new HttpsError("invalid-argument", "matchId em falta.");

    const db = getFirestore();
    const matchRef = db.doc(`matches/${matchId}`);
    const matchSnap = await matchRef.get();
    const data = matchSnap.data();
    if (!data) throw new HttpsError("not-found", "Pelada não encontrada.");
    if (String(data.organizerId ?? "") === uid) {
      throw new HttpsError("permission-denied", "O organizador não pode sair da própria pelada.");
    }

    const priceCents = parsePriceCents(data.price) ?? 0;
    const peladaPayments: Array<Record<string, unknown>> = Array.isArray(data.peladaPayments)
      ? (data.peladaPayments as Array<Record<string, unknown>>)
      : [];
    const payIdx = peladaPayments.findIndex(
      (p) =>
        p.userId === uid &&
        p.creditedToBalance !== true &&
        p.refunded !== true,
    );
    const payment = payIdx >= 0 ? peladaPayments[payIdx] : null;

    let reversalForReconciliation: { transferId: string; amountCents: number } | null = null;

    if (payment && priceCents > 0 && paymentWasReleasedToOrganizer(payment)) {
      const stripe = createStripeClient(stripeSecretKey.value());
      const paidVia = String(payment.paidVia ?? "app");
      try {
        let transferId = String(payment.stripeTransferId ?? "");
        if (!transferId.startsWith("tr_") && paidVia === "app") {
          const piId = String(payment.paymentIntentId ?? "");
          if (piId.startsWith("pi_")) {
            transferId = (await getChargeTransferId(stripe, piId)) ?? "";
          }
        }
        if (transferId.startsWith("tr_")) {
          await reverseOrganizerPeladaTransfer(
            stripe,
            transferId,
            priceCents,
            paidVia === "balance" ? "player_left_balance" : "player_left_credit",
          );
          reversalForReconciliation = { transferId, amountCents: priceCents };
        }
      } catch (err) {
        const msg = stripeErrorMessage(err);
        throw new HttpsError(
          "failed-precondition",
          msg ||
            "Não foi possível libertar o valor na Caixa do organizador. Tenta mais tarde ou contacta o suporte.",
        );
      }
    }

    let creditedCents = 0;
    let shouldPromote = false;

    try {
      await db.runTransaction(async (tx) => {
      const userRef = db.doc(`users/${uid}`);
      const [freshMatchSnap, userSnap] = await Promise.all([tx.get(matchRef), tx.get(userRef)]);
      const freshData = freshMatchSnap.data();
      if (!freshData) throw new HttpsError("not-found", "Pelada não encontrada.");

      let players: Array<Record<string, unknown>> = Array.isArray(freshData.players)
        ? [...(freshData.players as Array<Record<string, unknown>>)]
        : [];
      let waitlist: Array<Record<string, unknown>> = Array.isArray(freshData.waitlist)
        ? [...(freshData.waitlist as Array<Record<string, unknown>>)]
        : [];
      const playerTeams = {
        ...(typeof freshData.playerTeams === "object" && freshData.playerTeams
          ? (freshData.playerTeams as Record<string, unknown>)
          : {}),
      };
      const assignments = {
        ...(typeof freshData.assignments === "object" && freshData.assignments
          ? (freshData.assignments as Record<string, unknown>)
          : {}),
      };
      let paidUserIds: string[] = Array.isArray(freshData.paidUserIds)
        ? [...(freshData.paidUserIds as string[])]
        : [];
      let payments: Array<Record<string, unknown>> = Array.isArray(freshData.peladaPayments)
        ? [...(freshData.peladaPayments as Array<Record<string, unknown>>)]
        : [];

      const wlIdx = waitlist.findIndex((w) => w.userId === uid);
      if (wlIdx >= 0) {
        waitlist.splice(wlIdx, 1);
        tx.update(matchRef, { waitlist, savedAt: FieldValue.serverTimestamp() });
        return;
      }

      const pIdx = players.findIndex((pl) => pl.userId === uid || pl.id === uid);
      const wasOnPaidList = paidUserIds.includes(uid);
      if (pIdx < 0 && !wasOnPaidList) return;

      if (pIdx >= 0) {
        const removedId = String(players[pIdx].id ?? uid);
        players = players.filter((_, i) => i !== pIdx);
        delete playerTeams[removedId];
        for (const key of Object.keys(assignments)) {
          if (assignments[key] === removedId) assignments[key] = null;
        }
        shouldPromote = true;
      }

      paidUserIds = paidUserIds.filter((id) => id !== uid);

      const freshPayIdx = payments.findIndex(
        (p) =>
          p.userId === uid &&
          p.creditedToBalance !== true &&
          p.refunded !== true,
      );
      if (freshPayIdx >= 0 && priceCents > 0) {
        creditedCents = priceCents;
        payments[freshPayIdx] = {
          ...payments[freshPayIdx],
          creditedToBalance: true,
          creditedAt: new Date().toISOString(),
        };
        const currentBalance = Number(userSnap.data()?.peladaBalanceCents) || 0;
        tx.update(userRef, {
          peladaBalanceCents: currentBalance + creditedCents,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      const participantUserIds = (Array.isArray(freshData.participantUserIds)
        ? (freshData.participantUserIds as string[])
        : []
      ).filter((id) => id !== uid);

      tx.update(matchRef, {
        players,
        waitlist,
        playerTeams,
        assignments,
        paidUserIds,
        peladaPayments: payments,
        participantUserIds,
        savedAt: FieldValue.serverTimestamp(),
      });
      });
    } catch (err) {
      if (reversalForReconciliation) {
        await db.collection("billingReconciliation").add({
          matchId,
          uid,
          transferId: reversalForReconciliation.transferId,
          amountCents: reversalForReconciliation.amountCents,
          reason: "reversal_ok_tx_failed",
          createdAt: FieldValue.serverTimestamp(),
        });
        console.error("[leavePeladaWithBalanceCredit] reversal ok, tx failed:", err);
      }
      throw err;
    }

    if (shouldPromote) {
      await promoteWaitlistAfterLeave(db, matchId);
    }

    const organizerId = String(data.organizerId ?? "");
    const matchTitle = String(data.title ?? "pelada");
    const hadActivePayment =
      payment != null &&
      priceCents > 0 &&
      (payment.creditedToBalance !== true && payment.refunded !== true);
    if (organizerId && hadActivePayment) {
      const playerName = await loadUserDisplayName(uid);
      let body = `${playerName} saiu de «${matchTitle}» — vaga aberta.`;
      if (reversalForReconciliation) {
        body += " O valor voltou da tua Caixa para a plataforma.";
      }
      await notifyUser(organizerId, {
        id: `left-${matchId}-${uid}`,
        priority: "center",
        type: "match",
        title: "Jogador saiu",
        body,
        link: `/partida/${matchId}/pre-jogo`,
      });
    }

    return { creditedCents };
  },
);

/** Cancela pelada — credita pagamentos ao saldo interno dos jogadores */
async function cancelPeladaWithBalanceCreditsHandler(
  request: { auth?: { uid?: string }; data?: { matchId?: string } },
): Promise<{ credited: number; refunded: number }> {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Inicia sessão.");
  await assertRateLimit(uid, "cancelPeladaWithBalanceCredits", 3, 60);
  const matchId = String(request.data?.matchId ?? "");
  if (!matchId) throw new HttpsError("invalid-argument", "matchId em falta.");

  const db = getFirestore();
  const ref = db.doc(`matches/${matchId}`);
  const snap = await ref.get();
  const match = snap.data();
  if (!match) throw new HttpsError("not-found", "Pelada não encontrada.");
  if (String(match.organizerId ?? "") !== uid) {
    throw new HttpsError("permission-denied", "Só o organizador pode cancelar.");
  }

  const status = String(match.status ?? "configurando");
  if (status !== "configurando" && status !== "ao_vivo") {
    throw new HttpsError("failed-precondition", "Só podes cancelar em preparação ou ao vivo.");
  }

  const stripe = createStripeClient(stripeSecretKey.value());
  const payments: Array<Record<string, unknown>> = Array.isArray(match.peladaPayments)
    ? [...(match.peladaPayments as Array<Record<string, unknown>>)]
    : [];

  let credited = 0;
  const creditedByPayer = new Map<string, number>();

  for (let i = 0; i < payments.length; i++) {
    const payment = payments[i];
    if (payment.refunded === true || payment.creditedToBalance === true) continue;
    if (payment.paidVia === "mensalista" || payment.method === "mensalista") continue;

    const payerId = String(payment.userId ?? "");
    const priceCents = peladaPriceFromPayment(payment, match.price);
    if (!payerId || priceCents <= 0) continue;

    if (paymentWasReleasedToOrganizer(payment)) {
      let transferId = String(payment.stripeTransferId ?? "");
      if (!transferId.startsWith("tr_") && String(payment.paidVia ?? "app") === "app") {
        const piId = String(payment.paymentIntentId ?? "");
        if (piId.startsWith("pi_")) {
          try {
            transferId = (await getChargeTransferId(stripe, piId)) ?? "";
          } catch (err) {
            console.warn("[cancelPeladaWithBalanceCredits] resolve transfer:", piId, err);
          }
        }
      }
      if (transferId.startsWith("tr_")) {
        try {
          await reverseOrganizerPeladaTransfer(
            stripe,
            transferId,
            priceCents,
            "organizer_cancel",
          );
        } catch (err) {
          console.warn("[cancelPeladaWithBalanceCredits] reversal:", transferId, err);
        }
      }
    }

    await db.runTransaction(async (tx) => {
      const userRef = db.doc(`users/${payerId}`);
      const userSnap = await tx.get(userRef);
      const bal = Number(userSnap.data()?.peladaBalanceCents) || 0;
      tx.update(userRef, {
        peladaBalanceCents: bal + priceCents,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    payments[i] = {
      ...payment,
      creditedToBalance: true,
      creditedAt: new Date().toISOString(),
    };
    credited += 1;
    creditedByPayer.set(payerId, (creditedByPayer.get(payerId) ?? 0) + priceCents);
  }

  await ref.set(
    {
      status: "cancelada",
      peladaPayments: payments,
      savedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  const matchTitle = String(match.title ?? "pelada");
  const organizerId = String(match.organizerId ?? "");
  const notifyTargets = new Set<string>();
  const participantUserIds: string[] = Array.isArray(match.participantUserIds)
    ? match.participantUserIds
    : [];
  const paidUserIds: string[] = Array.isArray(match.paidUserIds) ? match.paidUserIds : [];
  for (const id of [...participantUserIds, ...paidUserIds]) {
    if (id && id !== organizerId) notifyTargets.add(id);
  }

  await Promise.allSettled(
    [...notifyTargets].map(async (playerId) => {
      const creditCents = creditedByPayer.get(playerId) ?? 0;
      let body = `«${matchTitle}» foi cancelada.`;
      if (creditCents > 0) {
        body += ` ${formatEuroCents(creditCents)} creditados ao teu saldo para o próximo jogo.`;
      }
      await notifyUser(playerId, {
        id: `cancel-${matchId}`,
        priority: "popup",
        type: "match",
        title: "Pelada cancelada",
        body,
        link: "/jogos",
      });
    }),
  );

  return { credited, refunded: credited };
}

export const cancelPeladaWithBalanceCredits = onCall(
  { ...callableBase({ secrets: [stripeSecretKey] }) },
  cancelPeladaWithBalanceCreditsHandler,
);

/** @deprecated use cancelPeladaWithBalanceCredits */
export const cancelPeladaWithRefunds = onCall(
  { ...callableBase({ secrets: [stripeSecretKey] }) },
  cancelPeladaWithBalanceCreditsHandler,
);
