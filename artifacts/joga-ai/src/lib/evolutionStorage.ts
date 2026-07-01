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

const KEY_PREFIX = "joga-ai-evolution-history-v1-";
const LEGACY_KEY = "joga-ai-evolution-history-v1";

function evolutionKey(userId?: string) {
  return `${KEY_PREFIX}${userId || getCurrentUserId()}`;
}

function migrateLegacyHistory(userId: string) {
  try {
    const legacyRaw = localStorage.getItem(LEGACY_KEY);
    if (!legacyRaw) return;
    const key = evolutionKey(userId);
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, legacyRaw);
  } catch {
    /* ignore */
  }
}

export function loadEvolutionHistory(userId?: string): EvolutionRecord[] {
  const uid = userId || getCurrentUserId();
  migrateLegacyHistory(uid);
  try {
    const raw = localStorage.getItem(evolutionKey(uid));
    return raw ? (JSON.parse(raw) as EvolutionRecord[]) : [];
  } catch {
    return [];
  }
}

export function loadLatestEvolution(playerId?: string, userId?: string): EvolutionRecord | null {
  const history = loadEvolutionHistory(userId);
  if (history.length === 0) return null;
  if (!playerId) return history[0];
  return history.find((record) => record.playerId === playerId) || history[0];
}

export function saveEvolutionRecord(record: EvolutionRecord, userId?: string) {
  const uid = userId || getCurrentUserId();
  const history = loadEvolutionHistory(uid).filter((item) => item.id !== record.id);
  localStorage.setItem(evolutionKey(uid), JSON.stringify([record, ...history].slice(0, 20)));

  saveEvolutionToFirestore(uid, record).catch(console.warn);
}

export function deleteEvolutionRecordsForMatch(matchId: string, userId?: string): void {
  const uid = userId || getCurrentUserId();
  const history = loadEvolutionHistory(uid).filter((item) => item.matchId !== matchId);
  localStorage.setItem(evolutionKey(uid), JSON.stringify(history));
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
