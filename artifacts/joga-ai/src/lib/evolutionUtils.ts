import { RATING_DRIBLE_MIN } from "./cardUtils";

export type EvolutionGain = {
  title: string;
  value: string;
  reason: string;
  type: "up" | "pending";
};

export type ComputePlayerGainsOptions = {
  receivedRating?: number | null;
  isTopScorer?: boolean;
  hasVoted?: boolean;
  participationApplied?: boolean;
};

export type MatchEvent = {
  id?: string;
  type: string;
  playerId?: string;
  playerName?: string;
  team?: string;
  time?: string;
};

export type MiniGameSummary = {
  id: string;
  title: string;
  winner?: string;
  scoreA?: number;
  scoreB?: number;
  homeTeam?: string;
  awayTeam?: string;
  events?: MatchEvent[];
};

export function collectAllEvents(miniGames: MiniGameSummary[] = []) {
  return miniGames.flatMap((game) => game.events || []);
}

export function computeTopScorers(events: MatchEvent[]) {
  const map: Record<string, { name: string; goals: number }> = {};

  for (const event of events) {
    if (event.type !== "golo") continue;
    const key = event.playerId || event.playerName || "unknown";
    if (!map[key]) {
      map[key] = { name: event.playerName || "Jogador", goals: 0 };
    }
    map[key].goals += 1;
  }

  const sorted = Object.values(map).sort((a, b) => b.goals - a.goals);
  if (sorted.length === 0) return [];

  const bestGoals = sorted[0].goals;
  return sorted.filter((item) => item.goals === bestGoals);
}

export function isPlayerTopScorer(
  topScorers: Array<{ name: string }>,
  player: { id: string; name?: string },
): boolean {
  if (topScorers.length === 0) return false;
  return topScorers.some(
    (scorer) => scorer.name === player.name || scorer.name === player.id,
  );
}

export function computePlayerGains(
  player: { id: string; name?: string; position?: string } | null | undefined,
  events: MatchEvent[],
  options: ComputePlayerGainsOptions = {},
): EvolutionGain[] {
  if (!player) return [];

  const { receivedRating, isTopScorer, hasVoted, participationApplied } = options;
  const playerEvents = events.filter((event) => event.playerId === player.id);
  const goals = playerEvents.filter((event) => event.type === "golo").length;
  const assists = playerEvents.filter((event) => event.type === "assistencia").length;
  const saves = playerEvents.filter((event) => event.type === "defesa").length;
  const fouls = playerEvents.filter((event) => event.type === "falta").length;
  const yellowCards = playerEvents.filter((event) => event.type === "cartao_amarelo").length;
  const isGoalkeeper = String(player.position || "").toUpperCase().includes("GR");

  const list: EvolutionGain[] = [
    {
      title: isGoalkeeper ? "Reflexos" : "Físico",
      value: participationApplied ? "+1" : "+1",
      reason: participationApplied
        ? "Por jogar a pelada"
        : "Aplica quando a partida termina (estás no plantel)",
      type: participationApplied ? "up" : "pending",
    },
  ];

  if (goals > 0) {
    list.push({
      title: isGoalkeeper ? "Saída" : "Finalização",
      value: `+${goals}`,
      reason: "Golos nesta pelada",
      type: hasVoted ? "up" : "pending",
    });
  }

  if (isTopScorer) {
    list.push({
      title: isGoalkeeper ? "Saída (artilheiro)" : "Artilheiro",
      value: "+1",
      reason: "Mais golos da pelada",
      type: hasVoted ? "up" : "pending",
    });
  }

  if (assists > 0) {
    list.push({
      title: "Passe",
      value: `+${assists}`,
      reason: "Assistências nesta pelada",
      type: hasVoted ? "up" : "pending",
    });
  }

  if (saves > 0) {
    list.push({
      title: "Defesa",
      value: `+${saves}`,
      reason: "Defesas nesta pelada",
      type: hasVoted ? "up" : "pending",
    });
  }

  if (fouls > 0) {
    list.push({
      title: "Ritmo",
      value: `-${fouls}`,
      reason: `${fouls} falta(s) — −1 Ritmo cada`,
      type: hasVoted ? "up" : "pending",
    });
  }

  if (yellowCards > 0) {
    list.push({
      title: "Ritmo",
      value: `-${yellowCards}`,
      reason: `${yellowCards} cartão(ões) — −1 Ritmo cada`,
      type: hasVoted ? "up" : "pending",
    });
  }

  list.push({
    title: "Ritmo",
    value: hasVoted ? "+1" : "Por votar",
    reason: hasVoted ? "Votaste nos colegas" : "Sobe +1 ao concluir a votação",
    type: hasVoted ? "up" : "pending",
  });

  const hasRating = receivedRating != null && receivedRating > 0;
  list.push({
    title: "Drible",
    value: hasRating
      ? receivedRating >= RATING_DRIBLE_MIN
        ? "+1"
        : "—"
      : "Com nota",
    reason: hasRating
      ? receivedRating >= RATING_DRIBLE_MIN
        ? `Nota ${receivedRating.toFixed(1)} ≥ ${RATING_DRIBLE_MIN}`
        : `Precisas de nota ≥ ${RATING_DRIBLE_MIN}`
      : `Sobe +1 se a nota final for ≥ ${RATING_DRIBLE_MIN}`,
    type: hasRating && receivedRating >= RATING_DRIBLE_MIN ? "up" : "pending",
  });

  list.push({
    title: "Nota dos colegas",
    value: hasRating ? receivedRating.toFixed(1) : "Em 24h",
    reason: hasRating
      ? "Média das avaliações nesta pelada"
      : "Será revelada quando todos votarem, o organizador finalizar, ou 24h após o fim",
    type: hasRating ? "up" : "pending",
  });

  return list;
}

export function computeRatingByPlayer(
  votes: Array<{ ratings: Record<string, number> }>,
): Record<string, number[]> {
  const ratingByPlayer: Record<string, number[]> = {};
  for (const vote of votes) {
    for (const [pid, rating] of Object.entries(vote.ratings)) {
      if (!ratingByPlayer[pid]) ratingByPlayer[pid] = [];
      ratingByPlayer[pid].push(rating);
    }
  }
  return ratingByPlayer;
}

export function averageRatingsForPlayer(
  ratingByPlayer: Record<string, number[]>,
  playerId: string,
): number {
  const ratings = ratingByPlayer[playerId] ?? [];
  if (ratings.length === 0) return 0;
  const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length;
  return Math.round(avg * 10) / 10;
}

export function collectLinkedPlayerUserIds(
  players: Array<{ id: string; userId?: string }>,
  organizerId?: string,
): string[] {
  const ids = new Set<string>();
  for (const player of players) {
    if (player.userId) ids.add(player.userId);
    else if (organizerId && player.id === organizerId) ids.add(organizerId);
  }
  return [...ids];
}

export function computePlayerMatchStats(playerId: string, events: MatchEvent[]) {
  const mine = events.filter((event) => event.playerId === playerId);
  return {
    goals: mine.filter((event) => event.type === "golo").length,
    assists: mine.filter((event) => event.type === "assistencia").length,
    saves: mine.filter((event) => event.type === "defesa").length,
    fouls: mine.filter((event) => event.type === "falta").length,
    cards: mine.filter((event) => event.type === "cartao_amarelo").length,
  };
}
