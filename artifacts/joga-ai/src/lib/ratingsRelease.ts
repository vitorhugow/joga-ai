import { getVotes } from "./auditRepository";
import type { MatchVoteRecord } from "./matchFlowStorage";
import {
  loadMatchResult,
  loadUserMatchHistory,
  saveMatchResult,
  saveUserMatchHistory,
  type MatchPlayerResult,
  type MatchResult,
  type UserMatchHistoryEntry,
} from "./matchHistoryRepository";
import { loadMatchFromFirestore } from "./matchRepository";
import { addNotification } from "./notificationsRepository";
import { applyDelayedRatingToProfile } from "./userRepository";
import {
  averageRatingsForPlayer,
  collectAllEvents,
  computePlayerMatchStats,
  computeRatingByPlayer,
  computeTopScorers,
  type MatchEvent,
} from "./evolutionUtils";

export const RATINGS_RELEASE_MS = 24 * 60 * 60 * 1000;

export type RatingReleaseReason = "all_voted" | "organizer" | "24h";

export function ratingsReleaseAt(completedAt: string): string {
  return new Date(new Date(completedAt).getTime() + RATINGS_RELEASE_MS).toISOString();
}

export function isRatingReleased(releaseAt: string): boolean {
  return Date.now() >= new Date(releaseAt).getTime();
}

export function buildMatchPlayerResults(
  players: Array<{ id: string; name: string; userId?: string }>,
  events: MatchEvent[],
  ratingByPlayer: Record<string, number[]>,
  organizerId?: string,
): MatchPlayerResult[] {
  return players.map((player) => {
    const stats = computePlayerMatchStats(player.id, events);
    return {
      playerId: player.id,
      userId: player.userId ?? (player.id === organizerId ? organizerId : undefined),
      name: player.name,
      goals: stats.goals,
      assists: stats.assists,
      saves: stats.saves,
      rating: averageRatingsForPlayer(ratingByPlayer, player.id),
    };
  });
}

export async function buildMatchResultPayload(input: {
  matchId: string;
  title: string;
  completedAt: string;
  communityId?: string;
  organizerId?: string;
  teamNames?: Record<string, string>;
  players: Array<{ id: string; name: string; userId?: string }>;
  events: MatchEvent[];
  votes: MatchVoteRecord[];
}): Promise<MatchResult> {
  const ratingByPlayer = computeRatingByPlayer(input.votes);
  const playerResults = buildMatchPlayerResults(
    input.players,
    input.events,
    ratingByPlayer,
    input.organizerId,
  );

  return {
    matchId: input.matchId,
    title: input.title,
    completedAt: input.completedAt,
    ratingsReleaseAt: ratingsReleaseAt(input.completedAt),
    communityId: input.communityId,
    organizerId: input.organizerId,
    players: playerResults,
    topScorers: computeTopScorers(input.events),
    teamNames: input.teamNames,
  };
}

async function releaseRatingForUser(
  userId: string,
  playerId: string,
  matchId: string,
  title: string,
  rating: number,
): Promise<void> {
  const history = await loadUserMatchHistory(userId);
  const entry = history.find((row) => row.matchId === matchId);

  if (entry?.ratingReleased) return;

  if (rating > 0) {
    await applyDelayedRatingToProfile(userId, rating, matchId);
    await addNotification(userId, {
      title: "A tua nota saiu!",
      body: `Recebeste ${rating.toFixed(1)} na pelada «${title}». Vê no Perfil.`,
      type: "match",
      link: "/perfil",
    });
  }

  if (entry) {
    await saveUserMatchHistory(userId, {
      ...entry,
      rating: rating > 0 ? rating : entry.rating,
      ratingPending: false,
      ratingReleased: true,
    });
  }
}

/** Publica notas para todos os jogadores ligados — idempotente. */
export async function releaseMatchRatings(
  matchId: string,
  reason: RatingReleaseReason,
): Promise<boolean> {
  let result = await loadMatchResult(matchId);
  if (result?.ratingsReleased) return false;

  const votes = await getVotes(matchId);
  const ratingByPlayer = computeRatingByPlayer(votes);

  if (!result) {
    const match = await loadMatchFromFirestore(matchId);
    if (!match) return false;

    const events = collectAllEvents(match.miniGames ?? []);
    const completedAt = new Date().toISOString();
    result = await buildMatchResultPayload({
      matchId,
      title: match.title ?? `Pelada ${matchId}`,
      completedAt,
      communityId: match.communityId,
      organizerId: match.organizerId,
      teamNames: match.teamNames,
      players: match.players ?? [],
      events,
      votes,
    });
  } else {
    result = {
      ...result,
      players: result.players.map((player) => ({
        ...player,
        rating: averageRatingsForPlayer(ratingByPlayer, player.playerId),
      })),
    };
  }

  for (const player of result.players) {
    if (!player.userId) continue;
    await releaseRatingForUser(
      player.userId,
      player.playerId,
      matchId,
      result.title,
      player.rating,
    );
  }

  await saveMatchResult({
    ...result,
    ratingsReleased: true,
    ratingsReleasedAt: new Date().toISOString(),
    ratingsReleaseReason: reason,
  });

  return true;
}

export async function processPendingRatings(userId: string): Promise<void> {
  if (!userId) return;

  const history = await loadUserMatchHistory(userId);
  const pending = history.filter((entry) => entry.ratingPending && !entry.ratingReleased);

  for (const entry of pending) {
    await tryReleaseRatingForMatch(userId, entry);
  }
}

async function tryReleaseRatingForMatch(
  userId: string,
  entry: UserMatchHistoryEntry,
): Promise<void> {
  const result = await loadMatchResult(entry.matchId);

  if (result?.ratingsReleased) {
    const player = result.players.find((p) => p.userId === userId);
    if (player && player.rating > 0 && entry.ratingReleased !== true) {
      await releaseRatingForUser(userId, player.playerId, entry.matchId, entry.title, player.rating);
    }
    return;
  }

  const releaseAt = result?.ratingsReleaseAt ?? ratingsReleaseAt(entry.date);
  if (!isRatingReleased(releaseAt)) return;

  await releaseMatchRatings(entry.matchId, "24h");
}
