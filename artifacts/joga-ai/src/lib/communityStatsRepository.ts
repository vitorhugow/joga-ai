/**
 * communityStatsRepository — estatísticas agregadas e rivalidades da comunidade
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db, isFirebaseConfigured } from "./firebase";
import { loadCommunityMatchResults, type MatchResult } from "./matchHistoryRepository";

export type CommunityPlayerStats = {
  userId: string;
  name: string;
  goals: number;
  assists: number;
  matches: number;
  mvpCount: number;
  ratingSum: number;
  ratingCount: number;
  avgRating: number;
};

export type CommunityRivalry = {
  pairId: string;
  userIdA: string;
  userIdB: string;
  nameA: string;
  nameB: string;
  matchesTogether: number;
  goalsA: number;
  goalsB: number;
  updatedAt: string;
};

function pairIdFor(userA: string, userB: string): string {
  return [userA, userB].sort().join("_");
}

function aggregateFromResults(results: MatchResult[]): Map<string, CommunityPlayerStats> {
  const map = new Map<string, CommunityPlayerStats>();

  for (const result of results) {
    for (const player of result.players) {
      const uid = player.userId;
      if (!uid) continue;

      const existing = map.get(uid) ?? {
        userId: uid,
        name: player.name,
        goals: 0,
        assists: 0,
        matches: 0,
        mvpCount: 0,
        ratingSum: 0,
        ratingCount: 0,
        avgRating: 0,
      };

      existing.goals += player.goals ?? 0;
      existing.assists += player.assists ?? 0;
      existing.matches += 1;
      if (player.rating > 0) {
        existing.ratingSum += player.rating;
        existing.ratingCount += 1;
      }

      const top = result.topScorers?.[0];
      if (top && top.name === player.name && (top.goals ?? 0) > 0) {
        existing.mvpCount += 1;
      }

      existing.avgRating =
        existing.ratingCount > 0
          ? Math.round((existing.ratingSum / existing.ratingCount) * 10) / 10
          : 0;

      map.set(uid, existing);
    }
  }

  return map;
}

export async function loadCommunityPlayerStats(
  communityId: string,
): Promise<CommunityPlayerStats[]> {
  const results = await loadCommunityMatchResults(communityId, 50);
  return [...aggregateFromResults(results).values()].sort(
    (a, b) => b.goals - a.goals || b.avgRating - a.avgRating,
  );
}

export type LeaguePeriod = "month" | "season";

/** Liga mensal: só jogos concluídos dentro do mês corrente. */
function isWithinCurrentMonth(iso: string): boolean {
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return false;
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  return time >= monthStart;
}

export async function loadCommunityPlayerStatsForPeriod(
  communityId: string,
  period: LeaguePeriod,
): Promise<CommunityPlayerStats[]> {
  const results = await loadCommunityMatchResults(communityId, 50);
  const filtered =
    period === "month" ? results.filter((r) => isWithinCurrentMonth(r.completedAt)) : results;
  return [...aggregateFromResults(filtered).values()].sort(
    (a, b) => b.goals - a.goals || b.avgRating - a.avgRating,
  );
}

export type LeaderboardMetric = "goals" | "assists" | "avgRating" | "mvp";

export function computeLeaderboard(
  stats: CommunityPlayerStats[],
  metric: LeaderboardMetric,
  limit = 10,
) {
  const sorted = [...stats].sort((a, b) => {
    if (metric === "goals") return b.goals - a.goals;
    if (metric === "assists") return b.assists - a.assists;
    if (metric === "mvp") return b.mvpCount - a.mvpCount;
    return b.avgRating - a.avgRating;
  });

  return sorted.slice(0, limit).map((entry, index) => ({
    rank: index + 1,
    name: entry.name,
    position: "MEM",
    overall: Math.round(entry.avgRating * 10) || 50,
    value:
      metric === "goals"
        ? entry.goals
        : metric === "assists"
          ? entry.assists
          : metric === "mvp"
            ? entry.mvpCount
            : entry.avgRating > 0
              ? entry.avgRating.toFixed(1)
              : "—",
    valueLabel:
      metric === "goals"
        ? "Golos"
        : metric === "assists"
          ? "Assist."
          : metric === "mvp"
            ? "MVP"
            : "Nota média",
    userId: entry.userId,
  }));
}

