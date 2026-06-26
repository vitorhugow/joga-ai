export type EvolutionGain = {
  title: string;
  value: string;
  reason: string;
  type: "up" | "pending";
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

export function computePlayerGains(
  player: { id: string; name?: string; position?: string } | null | undefined,
  events: MatchEvent[]
): EvolutionGain[] {
  if (!player) return [];

  const playerEvents = events.filter((event) => event.playerId === player.id);
  const goals = playerEvents.filter((event) => event.type === "golo").length;
  const assists = playerEvents.filter((event) => event.type === "assistencia").length;
  const saves = playerEvents.filter((event) => event.type === "defesa").length;
  const isGoalkeeper = String(player.position || "").toUpperCase().includes("GR");

  const list: EvolutionGain[] = [
    {
      title: isGoalkeeper ? "Reflexos" : "Físico",
      value: "+1",
      reason: "Evolução aplicada no perfil",
      type: "up",
    },
  ];

  if (goals > 0) {
    list.push({
      title: isGoalkeeper ? "Saída" : "Finalização",
      value: `+${goals}`,
      reason: "Evolução aplicada no perfil",
      type: "up",
    });
  }

  if (assists > 0) {
    list.push({
      title: "Passe",
      value: `+${assists}`,
      reason: "Evolução aplicada no perfil",
      type: "up",
    });
  }

  if (saves > 0) {
    list.push({
      title: "Defesa",
      value: `+${saves}`,
      reason: "Evolução aplicada no perfil",
      type: "up",
    });
  }

  list.push({
    title: "Nota dos colegas",
    value: "Pendente",
    reason: "Será atualizada após o período de avaliação",
    type: "pending",
  });

  return list;
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
