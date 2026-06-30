
export type LiveTeamKey = "A" | "B" | "C" | "D" | "BENCH";

export type LivePlayer = {
  id: string;
  name: string;
  position: string;
  overall: number;
  paid?: boolean;
  isMe?: boolean;
  manual?: boolean;
  userId?: string;
};

export type LiveAssignment = {
  slotId: string;
  team: "A" | "B";
  playerId: string | null;
};

export type SavedPreMatch = {
  version: 1;
  matchId?: string;
  gameMode: "fut5" | "fut7";
  teamCount: 2 | 3 | 4;
  teamNames: Record<"A" | "B" | "C" | "D", string>;
  players: LivePlayer[];
  playerTeams: Record<string, LiveTeamKey>;
  assignments: Record<string, string | null>;
  savedAt: string;
};

const KEY_PREFIX = "joga-ai-pre-match-v1-";
const LEGACY_KEY = "joga-ai-pre-match-v1";

function storageKey(matchId: string) {
  return `${KEY_PREFIX}${matchId}`;
}

export function savePreMatch(data: SavedPreMatch, matchId?: string) {
  try {
    const id = matchId ?? data.matchId;
    if (!id) return;
    window.localStorage.setItem(storageKey(id), JSON.stringify({ ...data, matchId: id }));
  } catch (error) {
    console.warn("Erro ao salvar pré-jogo:", error);
  }
}

export function loadPreMatch(matchId?: string): SavedPreMatch | null {
  try {
    if (matchId) {
      const raw = window.localStorage.getItem(storageKey(matchId));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as SavedPreMatch;
      if (parsed.matchId && parsed.matchId !== matchId) return null;
      return parsed;
    }
    const legacy = window.localStorage.getItem(LEGACY_KEY);
    if (legacy) return JSON.parse(legacy) as SavedPreMatch;
    return null;
  } catch (error) {
    console.warn("Erro ao carregar pré-jogo:", error);
    return null;
  }
}

export function clearPreMatch(matchId?: string) {
  try {
    if (matchId) {
      window.localStorage.removeItem(storageKey(matchId));
      return;
    }
    window.localStorage.removeItem(LEGACY_KEY);
  } catch (error) {
    console.warn("Erro ao limpar pré-jogo:", error);
  }
}

/** @deprecated use savePreMatch(data, matchId) */
export const PRE_MATCH_STORAGE_KEY = LEGACY_KEY;
