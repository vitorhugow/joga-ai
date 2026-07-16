/**
 * mensalistas.ts — passe mensal: subscrição recorrente no Connect do organizador.
 *
 * DECIDIDO: taxa de plataforma de 5% nas mensalidades (application_fee_percent).
 * Alterar MENSALISTA_FEE_PERCENT NÃO afeta subscrições já criadas no Stripe.
 */

import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import type { Firestore } from "firebase-admin/firestore";
import Stripe from "stripe";
import { callableBase, REGION } from "./callableOptions";
import { assertRateLimit } from "./rateLimit";
import { stripeSecretKey, createStripeClient } from "./stripeClient";
import { notifyUser } from "./notify";

/** DECIDIDO: 5%. Alterar este valor NÃO afeta subscrições já criadas no Stripe — só novas. */
export const MENSALISTA_FEE_PERCENT = 5;

const stripeConnectWebhookSecret = defineSecret("STRIPE_CONNECT_WEBHOOK_SECRET");

const ALLOWED_ORIGINS = new Set([
  "https://jogaai.pt",
  "https://www.jogaai.pt",
  "https://jogaai.geniai.pt",
  "https://joga-ai.pages.dev",
  "http://localhost:5173",
  "http://localhost:4173",
]);

const MIN_MENSALISTA_PRICE_CENTS = 500;

/**
 * DECIDIDO: mensalidade deixou de ser subscrição Stripe recorrente — passa a
 * ser um pagamento avulso que cobre ~30 dias, repetido manualmente todo mês
 * pelo jogador (sem auto-cobrança). Isto é o que permite activar MB WAY no
 * Stripe: MB WAY não funciona em `mode: "subscription"`, só em `payment`.
 * Subscrições ANTERIORES a esta mudança continuam a funcionar como estavam
 * (upsertMensalistaFromSubscription, createMensalistaPortal,
 * scheduleMensalistaCancellations) até o jogador as cancelar — não foram
 * migradas/canceladas automaticamente.
 */
const MENSALISTA_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

type MensalistaDoc = {
  active?: boolean;
  subscriptionId?: string;
  currentPeriodEnd?: string;
  priceCents?: number;
  cancelAtPeriodEnd?: boolean;
  lastPaymentAt?: string;
  updatedAt?: unknown;
};

function safeOrigin(origin: unknown): string {
  return typeof origin === "string" && ALLOWED_ORIGINS.has(origin)
    ? origin
    : "https://jogaai.pt";
}

function periodEndIso(sub: Stripe.Subscription): string | null {
  const end = sub.current_period_end;
  return end ? new Date(end * 1000).toISOString() : null;
}

function isMensalistaPeriodActive(doc: MensalistaDoc | undefined): boolean {
  if (!doc?.active) return false;
  if (!doc.currentPeriodEnd) return true;
  return Date.now() < new Date(doc.currentPeriodEnd).getTime();
}

/** Isenção de pagamento avulso — NÃO depende de communities.proActive. */
export async function isUserMensalistaActive(
  db: Firestore,
  communityId: string,
  uid: string,
): Promise<boolean> {
  if (!communityId || !uid) return false;
  const snap = await db.doc(`communities/${communityId}/mensalistas/${uid}`).get();
  return isMensalistaPeriodActive(snap.data() as MensalistaDoc | undefined);
}

async function loadOrganizerStripeAccount(
  db: Firestore,
  communityId: string,
): Promise<{ organizerId: string; accountId: string }> {
  const communitySnap = await db.doc(`communities/${communityId}`).get();
  const community = communitySnap.data();
  if (!community) throw new HttpsError("not-found", "Comunidade não encontrada.");

  const organizerId = String(community.adminId ?? "");
  if (!organizerId) {
    throw new HttpsError("failed-precondition", "Comunidade sem organizador.");
  }

  const orgSnap = await db.doc(`users/${organizerId}`).get();
  const accountId = orgSnap.data()?.stripeAccountId;
  if (typeof accountId !== "string" || !accountId.startsWith("acct_")) {
    throw new HttpsError("failed-precondition", "O organizador ainda não ligou a Caixa.");
  }

  return { organizerId, accountId };
}

