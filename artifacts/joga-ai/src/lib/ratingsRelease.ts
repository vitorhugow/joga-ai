import { getVotes } from "./auditRepository";
import {
  loadMatchResult,
  loadUserMatchHistory,
  saveUserMatchHistory,
  type UserMatchHistoryEntry,
} from "./matchHistoryRepository";
import { addNotification } from "./notificationsRepository";
import { applyDelayedRatingToProfile } from "./userRepository";
import {
  averageRatingsForPlayer,
  computeRatingByPlayer,
} from "./evolutionUtils";

export const RATINGS_RELEASE_MS = 24 * 60 * 60 * 1000;

export function ratingsReleaseAt(completedAt: string): string {
  return new Date(new Date(completedAt).getTime() + RATINGS_RELEASE_MS).toISOString();
}

export function isRatingReleased(releaseAt: string): boolean {
  return Date.now() >= new Date(releaseAt).getTime();
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
  if (!result) return;

  const releaseAt =
    result.ratingsReleaseAt ?? ratingsReleaseAt(result.completedAt);
  if (!isRatingReleased(releaseAt)) return;

  const votes = await getVotes(entry.matchId);
  const ratingByPlayer = computeRatingByPlayer(votes);
  const player = result.players.find((p) => p.userId === userId);
  if (!player) return;

  const rating = averageRatingsForPlayer(ratingByPlayer, player.playerId);
  if (rating <= 0) return;

  await applyDelayedRatingToProfile(userId, rating);
  await saveUserMatchHistory(userId, {
    ...entry,
    rating,
    ratingPending: false,
    ratingReleased: true,
  });

  await addNotification(userId, {
    title: "A tua nota saiu!",
    body: `Recebeste ${rating.toFixed(1)} na pelada «${entry.title}». Vê no Perfil.`,
    type: "match",
    link: "/perfil",
  });
}
