import { getVotes } from "./auditRepository";
import type { MatchVoteRecord } from "./matchFlowStorage";
import {
  loadMatchResult,
  loadUserMatchHistory,
  markRatingsReleased,
  saveMatchResult,
  saveUserMatchHistory,
  type MatchPlayerResult,
  type MatchResult,
  type UserMatchHistoryEntry,
} from "./matchHistoryRepository";
import { loadMatchFromFirestore, updateMatchStatus } from "./matchRepository";
import { applyDelayedRatingToProfile, applyMatchResultToProfile } from "./userRepository";
import { checkAndUnlockBadges } from "./badgeService";
import { trackRivalriesFromMatchResult } from "./communityStatsRepository";
import { getCurrentUserId } from "./auth";
import {
  averageRatingsForPlayer,
  collectAllEvents,
  computePlayerMatchStats,
  computeRatingByPlayer,
  computeTopScorers,
  isPlayerTopScorer,
  type MatchEvent,
} from "./evolutionUtils";

export const RATINGS_RELEASE_MS = 24 * 60 * 60 * 1000;

export type RatingReleaseReason = "organizer" | "24h";

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
      fouls: stats.fouls,
      yellowCards: stats.cards,
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

/**
 * Escreve os ganhos de atributos, a nota e os badges no PRÓPRIO perfil do
 * utilizador. Só pode ser chamado para o utilizador actualmente autenticado
 * — escrever no doc de outro user (users/{outroId}, matchHistory/{outroId})
 * é negado pelas firestore.rules (allow write: if isOwner(userId)).
 */
async function releaseRatingForUser(
  userId: string,
  player: MatchPlayerResult,
  matchId: string,
  isTopScorer: boolean,
): Promise<void> {
  const history = await loadUserMatchHistory(userId);
  const entry = history.find((row) => row.matchId === matchId);

  if (entry?.ratingReleased) return;

  // Golos/assistências/defesas/faltas sobem sempre, quer tenhas votado ou
  // não — votar só dá o bónus extra de Ritmo (aplicado no momento do voto,
  // ver saveVote() em PosJogo.tsx). Quem já votou já recebeu isto ali
  // (voteEvolutionApplied:true) — aplicar outra vez aqui duplicava o ganho.
  if (!entry?.voteEvolutionApplied) {
    await applyMatchResultToProfile(userId, {
      matchId,
      goals: player.goals,
      assists: player.assists,
      saves: player.saves,
      fouls: player.fouls,
      yellowCards: player.yellowCards,
      mvp: false,
      deferRating: true,
      voted: false,
      isTopScorer,
    });
  }

  if (player.rating > 0) {
    await applyDelayedRatingToProfile(userId, player.rating, matchId);
    await checkAndUnlockBadges(userId, { lastRating: player.rating });
  }

  if (entry) {
    await saveUserMatchHistory(userId, {
      ...entry,
      rating: player.rating > 0 ? player.rating : entry.rating,
      goals: player.goals,
      assists: player.assists,
      ratingPending: false,
      ratingReleased: true,
      voteEvolutionApplied: true,
    });
  }
}

/** Publica notas para todos os jogadores ligados — idempotente. */
export async function releaseMatchRatings(
  matchId: string,
  reason: RatingReleaseReason,
): Promise<boolean> {
  const loaded = await loadMatchResult(matchId);
  if (!loaded.ok) {
    console.warn(
      "[ratingsRelease] releaseMatchRatings abortado — falha ao ler summary/result:",
      matchId,
      loaded.errorCode,
    );
    return false;
  }
  let result = loaded.result;
  if (result?.ratingsReleased) return false;

  // Só recalcula/grava notas com votos confirmados no servidor. Uma leitura
  // vinda da cache (offline, ou persistentLocalCache por sincronizar) pode
  // devolver 0 votos sem erro nenhum — tratar isso como "ninguém votou"
  // zerava notas já publicadas na próxima vez que este código corresse.
  const { votes, source } = await getVotes(matchId);
  if (source !== "server") {
    console.warn(
      "[ratingsRelease] releaseMatchRatings abortado — votos vieram de cache local, não do servidor:",
      matchId,
    );
    return false;
  }
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

  // Grava primeiro os dados (players/topScorers/etc, com a guarda
  // anti-regressão de saveMatchResult), e só depois marca ratingsReleased —
  // nunca no mesmo write, para markRatingsReleased nunca poder apagar dados
  // que ainda não chegaram a ser gravados. É a fonte de verdade partilhada
  // (matches/{id}/summary/result, leitura/escrita permitida a qualquer
  // signed-in user) que permite a CADA jogador aplicar a própria nota via
  // "pull" (processPendingRatings) quando abrir a app.
  const saved = await saveMatchResult(result);
  if (!saved) {
    // Guarda anti-regressão abortou, ou o write falhou — não marca
    // ratingsReleased sobre dados que não ficaram confirmados no Firestore.
    // A próxima tentativa (próximo onSnapshot, próximo voto, refresh) repete
    // do zero em vez de ficar presa com a flag ligada sem dados por trás.
    console.warn(
      "[ratingsRelease] releaseMatchRatings abortado — saveMatchResult não confirmou a escrita:",
      matchId,
    );
    return false;
  }
  await markRatingsReleased(matchId, reason);

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
          player,
          matchId,
          isPlayerTopScorer(result.topScorers, { id: player.playerId, name: player.name }),
        );
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
  const loaded = await loadMatchResult(entry.matchId);
  if (!loaded.ok) return; // erro a ler — tenta noutra altura, não assume nada
  const result = loaded.result;

  if (result?.ratingsReleased) {
    const player = result.players.find((p) => p.userId === userId);
    // Não exige player.rating > 0: os ganhos de golos/assistências/defesas
    // aplicam-se mesmo sem nota nenhuma (ex: ninguém votou nesse jogador).
    // releaseRatingForUser trata a parte da nota à parte, só se rating > 0.
    if (player && entry.ratingReleased !== true) {
      await releaseRatingForUser(
        userId,
        player,
        entry.matchId,
        isPlayerTopScorer(result.topScorers, { id: player.playerId, name: player.name }),
      );
    }
    return;
  }

  const releaseAt = result?.ratingsReleaseAt ?? ratingsReleaseAt(entry.date);
  if (!isRatingReleased(releaseAt)) return;

  await releaseMatchRatings(entry.matchId, "24h");
}
