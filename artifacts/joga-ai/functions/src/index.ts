/**
 * index.ts — ponto de entrada das Cloud Functions do Joga AI.
 *
 * Deploy: cd functions && npm install && npm run build
 *         firebase deploy --only functions   (a partir de artifacts/joga-ai)
 * Requer: plano Blaze no Firebase.
 */

import { initializeApp } from "firebase-admin/app";

initializeApp();

export { createCheckoutSession, createPortalSession, stripeWebhook, createConnectOnboarding, createPeladaCheckout, cancelPeladaWithBalanceCredits, cancelPeladaWithRefunds, payPeladaWithBalance, leavePeladaWithBalanceCredit, releasePeladaPaymentsOnMatchComplete } from "./billing";
export { closeExpiredMatches } from "./closeExpiredMatches";
export { paymentReminders } from "./paymentReminders";
export {
  onMatchCreatedNotifyCommunity,
  onMatchUpdatedNotifyChanges,
} from "./matchNotifications";
export {
  onJoinRequestCreatedNotifyAdmin,
  onCommunityMemberRemovedNotify,
} from "./communityNotifications";
export { deleteMyAccount } from "./account";
