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
import { loadMatchFromFirestore, updateMatchStatus } from "./matchRepository";
import { addNotification } from "./notificationsRepository";
import { applyDelayedRatingToProfile } from "./userRepository";
import { checkAndUnlockBadges } from "./badgeService";
import { trackRivalriesFromMatchResult } from "./communityStatsRepository";
import { getCurrentUserId } from "./auth";
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

function ratingReleasedNotification(title: string, rating: number) {
  return {
    title: "A tua nota saiu!",
    body: `Recebeste ${rating.toFixed(1)} na pelada «${title}». Vê a tua evolução.`,
    type: "match" as const,
    link: "/perfil/evolucao",
  };
}

/**
 * Escreve a nota/badges/histórico no PRÓPRIO perfil do utilizador. Só pode
 * ser chamado para o utilizador actualmente autenticado — escrever no doc
 * de outro user (users/{outroId}, matchHistory/{outroId}) é negado pelas
 * firestore.rules (allow write: if isOwner(userId)).
 */
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
    await checkAndUnlockBadges(userId, { lastRating: rating });
    await addNotification(userId, ratingReleasedNotification(title, rating));
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

  // Grava o summary com ratingsReleased:true PRIMEIRO — é a fonte de verdade
  // partilhada (matches/{id}/summary/result, leitura/escrita permitida a
  // qualquer signed-in user) que permite a CADA jogador aplicar a própria
  // nota via "pull" (processPendingRatings) quando abrir a app. Tem de ficar
  // gravado mesmo que o resto abaixo falhe parcialmente.
  await saveMatchResult({
    ...result,
    ratingsReleased: true,
    ratingsReleasedAt: new Date().toISOString(),
    ratingsReleaseReason: reason,
  });

  // Fan-out best-effort: só quem está a correr este código pode escrever no
  // PRÓPRIO perfil (users/{uid}, matchHistory/{uid} — allow write: if
  // isOwner). Para os restantes jogadores, o registo/notificação diz-lhes
  // que a nota saiu, mas quem aplica de facto atributos/badges/histórico é
  // cada um no seu dispositivo (via processPendingRatings, lendo o summary
  // acima). Uma falha num jogador nunca deve travar os restantes.
  const currentUid = getCurrentUserId();
  for (const player of result.players) {
    if (!player.userId) continue;
    try {
      if (player.userId === currentUid) {
        await releaseRatingForUser(
          player.userId,
          player.playerId,
          matchId,
          result.title,
          player.rating,
        );
      } else if (player.rating > 0) {
        await addNotification(player.userId, ratingReleasedNotification(result.title, player.rating));
      }
    } catch (err) {
      console.warn(`[ratingsRelease] falha ao processar jogador ${player.userId}:`, err);
    }
  }

  if (result.communityId) {
    try {
      await trackRivalriesFromMatchResult(result.communityId, {
        ...result,
        ratingsReleased: true,
      });
    } catch (err) {
      console.warn("[ratingsRelease] trackRivalriesFromMatchResult:", err);
    }
  }

  // Badges também só podem ser desbloqueados no próprio perfil — os
  // restantes jogadores desbloqueiam os seus ao chamar checkAndUnlockBadges
  // a partir de releaseRatingForUser no seu próprio pull.
  if (currentUid) {
    const currentPlayer = result.players.find((player) => player.userId === currentUid);
    if (currentPlayer) {
      try {
        await checkAndUnlockBadges(currentUid, {
          lastRating: currentPlayer.rating,
          applyForMatchId: matchId,
        });
      } catch (err) {
        console.warn("[ratingsRelease] checkAndUnlockBadges:", err);
      }
    }
  }

  // Garante que a partida sai da fase de votação assim que as notas saem —
  // independentemente do motivo (organizador, todos votaram, ou expiração
  // de 24h). Sem isto, a libertação automática ao fim de 24h publicava as
  // notas mas deixava a partida presa em "auditada"/"aguardando_auditoria"
  // para sempre, continuando a aparecer como activa na comunidade.
  try {
    const currentMatch = await loadMatchFromFirestore(matchId);
    if (
      currentMatch &&
      (currentMatch.status === "aguardando_auditoria" || currentMatch.status === "auditada")
    ) {
      await updateMatchStatus(matchId, "concluida");
    }
  } catch (err) {
    console.warn("[ratingsRelease] updateMatchStatus:", err);
  }

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
