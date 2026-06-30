/**
 * auditRepository.ts
 *
 * Camada Firestore para auditores e votos de uma partida.
 * Subcoleções: matches/{matchId}/auditors  e  matches/{matchId}/votes
 *
 * Quando Firebase não está configurado, toda a lógica cai no
 * createMatchFlowStore() de matchFlowStorage.ts (localStorage).
 */

import {
  collection,
  doc,
  setDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { db, isFirebaseConfigured } from "./firebase";
import type { MatchVoteRecord } from "./matchFlowStorage";

export type AuditorRecord = {
  userId: string;
  joinedAt: string;
  confirmed: boolean;
  confirmedAt?: string;
};

/** Regista um auditor (máx. 3) */
export async function registerAuditor(
  matchId: string,
  userId: string,
): Promise<{ success: boolean; auditors: AuditorRecord[] }> {
  if (!isFirebaseConfigured()) return { success: false, auditors: [] };

  const colRef = collection(db, "matches", matchId, "auditors");
  const docRef = doc(colRef, userId);

  try {
    const snap = await getDocs(colRef);
    const existing = snap.docs.map((d) => ({
      userId: d.id,
      ...d.data(),
    })) as AuditorRecord[];

    if (existing.some((a) => a.userId === userId)) {
      return { success: true, auditors: existing };
    }
    if (existing.length >= 3) {
      return { success: false, auditors: existing };
    }

    await setDoc(docRef, {
      userId,
      joinedAt: new Date().toISOString(),
      confirmed: false,
    });

    return {
      success: true,
      auditors: [...existing, { userId, joinedAt: new Date().toISOString(), confirmed: false }],
    };
  } catch (err) {
    console.warn("[auditRepository] registerAuditor:", err);
    return { success: false, auditors: [] };
  }
}

/** Marca um auditor como confirmado */
export async function confirmAuditor(
  matchId: string,
  userId: string,
): Promise<void> {
  if (!isFirebaseConfigured()) return;

  try {
    const ref = doc(db, "matches", matchId, "auditors", userId);
    await setDoc(
      ref,
      { confirmed: true, confirmedAt: serverTimestamp() },
      { merge: true },
    );
  } catch (err) {
    console.warn("[auditRepository] confirmAuditor:", err);
  }
}

/** Submete um voto (imutável — só criação) */
export async function submitVote(
  matchId: string,
  vote: MatchVoteRecord,
): Promise<void> {
  if (!isFirebaseConfigured()) return;

  try {
    const ref = doc(db, "matches", matchId, "votes", vote.userId);
    await setDoc(ref, {
      ratings: vote.ratings,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn("[auditRepository] submitVote:", err);
  }
}

/** Lê todos os votos de uma vez */
export async function getVotes(matchId: string): Promise<MatchVoteRecord[]> {
  if (!isFirebaseConfigured()) return [];

  try {
    const snap = await getDocs(collection(db, "matches", matchId, "votes"));
    return snap.docs.map((d) => ({
      userId: d.id,
      ratings: d.data().ratings as Record<string, number>,
      createdAt:
        d.data().createdAt?.toDate?.()?.toISOString() ??
        new Date().toISOString(),
    }));
  } catch (err) {
    console.warn("[auditRepository] getVotes:", err);
    return [];
  }
}

/** Observa auditores em tempo real */
export function watchAuditors(
  matchId: string,
  callback: (auditors: AuditorRecord[]) => void,
): Unsubscribe {
  if (!isFirebaseConfigured()) return () => {};

  const colRef = collection(db, "matches", matchId, "auditors");
  return onSnapshot(
    colRef,
    (snap) => {
      const records = snap.docs.map((d) => ({
        userId: d.id,
        ...(d.data() as Omit<AuditorRecord, "userId">),
      }));
      callback(records);
    },
    (err) => console.warn("[auditRepository] watchAuditors:", err),
  );
}

/** Observa votos em tempo real */
export function watchVotes(
  matchId: string,
  callback: (votes: MatchVoteRecord[]) => void,
): Unsubscribe {
  if (!isFirebaseConfigured()) return () => {};

  const colRef = collection(db, "matches", matchId, "votes");
  return onSnapshot(
    colRef,
    (snap) => {
      const records = snap.docs.map((d) => ({
        userId: d.id,
        ratings: d.data().ratings as Record<string, number>,
        createdAt:
          d.data().createdAt?.toDate?.()?.toISOString() ??
          new Date().toISOString(),
      }));
      callback(records);
    },
    (err) => console.warn("[auditRepository] watchVotes:", err),
  );
}
