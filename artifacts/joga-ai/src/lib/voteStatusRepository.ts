/**
 * Estado de votação — fonte de verdade: Firestore (votes/{uid} + votedUserIds).
 */

import { doc, getDoc, onSnapshot, type Unsubscribe } from "firebase/firestore";
import { db, isFirebaseConfigured } from "./firebase";

/** Verifica se o utilizador já votou nesta partida (Firestore apenas). */
export async function hasUserVoted(matchId: string, userId: string): Promise<boolean> {
  if (!userId || !matchId || matchId === "default") return false;
  if (!isFirebaseConfigured()) return false;

  try {
    const voteSnap = await getDoc(doc(db, "matches", matchId, "votes", userId));
    if (voteSnap.exists()) return true;

    const matchSnap = await getDoc(doc(db, "matches", matchId));
    if (!matchSnap.exists()) return false;

    const votedUserIds: string[] = matchSnap.data()?.votedUserIds ?? [];
    return votedUserIds.includes(userId);
  } catch (err) {
    console.warn("[voteStatusRepository] hasUserVoted:", err);
    return false;
  }
}

/** Observa em tempo real se o utilizador já votou. */
export function subscribeHasUserVoted(
  matchId: string,
  userId: string,
  callback: (voted: boolean) => void,
): Unsubscribe {
  if (!isFirebaseConfigured() || !userId || !matchId || matchId === "default") {
    callback(false);
    return () => {};
  }

  const voteRef = doc(db, "matches", matchId, "votes", userId);
  const matchRef = doc(db, "matches", matchId);
  let voteExists = false;
  let votedOnMatch = false;

  const emit = () => callback(voteExists || votedOnMatch);

  const unsubVote = onSnapshot(
    voteRef,
    (snap) => {
      voteExists = snap.exists();
      emit();
    },
    (err) => {
      console.warn("[voteStatusRepository] subscribeHasUserVoted vote:", err);
      voteExists = false;
      emit();
    },
  );

  const unsubMatch = onSnapshot(
    matchRef,
    (snap) => {
      const ids: string[] = snap.data()?.votedUserIds ?? [];
      votedOnMatch = ids.includes(userId);
      emit();
    },
    (err) => {
      console.warn("[voteStatusRepository] subscribeHasUserVoted match:", err);
      votedOnMatch = false;
      emit();
    },
  );

  return () => {
    unsubVote();
    unsubMatch();
  };
}

/** Link para o resumo pós-jogo (nunca pré-jogo / ao-vivo). */
export function matchSummaryPath(matchId: string, options?: { view?: "summary" }): string {
  const base = `/partida/${matchId}/pos-jogo`;
  if (options?.view === "summary") return `${base}?view=summary`;
  return base;
}
