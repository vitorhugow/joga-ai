/**
 * reportRepository — denúncias de utilizadores/comunidades.
 */

import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db, isFirebaseConfigured } from "./firebase";

export type ReportTargetType = "user" | "community";
export type ReportReason =
  | "nome_ofensivo"
  | "foto_inapropriada"
  | "comportamento"
  | "spam"
  | "outro";

export async function submitReport(input: {
  reporterId: string;
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReason;
  details?: string;
}): Promise<void> {
  if (!isFirebaseConfigured()) throw new Error("Firebase não configurado");

  await addDoc(collection(db, "reports"), {
    reporterId: input.reporterId,
    targetType: input.targetType,
    targetId: input.targetId,
    reason: input.reason,
    details: (input.details ?? "").slice(0, 500),
    status: "open",
    createdAt: serverTimestamp(),
  });
}
