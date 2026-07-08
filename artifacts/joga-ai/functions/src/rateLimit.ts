import { HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

/**
 * Rate limit por utilizador + função (transacção Firestore).
 * Doc: rateLimits/{uid}_{fnName}
 */
export async function assertRateLimit(
  uid: string,
  fnName: string,
  maxCalls: number,
  windowSeconds: number,
): Promise<void> {
  if (!uid) return;

  const db = getFirestore();
  const ref = db.doc(`rateLimits/${uid}_${fnName}`);
  const now = Date.now();
  const windowMs = windowSeconds * 1000;

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data();
    const windowStart = Number(data?.windowStart ?? 0);
    let count = Number(data?.count ?? 0);

    if (!windowStart || now - windowStart >= windowMs) {
      tx.set(ref, { count: 1, windowStart: now, updatedAt: FieldValue.serverTimestamp() });
      return;
    }

    if (count >= maxCalls) {
      throw new HttpsError(
        "resource-exhausted",
        "Muitas tentativas — aguarda um pouco.",
      );
    }

    tx.update(ref, {
      count: count + 1,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}
