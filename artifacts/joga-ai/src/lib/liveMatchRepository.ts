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
  onSnapshot,
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

export type LiveEventSnapshot = {
  id: string;
  type: string;
  playerId: string;
  playerName: string;
  team: string;
  time: string;
};

export type LiveMiniGameSnapshot = {
  id: string;
  title: string;
  scoreA: number;
  scoreB: number;
  homeTeam: string;
  awayTeam: string;
  winner: string;
};

/**
 * Estado ao vivo (placar, cronómetro, equipas em jogo) espelhado no documento
 * principal da partida. Só o organizador escreve; qualquer membro que abra a
 * partida lê em tempo real via `subscribeLiveMatchState`.
 */
export type LiveMatchState = {
  scoreA: number;
  scoreB: number;
  activeHomeTeam: string;
  activeAwayTeam: string;
  showNextGamePicker: boolean;
  nextHomeTeam: string;
  nextAwayTeam: string;
  isRunning: boolean;
  seconds: number;
  syncedAtMs: number;
  playerTeams: Record<string, string>;
  events: LiveEventSnapshot[];
  miniGames: LiveMiniGameSnapshot[];
};

/** Escreve o estado ao vivo actual (organizador). */
export async function saveLiveMatchState(
  matchId: string,
  state: LiveMatchState,
): Promise<void> {
  if (!isFirebaseConfigured()) return;

  try {
    const ref = doc(db, "matches", matchId);
    await setDoc(
      ref,
      { live: { ...state, updatedAt: serverTimestamp() } },
      { merge: true },
    );
  } catch (err) {
    console.warn("[liveMatchRepository] saveLiveMatchState:", err);
  }
}

/** Escuta o estado ao vivo em tempo real (qualquer membro). */
export function subscribeLiveMatchState(
  matchId: string,
  callback: (state: LiveMatchState | null) => void,
): () => void {
  if (!isFirebaseConfigured() || !matchId || matchId === "default") {
    return () => {};
  }

  const ref = doc(db, "matches", matchId);
  return onSnapshot(
    ref,
    (snap) => {
      const data = snap.data();
      callback((data?.live as LiveMatchState | undefined) ?? null);
    },
    (err) => {
      console.warn("[liveMatchRepository] subscribeLiveMatchState:", err);
    },
  );
}
