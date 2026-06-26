/**
 * liveMatchRepository.ts
 *
 * Escrita de eventos e mini-games ao vivo no Firestore.
 * Subcoleções: matches/{matchId}/events  e  matches/{matchId}/miniGames
 *
 * A lógica ao vivo continua em memória no componente AoVivo.tsx;
 * este módulo adiciona persistência Firestore por cima (fire-and-forget).
 */

import {
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db, isFirebaseConfigured } from "./firebase";

export type LiveEventPayload = {
  type: string;
  playerId: string;
  playerName: string;
  team: string;
  time: string;
  miniGameId: string;
};

export type MiniGamePayload = {
  id: string;
  title: string;
  homeTeam: string;
  awayTeam: string;
  scoreA: number;
  scoreB: number;
  winner?: string;
  order: number;
};

/** Adiciona um evento ao vivo (golo, assistência, etc.) */
export async function addLiveEvent(
  matchId: string,
  event: LiveEventPayload,
): Promise<void> {
  if (!isFirebaseConfigured()) return;

  try {
    await addDoc(collection(db, "matches", matchId, "events"), {
      ...event,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn("[liveMatchRepository] addLiveEvent:", err);
  }
}

/** Remove um evento ao vivo pelo id */
export async function removeLiveEvent(
  matchId: string,
  eventFirestoreId: string,
): Promise<void> {
  if (!isFirebaseConfigured()) return;

  try {
    const { deleteDoc } = await import("firebase/firestore");
    const ref = doc(db, "matches", matchId, "events", eventFirestoreId);
    await deleteDoc(ref);
  } catch (err) {
    console.warn("[liveMatchRepository] removeLiveEvent:", err);
  }
}

/** Cria ou actualiza um mini-game */
export async function saveMiniGame(
  matchId: string,
  miniGame: MiniGamePayload,
): Promise<void> {
  if (!isFirebaseConfigured()) return;

  try {
    const ref = doc(db, "matches", matchId, "miniGames", miniGame.id);
    await setDoc(ref, { ...miniGame, updatedAt: serverTimestamp() }, { merge: true });
  } catch (err) {
    console.warn("[liveMatchRepository] saveMiniGame:", err);
  }
}

/** Finaliza um mini-game (adiciona endedAt + resultado) */
export async function finalizeMiniGame(
  matchId: string,
  miniGameId: string,
  result: { scoreA: number; scoreB: number; winner?: string },
): Promise<void> {
  if (!isFirebaseConfigured()) return;

  try {
    const ref = doc(db, "matches", matchId, "miniGames", miniGameId);
    await updateDoc(ref, { ...result, endedAt: serverTimestamp() });
  } catch (err) {
    console.warn("[liveMatchRepository] finalizeMiniGame:", err);
  }
}

/** Actualiza o status de uma partida para "ao_vivo" */
export async function setMatchLive(
  matchId: string,
  organizerId: string,
): Promise<void> {
  if (!isFirebaseConfigured()) return;

  try {
    const ref = doc(db, "matches", matchId);
    await setDoc(
      ref,
      {
        matchId,
        organizerId,
        status: "ao_vivo",
        startedAt: serverTimestamp(),
      },
      { merge: true },
    );
  } catch (err) {
    console.warn("[liveMatchRepository] setMatchLive:", err);
  }
}
