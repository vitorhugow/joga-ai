/**
 * finalizeExpiredVoting — corre de hora a hora e finaliza server-side
 * peladas cuja votação (status "aguardando_auditoria"/"auditada") já passou
 * das 24h desde o fim do jogo (`matchEndedAt`), independentemente de
 * quantos votaram.
 *
 * É agora o ÚNICO gatilho automático de finalização — o cliente só
 * finaliza a pedido explícito do organizador/admin do clube (ver
 * PosJogo.tsx, handleOrganizerFinalizeVoting). Substitui a antiga
 * auto-finalização client-side por "todos votaram" (efeito
 * autoFinalizeInFlightRef), que causava finalizações concorrentes/parciais
 * disparadas por qualquer dispositivo com a página aberta.
 *
 * `matchEndedAt` é gravado uma única vez em AoVivo.tsx (terminarPelada), na
 * transição ao_vivo -> aguardando_auditoria, e nunca reescrito depois — ao
 * contrário de `savedAt`, que muda a cada voto. Uma pelada sem
 * `matchEndedAt` (não deve acontecer em produção a partir de agora) é
 * ignorada silenciosamente: fica dependente do organizador finalizar à mão.
 *
 * Não faz fan-out para perfis/badges/histórico de cada jogador — isso
 * continua a ser feito por "pull" no próprio cliente (processPendingRatings
 * em ratingsRelease.ts) quando cada um abre a app. Notificações e apelidos
 * automáticos também não precisam de nada extra aqui: já existem triggers
 * (onMatchRatingsReleasedNotify, onMatchRatingsReleasedNicknames) a
 * observar `matches/{id}/summary/result` e a disparar sozinhos assim que
 * `ratingsReleased` passa a true, seja lá quem escrever o documento.
 */

import { onSchedule } from "firebase-functions/v2/scheduler";
import { getFirestore, FieldValue, type Firestore, type DocumentData } from "firebase-admin/firestore";

const VOTING_STATUSES = ["aguardando_auditoria", "auditada"];
const RATINGS_RELEASE_MS = 24 * 60 * 60 * 1000;

type MatchEvent = {
  type?: string;
  playerId?: string;
  playerName?: string;
};

type MiniGame = {
  events?: MatchEvent[];
};

type VoteRecord = {
  ratings?: Record<string, number>;
};

type MatchPlayerResult = {
  playerId: string;
  userId?: string;
  name: string;
  goals: number;
  assists: number;
  saves: number;
  rating: number;
};

function collectAllEvents(miniGames: MiniGame[]): MatchEvent[] {
  return miniGames.flatMap((game) => game.events ?? []);
}

/** Idêntico a computeRatingByPlayer em src/lib/evolutionUtils.ts */
function computeRatingByPlayer(votes: VoteRecord[]): Record<string, number[]> {
  const ratingByPlayer: Record<string, number[]> = {};
  for (const vote of votes) {
    for (const [pid, rating] of Object.entries(vote.ratings ?? {})) {
      if (!ratingByPlayer[pid]) ratingByPlayer[pid] = [];
      ratingByPlayer[pid].push(rating);
    }
  }
  return ratingByPlayer;
}

/** Idêntico a averageRatingsForPlayer em src/lib/evolutionUtils.ts */
function averageRatingsForPlayer(ratingByPlayer: Record<string, number[]>, playerId: string): number {
  const ratings = ratingByPlayer[playerId] ?? [];
  if (ratings.length === 0) return 0;
  const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length;
  return Math.round(avg * 10) / 10;
}

/** Idêntico a computePlayerMatchStats em src/lib/evolutionUtils.ts (sem fouls/cards, não usados no summary). */
function computePlayerMatchStats(playerId: string, events: MatchEvent[]) {
  const mine = events.filter((event) => event.playerId === playerId);
  return {
    goals: mine.filter((event) => event.type === "golo").length,
    assists: mine.filter((event) => event.type === "assistencia").length,
    saves: mine.filter((event) => event.type === "defesa").length,
  };
}

/** Idêntico a computeTopScorers em src/lib/evolutionUtils.ts */
function computeTopScorers(events: MatchEvent[]): { name: string; goals: number }[] {
  const map: Record<string, { name: string; goals: number }> = {};
  for (const event of events) {
    if (event.type !== "golo") continue;
    const key = event.playerId || event.playerName || "unknown";
    if (!map[key]) map[key] = { name: event.playerName || "Jogador", goals: 0 };
    map[key].goals += 1;
  }
  const sorted = Object.values(map).sort((a, b) => b.goals - a.goals);
  if (sorted.length === 0) return [];
  const bestGoals = sorted[0].goals;
  return sorted.filter((item) => item.goals === bestGoals);
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out = {} as T;
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) (out as Record<string, unknown>)[key] = value;
  }
  return out;
}