async function assertOrganizerChargesEnabled(stripe: Stripe, accountId: string): Promise<void> {
  const account = await stripe.accounts.retrieve(accountId);
  if (!account.charges_enabled) {
    throw new HttpsError(
      "failed-precondition",
      "A conta do organizador ainda está em verificação no Stripe.",
    );
  }

  // MB WAY exige o capability "mb_way_payments" na própria conta Connect —
  // contas Express não o pedem sozinhas no onboarding (só card_payments +
  // transfers). Sem isto, o MB WAY nunca aparece no checkout desta conta,
  // mesmo que esteja "ativado" no Dashboard da plataforma (esse ativa só a
  // conta da plataforma, não cada conta Connect). Pedido aqui de forma
  // preguiçosa/idempotente para contas já criadas antes deste capability
  // existir no onboarding — ver também organizerAccountParams em billing.ts.
  const capabilities = account.capabilities as Record<string, string> | undefined;
  const mbWayStatus = capabilities?.mb_way_payments;
  if (mbWayStatus !== "active" && mbWayStatus !== "pending") {
    await stripe.accounts.update(accountId, {
      capabilities: { mb_way_payments: { requested: true } },
    } as unknown as Stripe.AccountUpdateParams);
  }
}

async function countActiveMensalistas(db: Firestore, communityId: string): Promise<number> {
  const snap = await db.collection(`communities/${communityId}/mensalistas`).get();
  let count = 0;
  const now = Date.now();
  for (const doc of snap.docs) {
    const data = doc.data() as MensalistaDoc;
    if (!data.active) continue;
    if (data.currentPeriodEnd && now >= new Date(data.currentPeriodEnd).getTime()) continue;
    count += 1;
  }
  return count;
}

async function ensureConnectedCustomer(
  stripe: Stripe,
  accountId: string,
  uid: string,
  email?: string,
  name?: string,
): Promise<string> {
  const db = getFirestore();
  const userRef = db.doc(`users/${uid}`);
  const userSnap = await userRef.get();
  const connectCustomers = (userSnap.data()?.connectCustomers ?? {}) as Record<string, string>;
  const existing = connectCustomers[accountId];
  if (typeof existing === "string" && existing.startsWith("cus_")) {
    return existing;
  }

  const customer = await stripe.customers.create(
    {
      email: email || undefined,
      name: name || undefined,
      metadata: { firebaseUid: uid },
    },
    { stripeAccount: accountId },
  );

  await userRef.set(
    {
      connectCustomers: { ...connectCustomers, [accountId]: customer.id },
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  return customer.id;
}

export const createMensalistaCheckout = onCall(
  { ...callableBase({ secrets: [stripeSecretKey] }) },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Inicia sessão.");
    await assertRateLimit(uid, "createMensalistaCheckout", 10, 60);

    const communityId = String(request.data?.communityId ?? "");
    if (!communityId) throw new HttpsError("invalid-argument", "communityId em falta.");

    const db = getFirestore();
    const communitySnap = await db.doc(`communities/${communityId}`).get();
    const community = communitySnap.data();
    if (!community) throw new HttpsError("not-found", "Comunidade não encontrada.");

    const mensalista = community.mensalista as
      | { enabled?: boolean; priceCents?: number; maxSlots?: number | null }
      | undefined;
    if (!mensalista?.enabled) {
      throw new HttpsError("failed-precondition", "Mensalistas não estão activos nesta comunidade.");
    }

    const priceCents = Number(mensalista.priceCents) || 0;
    if (priceCents < MIN_MENSALISTA_PRICE_CENTS) {
      throw new HttpsError("failed-precondition", "Preço mensal inválido.");
    }

    const memberSnap = await db.doc(`communities/${communityId}/members/${uid}`).get();
    const isAdmin = community.adminId === uid;
    if (!memberSnap.exists && !isAdmin) {
      throw new HttpsError("permission-denied", "Só membros podem subscrever.");
    }

    const existingSnap = await db.doc(`communities/${communityId}/mensalistas/${uid}`).get();
    if (isMensalistaPeriodActive(existingSnap.data() as MensalistaDoc | undefined)) {
      throw new HttpsError("already-exists", "Já és mensalista activo.");
    }

    const { accountId } = await loadOrganizerStripeAccount(db, communityId);
    const stripe = createStripeClient(stripeSecretKey.value());
    await assertOrganizerChargesEnabled(stripe, accountId);

    const maxSlots = mensalista.maxSlots;
    if (maxSlots != null && maxSlots > 0) {
      const activeCount = await countActiveMensalistas(db, communityId);
      if (activeCount >= maxSlots) {
        throw new HttpsError("resource-exhausted", "Não há vagas de mensalista disponíveis.");
      }
    }

    const userSnap = await db.doc(`users/${uid}`).get();
    const user = userSnap.data() ?? {};
    const email =
      (typeof request.auth?.token?.email === "string" && request.auth.token.email) ||
      (typeof user.email === "string" ? user.email : undefined);
    const customerId = await ensureConnectedCustomer(
      stripe,
      accountId,
      uid,
      email,
      String(user.displayName ?? ""),
    );

    const origin = safeOrigin(request.data?.origin);
    const communityName = String(community.name ?? "Comunidade").slice(0, 60);

    // mode: "payment" (não "subscription") — pagamento avulso repetido
    // manualmente todo mês, sem auto-cobrança. É o que permite MB WAY (não
    // suportado em subscrições Stripe). Sem payment_method_types explícito,
    // o Stripe mostra automaticamente os métodos activados na conta Connect
    // do organizador (incluindo MB WAY, quando activado no dashboard Stripe).
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        customer: customerId,
        client_reference_id: uid,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "eur",
              unit_amount: priceCents,
              product_data: {
                name: `Mensalidade — ${communityName}`,
                description: "Passe mensal: isento de pagamento por pelada nesta comunidade durante ~30 dias.",
              },
            },
          },
        ],
        payment_intent_data: {
          application_fee_amount: Math.round((priceCents * MENSALISTA_FEE_PERCENT) / 100),
          metadata: {
            kind: "mensalista",
            communityId,
            uid,
          },
        },
        metadata: {
          kind: "mensalista",
          communityId,
          uid,
        },
        success_url: `${origin}/comunidades/${communityId}?mensalista=sucesso`,
        cancel_url: `${origin}/comunidades/${communityId}?mensalista=cancelado`,
      },
      { stripeAccount: accountId },
    );

    if (!session.url) throw new HttpsError("internal", "Stripe não devolveu URL.");
    return { url: session.url };
  },
);

