/**
 * index.ts — ponto de entrada das Cloud Functions do Joga AI.
 *
 * Deploy: cd artifacts/joga-ai && firebase deploy --only functions
 * Requer: plano Blaze no Firebase.
 */

import { initializeApp } from "firebase-admin/app";

initializeApp();

export { createCheckoutSession, createPortalSession, stripeWebhook } from "./billing";
export { closeExpiredMatches } from "./closeExpiredMatches";
