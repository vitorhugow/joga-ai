import { getCurrentUserId } from "./auth";
import { loadPostMatch } from "./postMatchStorage";

export const MATCH_USER_KEY = "joga-ai-current-user-id-v3";

/** Chaves globais legadas — apenas leitura de fallback para não perder dados atuais */
const LEGACY_KEYS = {
  auditors: "joga-ai-current-match-auditors-v3",
  confirmed: "joga-ai-current-match-confirmed-v3",
  votes: "joga-ai-current-match-votes-v3",
  voteDraft: "joga-ai-current-match-vote-draft-v3",
} as const;

export type MatchFlowKeys = {
  auditors: string;
  confirmed: string;
  voteDraft: string;
  votes: string;
};

export type MatchVoteRecord = {
  userId: string;
  ratings: Record<string, number>;
  createdAt: string;
};

export function normalizeMatchId(matchId?: string | null): string {
  const id = String(matchId ?? "").trim();
  return id || "default";
}

export function getRouteMatchIdFromPath(pathname = window.location.pathname): string | null {
  const match = pathname.match(/\/partida\/([^/]+)\//);
  return match?.[1] ?? null;
}

export function resolveMatchId(options?: {
  routeMatchId?: string | null;
  storedMatchId?: string | null;
}): string {
  return normalizeMatchId(
    options?.storedMatchId || options?.routeMatchId || getRouteMatchIdFromPath()
  );
}

export function matchFlowKeys(matchId?: string | null): MatchFlowKeys {
  const id = normalizeMatchId(matchId);
  return {
    auditors: `joga-ai-match-${id}-auditors`,
    confirmed: `joga-ai-match-${id}-confirmed`,
    voteDraft: `joga-ai-match-${id}-vote-draft`,
    votes: `joga-ai-match-${id}-votes`,
  };
}

function hasStorageKey(key: string) {
  return localStorage.getItem(key) !== null;
}

export function readMatchList(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveMatchList(key: string, list: string[]) {
  localStorage.setItem(key, JSON.stringify(list));
}

export function readMatchJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function readScopedList(scopedKey: string, legacyKey: string): string[] {
  if (hasStorageKey(scopedKey)) {
    return readMatchList(scopedKey);
  }
  return readMatchList(legacyKey);
}

function saveScopedList(scopedKey: string, list: string[]) {
  saveMatchList(scopedKey, list);
}

function readScopedJson<T>(scopedKey: string, legacyKey: string, fallback: T): T {
  if (hasStorageKey(scopedKey)) {
    return readMatchJson(scopedKey, fallback);
  }
  return readMatchJson(legacyKey, fallback);
}

function saveScopedJson<T>(scopedKey: string, value: T) {
  localStorage.setItem(scopedKey, JSON.stringify(value));
}

export function createMatchFlowStore(matchId?: string | null) {
  const id = normalizeMatchId(matchId);
  const keys = matchFlowKeys(id);

  return {
    matchId: id,
    keys,
    readAuditors: () => readScopedList(keys.auditors, LEGACY_KEYS.auditors),
    saveAuditors: (list: string[]) => saveScopedList(keys.auditors, list),
    readConfirmed: () => readScopedList(keys.confirmed, LEGACY_KEYS.confirmed),
    saveConfirmed: (list: string[]) => saveScopedList(keys.confirmed, list),
    readVoteDraft: () =>
      readScopedJson<Record<string, number>>(keys.voteDraft, LEGACY_KEYS.voteDraft, {}),
    saveVoteDraft: (draft: Record<string, number>) => saveScopedJson(keys.voteDraft, draft),
    readVotes: () => readScopedJson<MatchVoteRecord[]>(keys.votes, LEGACY_KEYS.votes, []),
    saveVotes: (votes: MatchVoteRecord[]) => saveScopedJson(keys.votes, votes),
    upsertVote: (vote: MatchVoteRecord) => {
      const votes = readScopedJson<MatchVoteRecord[]>(keys.votes, LEGACY_KEYS.votes, []);
      const next = votes.filter((item) => item.userId !== vote.userId);
      next.push(vote);
      saveScopedJson(keys.votes, next);
      return next;
    },
    mergeRemoteVotes: (remoteVotes: MatchVoteRecord[]) => {
      const local = readScopedJson<MatchVoteRecord[]>(keys.votes, LEGACY_KEYS.votes, []);
      const merged = [...local];
      for (const remote of remoteVotes) {
        const index = merged.findIndex((item) => item.userId === remote.userId);
        if (index >= 0) merged[index] = remote;
        else merged.push(remote);
      }
      if (remoteVotes.length > 0 || merged.length > 0) {
        saveScopedJson(keys.votes, merged);
      }
      return merged;
    },
  };
}

/**
 * Retorna o ID de utilizador actual.
 * Usa Firebase Auth se disponível; caso contrário UUID localStorage.
 * Esta função é síncrona — para garantir que Firebase Auth já inicializou,
 * usa `ensureAnonymousAuth()` de `@/lib/auth` antes de chamar esta.
 */
export function currentMatchUserId(): string {
  return getCurrentUserId();
}

export function resetMatchFlowSession(matchId?: string | null) {
  const keys = matchFlowKeys(matchId);

  localStorage.removeItem(keys.auditors);
  localStorage.removeItem(keys.confirmed);
  localStorage.removeItem(keys.votes);
  localStorage.removeItem(keys.voteDraft);

  // Limpa cache global legado para não contaminar a nova partida
  localStorage.removeItem(LEGACY_KEYS.auditors);
  localStorage.removeItem(LEGACY_KEYS.confirmed);
  localStorage.removeItem(LEGACY_KEYS.votes);
  localStorage.removeItem(LEGACY_KEYS.voteDraft);
}

export function hasUserVotedInSession(userId: string, matchId?: string | null) {
  const store = createMatchFlowStore(matchId);
  if (store.readVotes().some((vote) => vote.userId === userId)) return true;

  const post = loadPostMatch(matchId ?? undefined);
  const resolvedId = normalizeMatchId(matchId ?? post?.matchId);
  if (post?.matchId === resolvedId && post.votedUserIds?.includes(userId)) {
    return true;
  }

  return false;
}