export const createMensalistaPortal = onCall(
  { ...callableBase({ secrets: [stripeSecretKey] }) },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Inicia sessão.");
    await assertRateLimit(uid, "createMensalistaPortal", 10, 60);

    const communityId = String(request.data?.communityId ?? "");
    if (!communityId) throw new HttpsError("invalid-argument", "communityId em falta.");

    const db = getFirestore();
    const mensalistaSnap = await db.doc(`communities/${communityId}/mensalistas/${uid}`).get();
    const mensalista = mensalistaSnap.data() as MensalistaDoc | undefined;
    const subscriptionId = mensalista?.subscriptionId;
    if (!subscriptionId) {
      throw new HttpsError("failed-precondition", "Não tens subscrição activa.");
    }

    const { accountId } = await loadOrganizerStripeAccount(db, communityId);
    const stripe = createStripeClient(stripeSecretKey.value());

    const userSnap = await db.doc(`users/${uid}`).get();
    const connectCustomers = (userSnap.data()?.connectCustomers ?? {}) as Record<string, string>;
    const customerId = connectCustomers[accountId];
    if (!customerId) {
      throw new HttpsError("failed-precondition", "Cliente Stripe não encontrado.");
    }

    const origin = safeOrigin(request.data?.origin);
    const portal = await stripe.billingPortal.sessions.create(
      {
        customer: customerId,
        return_url: `${origin}/comunidades/${communityId}`,
      },
      { stripeAccount: accountId },
    );

    return { url: portal.url };
  },
);