async function finalizeMatch(db: Firestore, matchId: string, match: DocumentData): Promise<void> {
  const resultRef = db.doc(`matches/${matchId}/summary/result`);
  const existingSnap = await resultRef.get();
  const existing = existingSnap.exists ? existingSnap.data() : null;

  // Guarda anti-regressão: nunca sobrescreve um resultado já publicado com
  // notas reais. O filtro de status na query já devia impedir isto, mas
  // mantém-se por consistência com saveMatchResult (matchHistoryRepository.ts).
  if (existing?.ratingsReleased) {
    console.log(`[finalizeExpiredVoting] ${matchId} já tem notas publicadas — skip.`);
    return;
  }

  const votesSnap = await db.collection(`matches/${matchId}/votes`).get();
  const votes: VoteRecord[] = votesSnap.docs.map((doc) => doc.data() as VoteRecord);

  const miniGames: MiniGame[] = Array.isArray(match.miniGames) ? match.miniGames : [];
  const events = collectAllEvents(miniGames);
  const ratingByPlayer = computeRatingByPlayer(votes);

  const rosterPlayers: Array<{ id: string; name: string; userId?: string }> = Array.isArray(match.players)
    ? match.players
    : [];

  const players: MatchPlayerResult[] = rosterPlayers.map((player) => {
    const stats = computePlayerMatchStats(player.id, events);
    return {
      playerId: player.id,
      userId: player.userId ?? (player.id === match.organizerId ? match.organizerId : undefined),
      name: player.name,
      goals: stats.goals,
      assists: stats.assists,
      saves: stats.saves,
      rating: averageRatingsForPlayer(ratingByPlayer, player.id),
    };
  });

  // Guarda anti-regressão (idêntica a saveMatchResult em
  // matchHistoryRepository.ts): nunca aceita um payload em que todos os
  // jogadores ficam com nota 0 se já existir um resultado com pelo menos
  // uma nota real — protege contra recalcular a partir de uma leitura de
  // votos vazia/parcial e apagar notas já publicadas.
  const allZero = players.length > 0 && players.every((p) => p.rating <= 0);
  if (allZero && existing?.players?.some((p: MatchPlayerResult) => p.rating > 0)) {
    console.error(
      `[finalizeExpiredVoting] ${matchId} ABORTADO — payload zeraria notas já existentes`,
    );
    return;
  }

  const completedAt: string = typeof match.matchEndedAt === "string" ? match.matchEndedAt : new Date().toISOString();
  const ratingsReleaseAt = new Date(new Date(completedAt).getTime() + RATINGS_RELEASE_MS).toISOString();
  const nowIso = new Date().toISOString();

  const result = stripUndefined({
    matchId,
    title: typeof match.title === "string" ? match.title : `Pelada ${matchId}`,
    completedAt,
    ratingsReleaseAt,
    communityId: match.communityId,
    organizerId: match.organizerId,
    players,
    topScorers: computeTopScorers(events),
    teamNames: match.teamNames,
    ratingsReleased: true,
    ratingsReleasedAt: nowIso,
    ratingsReleaseReason: "24h",
  });

  // Batch: as duas escritas (summary/result + status do match) acontecem
  // juntas ou nenhuma acontece — nunca um estado intermédio em que as notas
  // já saíram mas o status ainda diz "aguardando_auditoria"/"auditada", ou
  // vice-versa.
  const batch = db.batch();
  batch.set(resultRef, result, { merge: true });
  batch.update(db.doc(`matches/${matchId}`), {
    status: "concluida",
    savedAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();

  console.log(
    `[finalizeExpiredVoting] ${matchId} finalizada — ${players.length} jogadores, ${votes.length} votos.`,
  );
}

export const finalizeExpiredVoting = onSchedule(
  { schedule: "every 60 minutes", timeZone: "Europe/Lisbon", region: "europe-west1" },
  async () => {
    const db = getFirestore();
    const now = Date.now();

    const snap = await db.collection("matches").where("status", "in", VOTING_STATUSES).get();

    const toFinalize = snap.docs.filter((doc) => {
      const matchEndedAt = doc.data().matchEndedAt;
      if (typeof matchEndedAt !== "string") return false;
      const endedMs = new Date(matchEndedAt).getTime();
      if (!Number.isFinite(endedMs)) return false;
      return now - endedMs >= RATINGS_RELEASE_MS;
    });

    if (toFinalize.length === 0) {
      console.log("[finalizeExpiredVoting] Nenhuma pelada a finalizar.");
      return;
    }

    let finalized = 0;
    for (const matchDoc of toFinalize) {
      try {
        await finalizeMatch(db, matchDoc.id, matchDoc.data());
        finalized++;
      } catch (err) {
        console.error(`[finalizeExpiredVoting] falha ao finalizar ${matchDoc.id}:`, err);
      }
    }
    console.log(`[finalizeExpiredVoting] Finalizadas ${finalized}/${toFinalize.length} peladas.`);
  },
);
