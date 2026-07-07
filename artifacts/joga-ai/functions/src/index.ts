/**
 * index.ts — ponto de entrada das Cloud Functions do Joga AI.
 *
 * Deploy: cd functions && npm install && npm run build
 *         firebase deploy --only functions   (a partir de artifacts/joga-ai)
 * Requer: plano Blaze no Firebase.
 */

import { initializeApp } from "firebase-admin/app";

initializeApp();

export { createCheckoutSession, createPortalSession, stripeWebhook } from "./billing";
export { closeExpiredMatches } from "./closeExpiredMatches";
