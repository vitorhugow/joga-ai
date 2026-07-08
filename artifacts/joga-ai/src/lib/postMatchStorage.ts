import type { LivePlayer, LiveTeamKey } from "./preMatchStorage";
import type { MiniGameSummary } from "./evolutionUtils";
import type { WaitlistEntry } from "./matchRsvpRepository";

export type { WaitlistEntry };

export type PostMatchTeamKey = LiveTeamKey;
export type PostMatchEventType = "golo" | "assistencia" | "defesa" | "cartao_amarelo" | "falta";

export type SavedPostMatch = {
  /** Pagamentos in-app ativos nesta pelada (organizador opt-in) */
  paymentsEnabled?: boolean;
  proBadge?: boolean;
  version: 1;
  matchId: string;
  status: "configurando" | "ao_vivo" | "aguardando_auditoria" | "auditada" | "concluida" | "expirada" | "cancelada";
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
  title?: string;
  communityId?: string;
  organizerId?: string;
  waitlist?: WaitlistEntry[];
  maxPlayers?: number;
  openToExternal?: boolean;
  /** Jogadores que pagaram online mas ainda não confirmaram presença */
  paidUserIds?: string[];
};

const KEY_PREFIX = "joga-ai-post-match-v1-";
const LEGACY_KEY = "joga-ai-post-match-v1";
const MATCH_IDS_KEY = "joga-ai-match-ids-v1";

function storageKey(matchId: string) {
  return `${KEY_PREFIX}${matchId}`;
}

function readMatchIds(): string[] {
  try {
    const raw = localStorage.getItem(MATCH_IDS_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function writeMatchIds(ids: string[]) {
  const unique = [...new Set(ids)];
  localStorage.setItem(MATCH_IDS_KEY, JSON.stringify(unique.slice(0, 50)));
}

function migrateLegacyIfNeeded(): string | null {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SavedPostMatch;
    if (data?.matchId) {
      localStorage.setItem(storageKey(data.matchId), raw);
      writeMatchIds([data.matchId, ...readMatchIds()]);
      localStorage.removeItem(LEGACY_KEY);
      return data.matchId;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function savePostMatch(data: SavedPostMatch) {
  if (!data.matchId) return;
  localStorage.setItem(storageKey(data.matchId), JSON.stringify(data));
  writeMatchIds([data.matchId, ...readMatchIds()]);
}

export function loadPostMatch(matchId?: string): SavedPostMatch | null {
  migrateLegacyIfNeeded();

  if (matchId) {
    try {
      const raw = localStorage.getItem(storageKey(matchId));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as SavedPostMatch;
      return parsed.matchId === matchId ? parsed : null;
    } catch {
      return null;
    }
  }

  const ids = readMatchIds();
  for (const id of ids) {
    const match = loadPostMatch(id);
    if (match && match.status !== "concluida" && match.status !== "expirada") {
      return match;
    }
  }
  return ids.length > 0 ? loadPostMatch(ids[0]) : null;
}

export function loadAllPostMatches(): SavedPostMatch[] {
  migrateLegacyIfNeeded();
  return readMatchIds()
    .map((id) => loadPostMatch(id))
    .filter((m): m is SavedPostMatch => m !== null);
}

export function clearPostMatch(matchId?: string) {
  if (matchId) {
    localStorage.removeItem(storageKey(matchId));
    writeMatchIds(readMatchIds().filter((id) => id !== matchId));
    return;
  }
  readMatchIds().forEach((id) => localStorage.removeItem(storageKey(id)));
  localStorage.removeItem(MATCH_IDS_KEY);
  localStorage.removeItem(LEGACY_KEY);
}

export function isPostMatchExpired(data: SavedPostMatch | null) {
  if (!data?.expiresAt) return false;
  return Date.now() > new Date(data.expiresAt).getTime();
}
