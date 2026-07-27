/**
 * matchAdmin.ts — acções administrativas sobre partidas (painel /admin).
 * Usa Admin SDK para poder actuar em qualquer partida, independentemente do
 * organizador — as firestore.rules só deixam o organizador editar o `status`.
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { callableBase } from "./callableOptions";

/** Mesmo critério de isAppAdmin() nas firestore.rules. */
const APP_ADMIN_UID = "KrnnjgKclcPJm4In4W9ORp3iX6j2";
const APP_ADMIN_EMAIL = "vh.santos.nunes@gmail.com";

async function isAppAdmin(uid: string, email: string | undefined): Promise<boolean> {
  if (uid === APP_ADMIN_UID) return true;
  if (email === APP_ADMIN_EMAIL) return true;
  const adminsSnap = await getFirestore().doc("appConfig/admins").get();
  const uids: string[] = Array.isArray(adminsSnap.data()?.uids) ? adminsSnap.data()!.uids : [];
  return uids.includes(uid);
}

/**
 * Reabre uma partida para votação sem tocar nas estatísticas já registadas
 * (miniGames, players, votedUserIds, votes/*). Usada quando a partida foi
 * finalizada/expirada antes de os jogadores conseguirem votar.
 */
export const reopenMatchForVoting = onCall(callableBase(), async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Inicia sessão.");
  if (!(await isAppAdmin(uid, request.auth?.token.email))) {
    throw new HttpsError("permission-denied", "Só administradores da app podem reabrir partidas.");
  }

  const matchId = String(request.data?.matchId ?? "").trim();
  if (!matchId) throw new HttpsError("invalid-argument", "matchId em falta.");

  const db = getFirestore();
  const matchRef = db.doc(`matches/${matchId}`);
  const matchSnap = await matchRef.get();
  if (!matchSnap.exists) throw new HttpsError("not-found", "Partida não encontrada.");

  const previousStatus = String(matchSnap.data()?.status ?? "");

  await matchRef.update({
    status: "aguardando_auditoria",
    closedAt: FieldValue.delete(),
    savedAt: FieldValue.serverTimestamp(),
  });

  const resultRef = db.doc(`matches/${matchId}/summary/result`);
  const resultSnap = await resultRef.get();
  if (resultSnap.exists && resultSnap.data()?.ratingsReleased === true) {
    await resultRef.set({ ratingsReleased: false }, { merge: true });
  }

  return { ok: true, previousStatus };
});
