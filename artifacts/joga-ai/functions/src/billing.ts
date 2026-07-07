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
    : "https://jogaai.geniai.pt";
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
