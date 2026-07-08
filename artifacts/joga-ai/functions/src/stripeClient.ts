import Stripe from "stripe";
import { defineSecret } from "firebase-functions/params";

export const stripeSecretKey = defineSecret("STRIPE_SECRET_KEY");

/** Versão pinada pelo stripe@17 — NÃO atualizar para v18+ sem rever applySubscription. */
const STRIPE_API_VERSION = "2025-02-24.acacia" as const;

export function createStripeClient(secretKey: string): Stripe {
  return new Stripe(secretKey, { apiVersion: STRIPE_API_VERSION });
}
