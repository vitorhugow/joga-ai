
export type LiveTeamKey = "A" | "B" | "C" | "D" | "BENCH";

export type LivePlayer = {
  id: string;
  name: string;
  position: string;
  overall: number;
  paid?: boolean;
  isMe?: boolean;
  manual?: boolean;
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

export const PRE_MATCH_STORAGE_KEY = "joga-ai-pre-match-v1";

function scopedKey(matchId: string) {
  return `${PRE_MATCH_STORAGE_KEY}-${matchId}`;
}

export function savePreMatch(data: SavedPreMatch, matchId?: string) {
  try {
    const id = matchId ?? data.matchId;
    const payload = id ? { ...data, matchId: id } : data;

    if (id) {
      window.localStorage.setItem(scopedKey(id), JSON.stringify(payload));
      return;
    }

    window.localStorage.setItem(PRE_MATCH_STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn("Erro ao salvar pré-jogo:", error);
  }
}

export function loadPreMatch(matchId?: string): SavedPreMatch | null {
  try {
    if (matchId) {
      const scoped = window.localStorage.getItem(scopedKey(matchId));
      if (scoped) return JSON.parse(scoped) as SavedPreMatch;
    }

    const raw = window.localStorage.getItem(PRE_MATCH_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as SavedPreMatch;
    if (matchId && parsed.matchId && parsed.matchId !== matchId) return null;
    return parsed;
  } catch (error) {
    console.warn("Erro ao carregar pré-jogo:", error);
    return null;
  }
}

export function clearPreMatch(matchId?: string) {
  try {
    if (matchId) {
      window.localStorage.removeItem(scopedKey(matchId));
      return;
    }
    window.localStorage.removeItem(PRE_MATCH_STORAGE_KEY);
  } catch (error) {
    console.warn("Erro ao limpar pré-jogo:", error);
  }
}
