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
import { defineSecret } from "firebase-functions/params";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import Stripe from "stripe";

const stripeSecretKey = defineSecret("STRIPE_SECRET_KEY");
const stripeWebhookSecret = defineSecret("STRIPE_WEBHOOK_SECRET");

const REGION = "europe-west1";
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

export const createCheckoutSession = onCall(
  { region: REGION, secrets: [stripeSecretKey] },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Inicia sessão para assinar o PRO.");

    const plan = request.data?.plan as Plan;
    const interval = (request.data?.interval as Interval) ?? "month";
    if (plan !== "player_pro" && plan !== "organizer_pro") {
      throw new HttpsError("invalid-argument", "Plano inválido.");
    }
    if (interval !== "month" && interval !== "year") {
      throw new HttpsError("invalid-argument", "Intervalo inválido.");
    }

    const stripe = new Stripe(stripeSecretKey.value());
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
      subscription_data: { metadata: { firebaseUid: uid, plan } },
      allow_promotion_codes: true,
      success_url: `${origin}/premium?checkout=sucesso`,
      cancel_url: `${origin}/premium?checkout=cancelado`,
    });

    if (!session.url) throw new HttpsError("internal", "Stripe não devolveu URL.");
    return { url: session.url };
  },
);

export const createPortalSession = onCall(
  { region: REGION, secrets: [stripeSecretKey] },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Inicia sessão.");

    const customerId = (await getFirestore().doc(`users/${uid}`).get()).data()
      ?.stripeCustomerId;
    if (typeof customerId !== "string") {
      throw new HttpsError("failed-precondition", "Sem assinatura associada a esta conta.");
    }

    const stripe = new Stripe(stripeSecretKey.value());
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${safeOrigin(request.data?.origin)}/premium`,
    });
    return { url: session.url };
  },
);

/** Concede/atualiza/revoga entitlements a partir da subscrição */
async function applySubscription(sub: Stripe.Subscription): Promise<void> {
  const uid = sub.metadata?.firebaseUid;
  if (!uid) {
    console.warn("[stripeWebhook] subscrição sem firebaseUid:", sub.id);
    return;
  }
  const plan: Plan = sub.metadata?.plan === "organizer_pro" ? "organizer_pro" : "player_pro";
  const active = sub.status === "active" || sub.status === "trialing";
  const periodEnd = sub.current_period_end ?? null;

  await getFirestore()
    .doc(`users/${uid}`)
    .set(
      {
        entitlements: active
          ? {
              pro: true,
              plan,
              proUntil: periodEnd
                ? new Date(periodEnd * 1000).toISOString()
                : null,
            }
          : { pro: false },
        stripeSubscriptionId: sub.id,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  console.log(`[stripeWebhook] entitlements ${active ? "ativos" : "revogados"} para ${uid} (${plan})`);
}

export const stripeWebhook = onRequest(
  { region: REGION, secrets: [stripeSecretKey, stripeWebhookSecret] },
  async (req, res) => {
    const stripe = new Stripe(stripeSecretKey.value());
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
            await markPlayerPaidFromSession(session);
          }
          if (session.mode === "subscription" && session.subscription) {
            const sub = await stripe.subscriptions.retrieve(
              session.subscription as string,
            );
            await applySubscription(sub);
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
const ORG_NO_FEE_CAP = 50; // pagamentos/mês isentos no PRO Organizador

function parsePriceCents(price: unknown): number | null {
  if (typeof price !== "string") return null;
  const value = parseFloat(price.replace(",", ".").replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(value) || value <= 0) return null;
  const cents = Math.round(value * 100);
  return cents >= 50 && cents <= 50000 ? cents : null;
}

function monthKey(): string {
  return new Date().toISOString().slice(0, 7); // YYYY-MM
}

/** Onboarding Stripe Connect Express do organizador */
export const createConnectOnboarding = onCall(
  { region: REGION, secrets: [stripeSecretKey] },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Inicia sessão.");

    const stripe = new Stripe(stripeSecretKey.value());
    const db = getFirestore();
    const userRef = db.doc(`users/${uid}`);
    let accountId = (await userRef.get()).data()?.stripeAccountId;

    if (typeof accountId !== "string" || !accountId.startsWith("acct_")) {
      const account = await stripe.accounts.create({
        type: "express",
        country: "PT",
        metadata: { firebaseUid: uid },
      });
      accountId = account.id;
      await userRef.set({ stripeAccountId: accountId }, { merge: true });
    }

    const origin = safeOrigin(request.data?.origin);
    const link = await stripe.accountLinks.create({
      account: accountId,
      type: "account_onboarding",
      refresh_url: `${origin}/perfil?stripe=recomecar`,
      return_url: `${origin}/perfil?stripe=ligado`,
    });
    return { url: link.url };
  },
);

/** Checkout de UMA pelada: preço → organizador; taxa → plataforma */
export const createPeladaCheckout = onCall(
  { region: REGION, secrets: [stripeSecretKey] },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Inicia sessão.");
    const matchId = String(request.data?.matchId ?? "");
    if (!matchId) throw new HttpsError("invalid-argument", "matchId em falta.");

    const db = getFirestore();
    const matchSnap = await db.doc(`matches/${matchId}`).get();
    const match = matchSnap.data();
    if (!match) throw new HttpsError("not-found", "Pelada não encontrada.");
    if (match.paymentsEnabled !== true) {
      throw new HttpsError("failed-precondition", "Esta pelada não aceita pagamentos na app.");
    }
    const participantIds: string[] = Array.isArray(match.participantUserIds)
      ? match.participantUserIds
      : [];
    if (!participantIds.includes(uid)) {
      throw new HttpsError("permission-denied", "Confirma presença antes de pagar.");
    }
    const players: Array<{ userId?: string; paid?: boolean }> = Array.isArray(match.players)
      ? match.players
      : [];
    if (players.find((pl) => pl.userId === uid)?.paid === true) {
      throw new HttpsError("already-exists", "Já está pago. ✅");
    }

    const priceCents = parsePriceCents(match.price);
    if (!priceCents) {
      throw new HttpsError("failed-precondition", "Preço da pelada inválido para pagamentos.");
    }

    const organizerId = String(match.organizerId ?? "");
    const orgSnap = await db.doc(`users/${organizerId}`).get();
    const org = orgSnap.data() ?? {};
    const accountId = org.stripeAccountId;
    if (typeof accountId !== "string") {
      throw new HttpsError("failed-precondition", "O organizador ainda não ligou a conta de pagamentos.");
    }

    const stripe = new Stripe(stripeSecretKey.value());
    const account = await stripe.accounts.retrieve(accountId);
    if (!account.charges_enabled) {
      throw new HttpsError("failed-precondition", "A conta do organizador ainda está em verificação no Stripe.");
    }

    // Sem-taxa: organizador PRO dentro do teto mensal → jogador paga só o preço
    let waived = false;
    if (isOrganizerProEnt(org.entitlements)) {
      const counter = await db.doc(`users/${organizerId}/billingCounters/${monthKey()}`).get();
      waived = Number(counter.data()?.waivedCount ?? 0) < ORG_NO_FEE_CAP;
    }
    const feeCents = waived ? 0 : PLAYER_FEE_CENTS;
    const totalCents = priceCents + feeCents;

    const origin = safeOrigin(request.data?.origin);
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
              description: waived
                ? "Sem taxa de serviço (organizador PRO)"
                : "Inclui 0,50€ de taxa de serviço",
            },
          },
        },
      ],
      payment_intent_data: {
        application_fee_amount: feeCents,
        transfer_data: { destination: accountId },
        metadata: { kind: "pelada", matchId, uid, organizerId, waived: String(waived) },
      },
      metadata: { kind: "pelada", matchId, uid, organizerId, waived: String(waived) },
      success_url: `${origin}/partida/${matchId}/pre-jogo?pagamento=sucesso`,
      cancel_url: `${origin}/partida/${matchId}/pre-jogo?pagamento=cancelado`,
    });

    if (!session.url) throw new HttpsError("internal", "Stripe não devolveu URL.");
    return { url: session.url, totalCents, waived };
  },
);

function isOrganizerProEnt(ent: unknown): boolean {
  if (!ent || typeof ent !== "object") return false;
  const e = ent as { pro?: boolean; plan?: string; proUntil?: string };
  if (!e.pro || e.plan !== "organizer_pro") return false;
  if (e.proUntil && Date.now() >= new Date(e.proUntil).getTime()) return false;
  return true;
}

/** Marca o jogador como pago no doc da pelada (chamado pelo webhook) */
export async function markPlayerPaidFromSession(
  session: Stripe.Checkout.Session,
): Promise<void> {
  const { matchId, uid, organizerId, waived } = (session.metadata ?? {}) as Record<string, string>;
  if (!matchId || !uid) return;

  const db = getFirestore();
  await db.runTransaction(async (tx) => {
    const ref = db.doc(`matches/${matchId}`);
    const snap = await tx.get(ref);
    const players: Array<Record<string, unknown>> = Array.isArray(snap.data()?.players)
      ? [...(snap.data()!.players as Array<Record<string, unknown>>)]
      : [];
    const idx = players.findIndex((pl) => pl.userId === uid);
    if (idx === -1) return;
    players[idx] = { ...players[idx], paid: true, paidVia: "app", paidAt: new Date().toISOString() };
    tx.update(ref, { players, savedAt: FieldValue.serverTimestamp() });

    if (waived === "true" && organizerId) {
      tx.set(
        db.doc(`users/${organizerId}/billingCounters/${monthKey()}`),
        { waivedCount: FieldValue.increment(1) },
        { merge: true },
      );
    }
  });
  console.log(`[stripeWebhook] pelada ${matchId}: ${uid} marcado como pago (waived=${waived}).`);
}
