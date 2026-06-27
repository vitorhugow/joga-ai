import type { LivePlayer, LiveTeamKey } from "./preMatchStorage";
import type { MiniGameSummary } from "./evolutionUtils";

export type PostMatchTeamKey = LiveTeamKey;
export type PostMatchEventType = "golo" | "assistencia" | "defesa" | "cartao_amarelo" | "falta";

export type SavedPostMatch = {
  version: 1;
  matchId: string;
  status: "configurando" | "ao_vivo" | "aguardando_auditoria" | "auditada" | "concluida" | "expirada";
  createdAt: string;
  expiresAt: string;
  savedAt: string;
  gameMode: "fut5" | "fut7";
  teamCount: 2 | 3 | 4;
  teamNames: Record<"A" | "B" | "C" | "D", string>;
  players: LivePlayer[];
  playerTeams: Record<string, PostMatchTeamKey>;
  assignments?: Record<string, string | null>;
  currentPlayerId: string;
  miniGames: MiniGameSummary[];
  votedUserIds?: string[];
};

const KEY = "joga-ai-post-match-v1";

function scopedKey(matchId: string) {
  return `${KEY}-${matchId}`;
}

export function savePostMatch(data: SavedPostMatch) {
  localStorage.setItem(scopedKey(data.matchId), JSON.stringify(data));
}

export function loadPostMatch(matchId?: string): SavedPostMatch | null {
  try {
    if (matchId) {
      const scoped = localStorage.getItem(scopedKey(matchId));
      if (scoped) return JSON.parse(scoped) as SavedPostMatch;
    }

    const raw = localStorage.getItem(KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as SavedPostMatch;
    if (matchId && parsed.matchId !== matchId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearPostMatch(matchId?: string) {
  if (matchId) {
    localStorage.removeItem(scopedKey(matchId));
    return;
  }
  localStorage.removeItem(KEY);
}

export function isPostMatchExpired(data: SavedPostMatch | null) {
  if (!data?.expiresAt) return false;
  return Date.now() > new Date(data.expiresAt).getTime();
}