async function upsertMensalistaFromSubscription(
  sub: Stripe.Subscription,
  stripeAccountId?: string,
): Promise<void> {
  const meta = sub.metadata ?? {};
  if (meta.kind !== "mensalista") return;

  const communityId = String(meta.communityId ?? "");
  const uid = String(meta.uid ?? "");
  if (!communityId || !uid) {
    console.warn("[mensalistas] subscrição sem communityId/uid:", sub.id);
    return;
  }

  const active = sub.status === "active" || sub.status === "trialing";
  const currentPeriodEnd = periodEndIso(sub);
  const priceCents =
    (sub.items?.data?.[0]?.price?.unit_amount ?? Number(meta.priceCents)) || 0;

  const db = getFirestore();
  const ref = db.doc(`communities/${communityId}/mensalistas/${uid}`);
  const prev = (await ref.get()).data() as MensalistaDoc | undefined;
  const wasActive = isMensalistaPeriodActive(prev);

  await ref.set(
    {
      active,
      subscriptionId: sub.id,
      currentPeriodEnd,
      priceCents,
      cancelAtPeriodEnd: sub.cancel_at_period_end === true,
      stripeAccountId: stripeAccountId ?? null,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  const communitySnap = await db.doc(`communities/${communityId}`).get();
  const communityName = String(communitySnap.data()?.name ?? "comunidade");
  const organizerId = String(communitySnap.data()?.adminId ?? "");

  if (active && !wasActive) {
    await notifyUser(uid, {
      id: `mensalista-on-${communityId}-${uid}`,
      priority: "center",
      type: "community",
      title: "Mensalista activo ✅",
      body: `Estás isento de pagar peladas em «${communityName}» até ${currentPeriodEnd ? new Date(currentPeriodEnd).toLocaleDateString("pt-PT") : "renovação"}.`,
      link: `/comunidades/${communityId}`,
    });
    if (organizerId) {
      const playerName = (await db.doc(`users/${uid}`).get()).data()?.displayName ?? "Jogador";
      await notifyUser(organizerId, {
        id: `mensalista-new-${communityId}-${uid}`,
        priority: "center",
        type: "community",
        title: "Novo mensalista",
        body: `${String(playerName)} subscreveu o passe mensal de «${communityName}».`,
        link: `/comunidades/${communityId}/dashboard`,
      });
    }
  } else if (!active && wasActive) {
    await notifyUser(uid, {
      id: `mensalista-off-${sub.id}`,
      priority: "center",
      type: "community",
      title: "Mensalista terminado",
      body: `A tua mensalidade em «${communityName}» terminou.`,
      link: `/comunidades/${communityId}`,
    });
    if (organizerId) {
      const playerName = (await db.doc(`users/${uid}`).get()).data()?.displayName ?? "Jogador";
      await notifyUser(organizerId, {
        id: `mensalista-cancel-${communityId}-${uid}`,
        priority: "center",
        type: "community",
        title: "Mensalista cancelou",
        body: `${String(playerName)} cancelou a mensalidade em «${communityName}».`,
        link: `/comunidades/${communityId}/dashboard`,
      });
    }
  }
}

/**
 * Pagamento avulso de mensalidade (mode: "payment") confirmado — activa o
 * período de ~30 dias. Sem subscriptionId/cancelAtPeriodEnd: não há nada
 * recorrente para gerir, o jogador volta a pagar manualmente no mês seguinte.
 */
async function handleMensalistaPaymentCompleted(
  session: Stripe.Checkout.Session,
  stripeAccountId: string,
): Promise<void> {
  const communityId = String(session.metadata?.communityId ?? "");
  const uid = String(session.metadata?.uid ?? "");
  if (!communityId || !uid) {
    console.warn("[mensalistas] checkout.session sem communityId/uid:", session.id);
    return;
  }

  const db = getFirestore();
  const communitySnap = await db.doc(`communities/${communityId}`).get();
  const community = communitySnap.data();
  if (!community) return;

  const priceCents = Number(session.amount_total ?? (community.mensalista as { priceCents?: number } | undefined)?.priceCents ?? 0);
  const paidAtIso = new Date().toISOString();
  const currentPeriodEnd = new Date(Date.now() + MENSALISTA_PERIOD_MS).toISOString();

  const ref = db.doc(`communities/${communityId}/mensalistas/${uid}`);
  await ref.set(
    {
      active: true,
      priceCents,
      currentPeriodEnd,
      lastPaymentAt: paidAtIso,
      stripeAccountId,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  const communityName = String(community.name ?? "comunidade");
  const endLabel = new Date(currentPeriodEnd).toLocaleDateString("pt-PT");

  await notifyUser(uid, {
    id: `mensalista-paid-${session.id}`,
    priority: "center",
    type: "community",
    title: "Mensalidade paga ✅",
    body: `Estás isento de pagar peladas em «${communityName}» até ${endLabel}. No próximo mês tens de voltar a pagar.`,
    link: `/comunidades/${communityId}`,
  });

  const organizerId = String(community.adminId ?? "");
  if (organizerId) {
    const playerName = (await db.doc(`users/${uid}`).get()).data()?.displayName ?? "Jogador";
    await notifyUser(organizerId, {
      id: `mensalista-payment-${communityId}-${uid}-${session.id}`,
      priority: "center",
      type: "community",
      title: "Mensalidade recebida",
      body: `${String(playerName)} pagou a mensalidade de «${communityName}».`,
      link: `/comunidades/${communityId}/dashboard`,
    });
  }
}

/** Agenda cancel_at_period_end para todas as subscrições activas da comunidade. */
export async function scheduleMensalistaCancellations(
  communityId: string,
  reason: "pro_revoked" | "disabled",
): Promise<void> {
  const db = getFirestore();
  const communitySnap = await db.doc(`communities/${communityId}`).get();
  const community = communitySnap.data();
  if (!community) return;

  const communityName = String(community.name ?? "comunidade");
  const orgAccount = await loadOrganizerStripeAccount(db, communityId).catch(() => null);
  if (!orgAccount) return;
  const accountId = orgAccount.accountId;

  const stripe = createStripeClient(stripeSecretKey.value());
  const snap = await db.collection(`communities/${communityId}/mensalistas`).get();

  await Promise.allSettled(
    snap.docs.map(async (doc) => {
      const data = doc.data() as MensalistaDoc;
      if (!data.active || !data.subscriptionId) return;
      if (data.cancelAtPeriodEnd) return;

      try {
        const sub = await stripe.subscriptions.update(
          data.subscriptionId,
          { cancel_at_period_end: true },
          { stripeAccount: accountId },
        );
        const endIso = periodEndIso(sub);
        await doc.ref.set(
          {
            cancelAtPeriodEnd: true,
            currentPeriodEnd: endIso,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );

        const endLabel = endIso
          ? new Date(endIso).toLocaleDateString("pt-PT")
          : "fim do período";
        await notifyUser(doc.id, {
          id: `mensalista-end-${communityId}-${doc.id}`,
          priority: "center",
          type: "community",
          title: "Mensalidade a terminar",
          body: `A tua mensalidade em «${communityName}» termina a ${endLabel}. Até lá continuas isento.`,
          link: `/comunidades/${communityId}`,
        });
      } catch (err) {
        console.warn("[mensalistas] cancel_at_period_end:", doc.id, err);
      }
    }),
  );

  console.log(`[mensalistas] cancelamentos agendados (${reason}) em ${communityId}`);
}

function isOrganizerProOnCommunity(
  entitlements: Record<string, unknown> | undefined,
  communityId: string,
): boolean {
  if (!entitlements) return false;
  const organizerPro = entitlements.organizerPro as { active?: boolean; proCommunityId?: string } | undefined;
  if (organizerPro?.active) {
    const club = organizerPro.proCommunityId ?? entitlements.proCommunityId;
    return club === communityId;
  }
  const proCommunities = entitlements.proCommunities as Record<string, { proUntil?: string }> | undefined;
  const slot = proCommunities?.[communityId];
  if (slot?.proUntil) return Date.now() < new Date(slot.proUntil).getTime();
  return entitlements.pro === true && entitlements.plan === "organizer_pro"
    && entitlements.proCommunityId === communityId;
}

/** Guarda definições Clube PRO (mensalista, openToExternal, branding). */
export const updateCommunityClubSettings = onCall(
  { ...callableBase() },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Inicia sessão.");
    await assertRateLimit(uid, "updateCommunityClubSettings", 20, 60);

    const communityId = String(request.data?.communityId ?? "");
    if (!communityId) throw new HttpsError("invalid-argument", "communityId em falta.");

    const db = getFirestore();
    const communityRef = db.doc(`communities/${communityId}`);
    const communitySnap = await communityRef.get();
    const community = communitySnap.data();
    if (!community) throw new HttpsError("not-found", "Comunidade não encontrada.");
    const adminIds: string[] = Array.isArray(community.adminIds) ? community.adminIds : [];
    if (community.adminId !== uid && !adminIds.includes(uid)) {
      throw new HttpsError("permission-denied", "Só um administrador pode alterar.");
    }

    // Clube PRO é da comunidade (subscrição do admin PRINCIPAL) — um admin
    // adicional não tem entitlements próprios, mas continua a poder gerir
    // estas definições enquanto o clube em si estiver PRO.
    const primaryAdminId = String(community.adminId ?? "");
    const primaryAdminSnap = primaryAdminId ? await db.doc(`users/${primaryAdminId}`).get() : null;
    const entitlements = primaryAdminSnap?.data()?.entitlements as Record<string, unknown> | undefined;
    if (!isOrganizerProOnCommunity(entitlements, communityId)) {
      throw new HttpsError("failed-precondition", "Requer Clube PRO activo nesta comunidade.");
    }

    const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    let scheduleCancel = false;

    if (request.data?.mensalista != null) {
      const m = request.data.mensalista as {
        enabled?: boolean;
        priceCents?: number;
        maxSlots?: number | null;
      };
      const priceCents = Math.round(Number(m.priceCents) || 0);
      if (m.enabled && priceCents < MIN_MENSALISTA_PRICE_CENTS) {
        throw new HttpsError("invalid-argument", "Preço mínimo: 5€/mês.");
      }
      const prevEnabled = (community.mensalista as { enabled?: boolean } | undefined)?.enabled === true;
      patch.mensalista = {
        enabled: Boolean(m.enabled),
        priceCents: m.enabled ? priceCents : (community.mensalista as { priceCents?: number })?.priceCents ?? priceCents,
        maxSlots: m.maxSlots ?? null,
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (prevEnabled && !m.enabled) scheduleCancel = true;
    }

    if (typeof request.data?.openToExternal === "boolean") {
      patch.openToExternal = request.data.openToExternal;
    }

    if (request.data?.branding != null) {
      const b = request.data.branding as {
        primaryColor?: string;
        logoUrl?: string;
        bannerUrl?: string;
      };
      const branding: Record<string, string> = {};
      if (typeof b.primaryColor === "string" && /^#[0-9a-fA-F]{6}$/.test(b.primaryColor)) {
        branding.primaryColor = b.primaryColor;
      }
      if (typeof b.logoUrl === "string" && b.logoUrl.startsWith("https://")) {
        branding.logoUrl = b.logoUrl.slice(0, 500);
      }
      if (typeof b.bannerUrl === "string" && b.bannerUrl.startsWith("https://")) {
        branding.bannerUrl = b.bannerUrl.slice(0, 500);
      }
      patch.branding = branding;
    }

    await communityRef.set(patch, { merge: true });

    if (scheduleCancel) {
      await scheduleMensalistaCancellations(communityId, "disabled");
    }

    return { ok: true };
  },
);

export const stripeConnectWebhook = onRequest(
  { region: REGION, secrets: [stripeSecretKey, stripeConnectWebhookSecret] },
  async (req, res) => {
    const stripe = createStripeClient(stripeSecretKey.value());
    const signature = req.headers["stripe-signature"];

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        req.rawBody,
        signature as string,
        stripeConnectWebhookSecret.value(),
      );
    } catch (err) {
      console.error("[stripeConnectWebhook] assinatura inválida:", err);
      res.status(400).send("assinatura inválida");
      return;
    }

    const accountId = event.account;
    if (!accountId) {
      res.status(200).send("ignorado — sem account Connect");
      return;
    }

    try {
      switch (event.type) {
        case "customer.subscription.created":
        case "customer.subscription.updated":
        case "customer.subscription.deleted": {
          // Só subscrições ANTERIORES à mudança para pagamento avulso ainda
          // geram estes eventos — mantido para não deixar cair quem já as tinha.
          const sub = event.data.object as Stripe.Subscription;
          await upsertMensalistaFromSubscription(sub, accountId);
          break;
        }
        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;
          if (session.mode === "payment" && session.metadata?.kind === "mensalista") {
            await handleMensalistaPaymentCompleted(session, accountId);
          }
          break;
        }
        case "invoice.payment_failed": {
          const invoice = event.data.object as Stripe.Invoice;
          const subRef = invoice.subscription;
          const subId = typeof subRef === "string" ? subRef : subRef?.id;
          if (!subId) break;

          const sub = await stripe.subscriptions.retrieve(subId, {
            stripeAccount: accountId,
          });
          if (sub.metadata?.kind !== "mensalista") break;

          const uid = String(sub.metadata.uid ?? "");
          const communityId = String(sub.metadata.communityId ?? "");
          if (!uid) break;

          await notifyUser(uid, {
            id: `mensalista-payfail-${subId}`,
            priority: "popup",
            type: "community",
            title: "Mensalidade falhou",
            body: "Actualiza o método de pagamento para manter o passe mensal.",
            link: communityId ? `/comunidades/${communityId}` : "/comunidades",
          });
          break;
        }
        default:
          break;
      }
      res.status(200).send("ok");
    } catch (err) {
      console.error("[stripeConnectWebhook] erro:", event.type, err);
      res.status(500).send("erro interno");
    }
  },
);