async function loadRivalryDoc(
  communityId: string,
  pairId: string,
): Promise<CommunityRivalry | null> {
  if (!isFirebaseConfigured()) return null;
  try {
    const snap = await getDoc(doc(db, "communities", communityId, "rivalries", pairId));
    if (!snap.exists()) return null;
    const data = snap.data();
    return {
      pairId,
      userIdA: String(data.userIdA ?? ""),
      userIdB: String(data.userIdB ?? ""),
      nameA: String(data.nameA ?? ""),
      nameB: String(data.nameB ?? ""),
      matchesTogether: Number(data.matchesTogether ?? 0),
      goalsA: Number(data.goalsA ?? 0),
      goalsB: Number(data.goalsB ?? 0),
      updatedAt: data.updatedAt?.toDate?.()?.toISOString() ?? new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export async function loadCommunityRivalries(
  communityId: string,
  userId?: string,
): Promise<CommunityRivalry[]> {
  if (!isFirebaseConfigured()) return [];
  try {
    const snap = await getDocs(collection(db, "communities", communityId, "rivalries"));
    const items = snap.docs.map((d) => {
      const data = d.data();
      return {
        pairId: d.id,
        userIdA: String(data.userIdA ?? ""),
        userIdB: String(data.userIdB ?? ""),
        nameA: String(data.nameA ?? ""),
        nameB: String(data.nameB ?? ""),
        matchesTogether: Number(data.matchesTogether ?? 0),
        goalsA: Number(data.goalsA ?? 0),
        goalsB: Number(data.goalsB ?? 0),
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() ?? "",
      } satisfies CommunityRivalry;
    });

    const filtered = userId
      ? items.filter((r) => r.userIdA === userId || r.userIdB === userId)
      : items;

    return filtered
      .filter((r) => r.matchesTogether >= 3)
      .sort((a, b) => b.matchesTogether - a.matchesTogether);
  } catch (err) {
    console.warn("[communityStats] rivalries:", err);
    return [];
  }
}

/** Actualiza pares de rivalidade após resultado publicado */
export async function trackRivalriesFromMatchResult(
  communityId: string,
  result: MatchResult,
): Promise<void> {
  if (!isFirebaseConfigured() || !communityId) return;

  const linked = result.players.filter((p) => p.userId);
  if (linked.length < 2) return;

  for (let i = 0; i < linked.length; i++) {
    for (let j = i + 1; j < linked.length; j++) {
      const a = linked[i];
      const b = linked[j];
      if (!a.userId || !b.userId) continue;

      const pairId = pairIdFor(a.userId, b.userId);
      const existing = await loadRivalryDoc(communityId, pairId);
      const isAFirst = a.userId < b.userId;

      const goalsA = (existing?.goalsA ?? 0) + (isAFirst ? a.goals : b.goals);
      const goalsB = (existing?.goalsB ?? 0) + (isAFirst ? b.goals : a.goals);

      const rivalry: CommunityRivalry = {
        pairId,
        userIdA: isAFirst ? a.userId : b.userId,
        userIdB: isAFirst ? b.userId : a.userId,
        nameA: isAFirst ? a.name : b.name,
        nameB: isAFirst ? b.name : a.name,
        matchesTogether: (existing?.matchesTogether ?? 0) + 1,
        goalsA,
        goalsB,
        updatedAt: new Date().toISOString(),
      };

      if (rivalry.matchesTogether < 3) {
        await setDoc(
          doc(db, "communities", communityId, "rivalries", pairId),
          { ...rivalry, updatedAt: serverTimestamp() },
          { merge: true },
        );
        continue;
      }

      await setDoc(
        doc(db, "communities", communityId, "rivalries", pairId),
        { ...rivalry, updatedAt: serverTimestamp() },
        { merge: true },
      );
    }
  }
}

export async function getPlayerCommunityStats(
  communityId: string,
  userId: string,
): Promise<CommunityPlayerStats | null> {
  const all = await loadCommunityPlayerStats(communityId);
  return all.find((s) => s.userId === userId) ?? null;
}
