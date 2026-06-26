import type { EvolutionGain, MiniGameSummary } from "./evolutionUtils";
import { getCurrentUserId } from "./auth";
import { saveEvolutionToFirestore } from "./evolutionRepository";

export type EvolutionRecord = {
  id: string;
  matchId: string;
  savedAt: string;
  playerId: string;
  playerName: string;
  gains: EvolutionGain[];
  stats: {
    goals: number;
    assists: number;
    saves: number;
    fouls: number;
    cards: number;
    miniGames: number;
  };
  topScorers: Array<{ name: string; goals: number }>;
  miniGames: Array<{ title: string; winner?: string }>;
};

const KEY = "joga-ai-evolution-history-v1";

export function loadEvolutionHistory(): EvolutionRecord[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as EvolutionRecord[]) : [];
  } catch {
    return [];
  }
}

export function loadLatestEvolution(playerId?: string): EvolutionRecord | null {
  const history = loadEvolutionHistory();
  if (history.length === 0) return null;
  if (!playerId) return history[0];
  return history.find((record) => record.playerId === playerId) || history[0];
}

export function saveEvolutionRecord(record: EvolutionRecord) {
  const history = loadEvolutionHistory().filter((item) => item.id !== record.id);
  localStorage.setItem(KEY, JSON.stringify([record, ...history].slice(0, 20)));

  // Persiste no Firestore em paralelo (fire-and-forget)
  const userId = getCurrentUserId();
  saveEvolutionToFirestore(userId, record).catch(console.warn);
}

export function buildEvolutionRecord(input: {
  matchId: string;
  player: { id: string; name: string };
  gains: EvolutionGain[];
  stats: EvolutionRecord["stats"];
  topScorers: Array<{ name: string; goals: number }>;
  miniGames: MiniGameSummary[];
}): EvolutionRecord {
  return {
    id: `evo-${input.matchId}-${Date.now()}`,
    matchId: input.matchId,
    savedAt: new Date().toISOString(),
    playerId: input.player.id,
    playerName: input.player.name,
    gains: input.gains,
    stats: input.stats,
    topScorers: input.topScorers,
    miniGames: input.miniGames.map((game) => ({
      title: game.title,
      winner: game.winner,
    })),
  };
}
