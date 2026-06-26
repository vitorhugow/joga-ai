/**
 * closeExpiredMatches.ts — Firebase Cloud Function (Opção B)
 *
 * Executa a cada hora via Cloud Scheduler.
 * Fecha partidas cujo `expiresAt` já passou e status ainda não é
 * "concluida" nem "expirada".
 *
 * Deploy:
 *   cd functions
 *   npm install firebase-admin firebase-functions
 *   firebase deploy --only functions
 *
 * Necessário: Firebase Blaze plan (funções requerem billing activado).
 */

// NOTE: este ficheiro é um stub — não é compilado pelo tsconfig do frontend.
// Para activar, inicializa o projecto functions com `firebase init functions`.

/*
import * as functions from "firebase-functions/v2";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { initializeApp } from "firebase-admin/app";

initializeApp();

export const closeExpiredMatches = functions.scheduler.onSchedule(
  { schedule: "every 60 minutes", timeZone: "Europe/Lisbon" },
  async () => {
    const db = getFirestore();
    const now = Timestamp.now();

    const snap = await db
      .collection("matches")
      .where("expiresAt", "<", now)
      .where("status", "not-in", ["concluida", "expirada"])
      .get();

    if (snap.empty) {
      console.log("[closeExpiredMatches] Nenhuma partida a fechar.");
      return;
    }

    const batch = db.batch();
    snap.docs.forEach((doc) => {
      batch.update(doc.ref, {
        status: "expirada",
        closedAt: now,
      });
    });

    await batch.commit();
    console.log(`[closeExpiredMatches] Fechadas ${snap.size} partidas expiradas.`);
  },
);
*/

export {};
