
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
  gameMode: "fut5" | "fut7";
  teamCount: 2 | 3 | 4;
  teamNames: Record<"A" | "B" | "C" | "D", string>;
  players: LivePlayer[];
  playerTeams: Record<string, LiveTeamKey>;
  assignments: Record<string, string | null>;
  savedAt: string;
};

export const PRE_MATCH_STORAGE_KEY = "joga-ai-pre-match-v1";

export function savePreMatch(data: SavedPreMatch) {
  try {
    window.localStorage.setItem(PRE_MATCH_STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.warn("Erro ao salvar pré-jogo:", error);
  }
}

export function loadPreMatch(): SavedPreMatch | null {
  try {
    const raw = window.localStorage.getItem(PRE_MATCH_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SavedPreMatch;
  } catch (error) {
    console.warn("Erro ao carregar pré-jogo:", error);
    return null;
  }
}

export function clearPreMatch() {
  try {
    window.localStorage.removeItem(PRE_MATCH_STORAGE_KEY);
  } catch (error) {
    console.warn("Erro ao limpar pré-jogo:", error);
  }
}
