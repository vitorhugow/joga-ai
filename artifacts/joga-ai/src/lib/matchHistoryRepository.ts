/**
 * matchHistoryRepository — resultados e histórico de peladas
 */

import {
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  deleteDoc,
  serverTimestamp,
  getDoc,
} from "firebase/firestore";
import { db, isFirebaseConfigured } from "./firebase";
import { stripUndefined } from "./firestoreUtils";

export type MatchPlayerResult = {
  playerId: string;
  userId?: string;
  name: string;
  goals: number;
  assists: number;
  saves: number;
  rating: number;
  mvp?: boolean;
};

export type MatchResult = {
  matchId: string;
  title: string;
  completedAt: string;
  ratingsReleaseAt?: string;
  ratingsReleased?: boolean;
  ratingsReleasedAt?: string;
  ratingsReleaseReason?: "all_voted" | "organizer" | "24h";
  communityId?: string;
  organizerId?: string;
  players: MatchPlayerResult[];
  topScorers: { name: string; goals: number }[];
  teamNames?: Record<string, string>;
};

export type UserMatchHistoryEntry = {
  matchId: string;
  title: string;
  date: string;
  rating: number;
  goals: number;
  assists: number;
  communityId?: string;
  ratingPending?: boolean;
  ratingReleased?: boolean;
  participationApplied?: boolean;
  voteEvolutionApplied?: boolean;
};

/** Limite de partidas visíveis no Perfil sem PRO Jogador (gate de leitura apenas). */
export const FREE_HISTORY_LIMIT = 10;

const LOCAL_HISTORY_PREFIX = "joga-ai-match-history-v1";

function localHistoryKey(userId: string) {
  return `${LOCAL_HISTORY_PREFIX}-${userId}`;
}

function readLocalHistory(userId: string): UserMatchHistoryEntry[] {
  try {
    const raw = localStorage.getItem(localHistoryKey(userId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeLocalHistory(userId: string, entries: UserMatchHistoryEntry[]) {
  localStorage.setItem(localHistoryKey(userId), JSON.stringify(entries.slice(0, 30)));
}

export async function saveMatchResult(result: MatchResult): Promise<void> {
  if (!isFirebaseConfigured()) return;

  try {
    await setDoc(
      doc(db, "matches", result.matchId, "summary", "result"),
      stripUndefined({
        ...result,
        savedAt: serverTimestamp(),
      }),
    );
  } catch (err) {
    console.warn("[matchHistory] saveMatchResult:", err);
  }
}

export async function loadMatchResult(matchId: string): Promise<MatchResult | null> {
  if (!isFirebaseConfigured()) return null;

  try {
    const snap = await getDoc(doc(db, "matches", matchId, "summary", "result"));
    if (!snap.exists()) return null;
    return snap.data() as MatchResult;
  } catch {
    return null;
  }
}

export async function getUserMatchHistoryEntry(
  userId: string,
  matchId: string,
): Promise<UserMatchHistoryEntry | null> {
  const local = readLocalHistory(userId).find((e) => e.matchId === matchId);
  if (local) return local;

  if (!isFirebaseConfigured() || !userId) return null;

  try {
    const snap = await getDoc(doc(db, "users", userId, "matchHistory", matchId));
    return snap.exists() ? (snap.data() as UserMatchHistoryEntry) : null;
  } catch {
    return null;
  }
}

export async function hasParticipationApplied(
  userId: string,
  matchId: string,
): Promise<boolean> {
  const entry = await getUserMatchHistoryEntry(userId, matchId);
  return Boolean(entry?.participationApplied);
}

export async function hasVoteEvolutionApplied(
  userId: string,
  matchId: string,
): Promise<boolean> {
  const entry = await getUserMatchHistoryEntry(userId, matchId);
  return Boolean(entry?.voteEvolutionApplied);
}

export async function hasUserMatchHistoryEntry(
  userId: string,
  matchId: string,
): Promise<boolean> {
  if (readLocalHistory(userId).some((entry) => entry.matchId === matchId)) {
    return true;
  }

  if (!isFirebaseConfigured() || !userId) return false;

  try {
    const snap = await getDoc(doc(db, "users", userId, "matchHistory", matchId));
    return snap.exists();
  } catch {
    return false;
  }
}

export async function saveUserMatchHistory(
  userId: string,
  entry: UserMatchHistoryEntry,
): Promise<void> {
  const local = readLocalHistory(userId);
  const merged = [entry, ...local.filter((e) => e.matchId !== entry.matchId)];
  writeLocalHistory(userId, merged);

  if (!isFirebaseConfigured() || !userId) return;

  try {
    await setDoc(
      doc(db, "users", userId, "matchHistory", entry.matchId),
      stripUndefined({
        ...entry,
        savedAt: serverTimestamp(),
      }),
    );
  } catch (err) {
    console.warn("[matchHistory] saveUserMatchHistory:", err);
  }
}

export async function loadUserMatchHistory(userId: string): Promise<UserMatchHistoryEntry[]> {
  const local = readLocalHistory(userId);

  if (!isFirebaseConfigured() || !userId) return local;

  try {
    const snap = await getDocs(
      query(
        collection(db, "users", userId, "matchHistory"),
        orderBy("date", "desc"),
        limit(20),
      ),
    );
    if (snap.empty) return local;

    const remote = snap.docs.map((d) => d.data() as UserMatchHistoryEntry);
    const byId = new Map<string, UserMatchHistoryEntry>();
    [...remote, ...local].forEach((e) => byId.set(e.matchId, e));
    return [...byId.values()].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
  } catch (err) {
    console.warn("[matchHistory] loadUserMatchHistory:", err);
    return local;
  }
}

export async function loadCommunityMatchResults(
  communityId: string,
  limitCount = 10,
): Promise<MatchResult[]> {
  if (!isFirebaseConfigured()) return [];

  try {
    const snap = await getDocs(
      query(
        collection(db, "matches"),
        where("communityId", "==", communityId),
        where("status", "==", "concluida"),
        orderBy("savedAt", "desc"),
        limit(limitCount),
      ),
    );

    const results: MatchResult[] = [];
    for (const matchDoc of snap.docs) {
      const resultSnap = await getDoc(
        doc(db, "matches", matchDoc.id, "summary", "result"),
      );
      if (resultSnap.exists()) {
        results.push(resultSnap.data() as MatchResult);
      }
    }
    return results;
  } catch (err) {
    console.warn("[matchHistory] loadCommunityMatchResults:", err);
    return [];
  }
}

export async function deleteUserMatchHistory(userId: string, matchId: string): Promise<void> {
  const local = readLocalHistory(userId).filter((e) => e.matchId !== matchId);
  writeLocalHistory(userId, local);
  if (!isFirebaseConfigured()) return;
  try {
    await deleteDoc(doc(db, "users", userId, "matchHistory", matchId));
  } catch (err) {
    console.warn("[matchHistory] deleteUserMatchHistory:", err);
  }
}

export async function deleteMatchResult(matchId: string): Promise<void> {
  if (!isFirebaseConfigured()) return;
  try {
    await deleteDoc(doc(db, "matches", matchId, "summary", "result"));
  } catch (err) {
    console.warn("[matchHistory] deleteMatchResult:", err);
  }
}
