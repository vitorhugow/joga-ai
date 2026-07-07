/**
 * closeExpiredMatches — corre de hora a hora e fecha partidas cujo
 * `expiresAt` já passou e ainda não estão num estado terminal.
 *
 * Nota: a app grava expiresAt como string ISO (não Timestamp), por isso
 * a comparação é feita em ISO. O filtro de status é em código para não
 * exigir um índice composto (volume de partidas abertas é pequeno).
 */

import { onSchedule } from "firebase-functions/v2/scheduler";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const TERMINAL = new Set(["concluida", "expirada", "cancelada"]);

export const closeExpiredMatches = onSchedule(
  { schedule: "every 60 minutes", timeZone: "Europe/Lisbon", region: "europe-west1" },
  async () => {
    const db = getFirestore();
    const nowIso = new Date().toISOString();

    const snap = await db
      .collection("matches")
      .where("expiresAt", "<", nowIso)
      .get();

    const toClose = snap.docs.filter(
      (doc) => !TERMINAL.has(String(doc.data().status ?? "")),
    );

    if (toClose.length === 0) {
      console.log("[closeExpiredMatches] Nenhuma partida a fechar.");
      return;
    }

    const batch = db.batch();
    for (const doc of toClose) {
      batch.update(doc.ref, {
        status: "expirada",
        closedAt: FieldValue.serverTimestamp(),
        savedAt: FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
    console.log(`[closeExpiredMatches] Fechadas ${toClose.length} partidas expiradas.`);
  },
);
