/**
 * account.ts — apagar conta (requisito de lojas).
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue, type Query } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { callableBase } from "./callableOptions";
import { assertRateLimit } from "./rateLimit";
import { createStripeClient, stripeSecretKey } from "./stripeClient";

const OPEN_MATCH_STATUSES = ["configurando", "ao_vivo"];

async function deleteQueryBatch(query: Query): Promise<void> {
  const snap = await query.limit(400).get();
  if (snap.empty) return;
  const db = getFirestore();
  const batch = db.batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
  if (snap.size >= 400) await deleteQueryBatch(query);
}

async function hasBlockingOrganizerMatches(uid: string): Promise<boolean> {
  const db = getFirestore();
  const snap = await db
    .collection("matches")
    .where("organizerId", "==", uid)
    .where("status", "in", OPEN_MATCH_STATUSES)
    .get();

  for (const doc of snap.docs) {
    const match = doc.data();
    if (match.paymentsEnabled !== true) continue;
    const payments: Array<Record<string, unknown>> = Array.isArray(match.peladaPayments)
      ? match.peladaPayments
      : [];
    const hasActivePayment = payments.some(
      (p) => p.creditedToBalance !== true && p.refunded !== true,
    );
    if (hasActivePayment) return true;
  }
  return false;
}

async function hasOwnedCommunityWithMembers(uid: string): Promise<string | null> {
  const db = getFirestore();
  const snap = await db.collection("communities").where("adminId", "==", uid).get();
  for (const doc of snap.docs) {
    const members = await db.collection(`communities/${doc.id}/members`).get();
    if (members.size > 1) {
      return String(doc.data().name ?? "comunidade");
    }
  }
  return null;
}

async function anonymizePastParticipations(uid: string): Promise<void> {
  const db = getFirestore();
  const snap = await db
    .collection("matches")
    .where("participantUserIds", "array-contains", uid)
    .get();

  for (const doc of snap.docs) {
    const match = doc.data();
    const players: Array<Record<string, unknown>> = Array.isArray(match.players)
      ? [...(match.players as Array<Record<string, unknown>>)]
      : [];
    let changed = false;
    for (let i = 0; i < players.length; i++) {
      if (players[i].userId === uid || players[i].id === uid) {
        players[i] = { ...players[i], name: "Ex-jogador" };
        changed = true;
      }
    }
    if (changed) {
      await doc.ref.set(
        { players, savedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
    }
  }
}

async function removeFromCommunities(uid: string): Promise<void> {
  const db = getFirestore();
  const memberSnap = await db.collectionGroup("members").where("userId", "==", uid).get();
  for (const memberDoc of memberSnap.docs) {
    const communityRef = memberDoc.ref.parent.parent;
    if (!communityRef) continue;
    await memberDoc.ref.delete();
    const communitySnap = await communityRef.get();
    if (communitySnap.exists) {
      const count = Math.max(1, Number(communitySnap.data()?.memberCount ?? 1) - 1);
      await communityRef.update({ memberCount: count });
    }
  }
}

async function deleteUserSubcollections(uid: string): Promise<void> {
  const db = getFirestore();
  const userRef = db.doc(`users/${uid}`);
  const subcols = ["notifications", "fcmTokens", "blocked", "matchHistory", "evolution"];
  for (const name of subcols) {
    await deleteQueryBatch(userRef.collection(name));
  }
}

export const deleteMyAccount = onCall(
  { ...callableBase({ secrets: [stripeSecretKey] }) },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Inicia sessão.");

    await assertRateLimit(uid, "deleteMyAccount", 3, 60);

    const confirmForfeitBalance = request.data?.confirmForfeitBalance === true;
    const db = getFirestore();
    const userRef = db.doc(`users/${uid}`);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      throw new HttpsError("not-found", "Conta não encontrada.");
    }
    const user = userSnap.data() ?? {};

    if (await hasBlockingOrganizerMatches(uid)) {
      throw new HttpsError(
        "failed-precondition",
        "Cancela primeiro as tuas peladas com pagamentos.",
      );
    }

    const balance = Number(user.peladaBalanceCents) || 0;
    if (balance > 0 && !confirmForfeitBalance) {
      throw new HttpsError(
        "failed-precondition",
        "Tens saldo de peladas — usa-o ou confirma que aceitas perdê-lo.",
        { reason: "BALANCE_REMAINING", balanceCents: balance },
      );
    }

    const ownedCommunity = await hasOwnedCommunityWithMembers(uid);
    if (ownedCommunity) {
      throw new HttpsError(
        "failed-precondition",
        "Transfere ou apaga a comunidade primeiro.",
        { communityName: ownedCommunity },
      );
    }

    const subId = user.stripeSubscriptionId;
    if (typeof subId === "string" && subId.startsWith("sub_")) {
      try {
        const stripe = createStripeClient(stripeSecretKey.value());
        await stripe.subscriptions.cancel(subId);
      } catch (err) {
        console.warn("[deleteMyAccount] cancel subscription:", subId, err);
      }
    }

    await anonymizePastParticipations(uid);
    await removeFromCommunities(uid);
    await deleteUserSubcollections(uid);
    await userRef.delete();

    try {
      await getAuth().deleteUser(uid);
    } catch (err) {
      console.error("[deleteMyAccount] auth delete:", uid, err);
      throw new HttpsError("internal", "Conta parcialmente apagada — contacta o suporte.");
    }

    return { deleted: true };
  },
);
