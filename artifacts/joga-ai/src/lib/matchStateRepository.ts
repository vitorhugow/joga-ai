/**
 * Estado da partida (pré-jogo + ao vivo) em Firestore.
 * Fonte de verdade: matches/{matchId}/state/setup e state/live.
 * localStorage (preMatchStorage) é cache de leitura apenas.
 */

import {
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { db, isFirebaseConfigured } from "./firebase";
import { stripUndefined } from "./firestoreUtils";
import { getCurrentUserId } from "./auth";
import {
  loadPreMatch,
  savePreMatch,
  type LiveTeamKey,
  type SavedPreMatch,
} from "./preMatchStorage";

export type LiveClockStatus = "idle" | "running" | "paused" | "ended";

export type MatchSetupState = {
  gameMode: "fut5" | "fut7";
  teamCount: 2 | 3 | 4;
  teamNames: Record<"A" | "B" | "C" | "D", string>;
  playerTeams: Record<string, LiveTeamKey>;
  assignments: Record<string, string | null>;
  miniGameConfig?: { durationMin?: number };
  migratedFromLocal?: boolean;
  updatedAt?: unknown;
  updatedBy?: string;
};

export type LiveEventRecord = {
  id: string;
  type: string;
  playerId: string;
  playerName: string;
  team: string;
  time: string;
  miniGameId: string;
};

export type LiveMiniGameRecord = {
  id: string;
  title: string;
  scoreA: number;
  scoreB: number;
  homeTeam: string;
  awayTeam: string;
  events: LiveEventRecord[];
  winner: string;
};

export type MatchLiveState = {
  status: LiveClockStatus;
  currentMiniGameId: string | null;
  startedAt: Timestamp | null;
  accumulatedMs: number;
  scoreA: number;
  scoreB: number;
  activeHomeTeam: string;
  activeAwayTeam: string;
  showNextGamePicker: boolean;
  nextHomeTeam: string;
  nextAwayTeam: string;
  events: LiveEventRecord[];
  miniGames: LiveMiniGameRecord[];
  updatedAt?: unknown;
  updatedBy?: string;
};

export type ParsedMatchLiveState = MatchLiveState & {
  startedAtMs: number | null;
};

const LIVE_CACHE_PREFIX = "joga-ai-live-cache-v1-";
const MIGRATED_KEY_PREFIX = "joga-ai-setup-migrated-v1-";

function setupRef(matchId: string) {
  return doc(db, "matches", matchId, "state", "setup");
}

function liveRef(matchId: string) {
  return doc(db, "matches", matchId, "state", "live");
}

function parseTimestampMs(value: unknown): number | null {
  if (!value) return null;
  if (value instanceof Timestamp) return value.toMillis();
  if (typeof value === "object" && value !== null && "seconds" in value) {
    return Number((value as { seconds: number }).seconds) * 1000;
  }
  if (typeof value === "object" && value !== null && "_seconds" in value) {
    return Number((value as { _seconds: number })._seconds) * 1000;
  }
  return null;
}

export function parseLiveState(data: MatchLiveState | undefined | null): ParsedMatchLiveState | null {
  if (!data) return null;
  return {
    ...data,
    status: data.status ?? "idle",
    currentMiniGameId: data.currentMiniGameId ?? null,
    startedAt: data.startedAt ?? null,
    accumulatedMs: data.accumulatedMs ?? 0,
    scoreA: data.scoreA ?? 0,
    scoreB: data.scoreB ?? 0,
    activeHomeTeam: data.activeHomeTeam ?? "A",
    activeAwayTeam: data.activeAwayTeam ?? "B",
    showNextGamePicker: data.showNextGamePicker ?? true,
    nextHomeTeam: data.nextHomeTeam ?? "A",
    nextAwayTeam: data.nextAwayTeam ?? "B",
    events: data.events ?? [],
    miniGames: data.miniGames ?? [],
    startedAtMs: parseTimestampMs(data.startedAt),
  };
}

export function computeElapsedMs(live: ParsedMatchLiveState | null): number {
  if (!live) return 0;
  const base = live.accumulatedMs ?? 0;
  if (live.status !== "running" || live.startedAtMs == null) return base;
  return base + Math.max(0, Date.now() - live.startedAtMs);
}

export function computeElapsedSeconds(live: ParsedMatchLiveState | null): number {
  return Math.floor(computeElapsedMs(live) / 1000);
}

export function formatLiveTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const secs = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${secs}`;
}

export function defaultLiveState(): MatchLiveState {
  return {
    status: "idle",
    currentMiniGameId: null,
    startedAt: null,
    accumulatedMs: 0,
    scoreA: 0,
    scoreB: 0,
    activeHomeTeam: "A",
    activeAwayTeam: "B",
    showNextGamePicker: true,
    nextHomeTeam: "A",
    nextAwayTeam: "B",
    events: [],
    miniGames: [],
  };
}

function cacheLiveLocally(matchId: string, live: ParsedMatchLiveState | null) {
  try {
    if (!live) {
      window.localStorage.removeItem(`${LIVE_CACHE_PREFIX}${matchId}`);
      return;
    }
    window.localStorage.setItem(
      `${LIVE_CACHE_PREFIX}${matchId}`,
      JSON.stringify({ ...live, startedAt: live.startedAtMs }),
    );
  } catch {
    /* cache opcional */
  }
}

export function loadCachedLive(matchId: string): ParsedMatchLiveState | null {
  try {
    const raw = window.localStorage.getItem(`${LIVE_CACHE_PREFIX}${matchId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MatchLiveState & { startedAt?: number | null };
    const startedAtMs =
      typeof parsed.startedAt === "number" ? parsed.startedAt : parseTimestampMs(parsed.startedAt);
    return parseLiveState({
      ...parsed,
      startedAt: startedAtMs != null ? Timestamp.fromMillis(startedAtMs) : null,
    });
  } catch {
    return null;
  }
}

export function cacheSetupFromSnapshot(matchId: string, setup: MatchSetupState, players: SavedPreMatch["players"]) {
  const now = new Date().toISOString();
  savePreMatch(
    {
      version: 1,
      matchId,
      gameMode: setup.gameMode,
      teamCount: setup.teamCount,
      teamNames: setup.teamNames,
      players,
      playerTeams: setup.playerTeams,
      assignments: setup.assignments,
      savedAt: now,
    },
    matchId,
  );
}

export function setupFromRoster(roster: {
  gameMode: "fut5" | "fut7";
  teamCount: 2 | 3 | 4;
  teamNames: Record<"A" | "B" | "C" | "D", string>;
  playerTeams: Record<string, LiveTeamKey>;
  assignments: Record<string, string | null>;
}): MatchSetupState {
  return {
    gameMode: roster.gameMode,
    teamCount: roster.teamCount,
    teamNames: roster.teamNames,
    playerTeams: roster.playerTeams,
    assignments: roster.assignments,
    miniGameConfig: { durationMin: 10 },
  };
}

export function subscribeToSetup(
  matchId: string,
  callback: (setup: MatchSetupState | null) => void,
): Unsubscribe {
  if (!isFirebaseConfigured() || !matchId || matchId === "default") {
    return () => {};
  }

  return onSnapshot(
    setupRef(matchId),
    (snap) => {
      callback(snap.exists() ? (snap.data() as MatchSetupState) : null);
    },
    (err) => console.warn("[matchStateRepository] subscribeToSetup:", err),
  );
}

export function subscribeToLive(
  matchId: string,
  callback: (live: ParsedMatchLiveState | null) => void,
): Unsubscribe {
  if (!isFirebaseConfigured() || !matchId || matchId === "default") {
    return () => {};
  }

  return onSnapshot(
    liveRef(matchId),
    (snap) => {
      const parsed = snap.exists() ? parseLiveState(snap.data() as MatchLiveState) : null;
      if (parsed) cacheLiveLocally(matchId, parsed);
      callback(parsed);
    },
    (err) => console.warn("[matchStateRepository] subscribeToLive:", err),
  );
}

export async function updateSetup(
  matchId: string,
  patch: Partial<MatchSetupState>,
): Promise<void> {
  if (!isFirebaseConfigured()) return;

  const uid = getCurrentUserId();
  await setDoc(
    setupRef(matchId),
    stripUndefined({
      ...patch,
      updatedAt: serverTimestamp(),
      updatedBy: uid ?? null,
    }),
    { merge: true },
  );
}

export async function updateLive(
  matchId: string,
  patch: Partial<MatchLiveState>,
): Promise<void> {
  if (!isFirebaseConfigured()) return;

  const uid = getCurrentUserId();
  await setDoc(
    liveRef(matchId),
    stripUndefined({
      ...patch,
      updatedAt: serverTimestamp(),
      updatedBy: uid ?? null,
    }),
    { merge: true },
  );
}

export async function ensureLiveDoc(matchId: string): Promise<void> {
  if (!isFirebaseConfigured()) return;

  const snap = await getDoc(liveRef(matchId));
  if (snap.exists()) return;

  await setDoc(
    liveRef(matchId),
    stripUndefined({
      ...defaultLiveState(),
      updatedAt: serverTimestamp(),
      updatedBy: getCurrentUserId() ?? null,
    }),
  );
}

/** Upload único do setup local → Firestore (organizador). */
export async function ensureSetupMigrated(
  matchId: string,
  organizerId: string,
  players: SavedPreMatch["players"],
): Promise<void> {
  if (!isFirebaseConfigured()) return;
  if (getCurrentUserId() !== organizerId) return;

  const migratedFlag = window.localStorage.getItem(`${MIGRATED_KEY_PREFIX}${matchId}`);
  const remoteSnap = await getDoc(setupRef(matchId));
  if (remoteSnap.exists() || migratedFlag === "1") return;

  const local = loadPreMatch(matchId);
  if (!local) return;

  await setDoc(
    setupRef(matchId),
    stripUndefined({
      gameMode: local.gameMode,
      teamCount: local.teamCount,
      teamNames: local.teamNames,
      playerTeams: local.playerTeams,
      assignments: local.assignments,
      miniGameConfig: { durationMin: 10 },
      migratedFromLocal: true,
      updatedAt: serverTimestamp(),
      updatedBy: organizerId,
    }),
  );

  cacheSetupFromSnapshot(
    matchId,
    {
      gameMode: local.gameMode,
      teamCount: local.teamCount,
      teamNames: local.teamNames,
      playerTeams: local.playerTeams,
      assignments: local.assignments,
    },
    players.length ? players : local.players,
  );

  window.localStorage.setItem(`${MIGRATED_KEY_PREFIX}${matchId}`, "1");
}

export async function confirmNextMiniGame(
  matchId: string,
  homeTeam: string,
  awayTeam: string,
): Promise<void> {
  if (!isFirebaseConfigured()) return;

  const miniGameId = `mg-${Date.now()}`;

  await runTransaction(db, async (tx) => {
    const ref = liveRef(matchId);
    const snap = await tx.get(ref);
    const live = parseLiveState(snap.exists() ? (snap.data() as MatchLiveState) : defaultLiveState())!;

    tx.set(
      ref,
      stripUndefined({
        activeHomeTeam: homeTeam,
        activeAwayTeam: awayTeam,
        showNextGamePicker: false,
        currentMiniGameId: miniGameId,
        scoreA: 0,
        scoreB: 0,
        events: [],
        accumulatedMs: 0,
        startedAt: null,
        status: "paused" as LiveClockStatus,
        updatedAt: serverTimestamp(),
        updatedBy: getCurrentUserId() ?? null,
      }),
      { merge: true },
    );
  });
}

export async function startClock(matchId: string): Promise<void> {
  if (!isFirebaseConfigured()) return;

  await runTransaction(db, async (tx) => {
    const ref = liveRef(matchId);
    const snap = await tx.get(ref);
    const live = parseLiveState(snap.exists() ? (snap.data() as MatchLiveState) : defaultLiveState())!;
    if (live.showNextGamePicker) return;

    tx.set(
      ref,
      stripUndefined({
        status: "running",
        startedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        updatedBy: getCurrentUserId() ?? null,
      }),
      { merge: true },
    );
  });
}

export async function pauseClock(matchId: string): Promise<void> {
  if (!isFirebaseConfigured()) return;

  await runTransaction(db, async (tx) => {
    const ref = liveRef(matchId);
    const snap = await tx.get(ref);
    if (!snap.exists()) return;

    const live = parseLiveState(snap.data() as MatchLiveState)!;
    if (live.status !== "running") return;

    const startedAtMs = live.startedAtMs ?? Date.now();
    const newAccumulated = live.accumulatedMs + Math.max(0, Date.now() - startedAtMs);

    tx.set(
      ref,
      stripUndefined({
        status: "paused",
        startedAt: null,
        accumulatedMs: newAccumulated,
        updatedAt: serverTimestamp(),
        updatedBy: getCurrentUserId() ?? null,
      }),
      { merge: true },
    );
  });
}

export async function toggleClock(matchId: string): Promise<void> {
  const snap = await getDoc(liveRef(matchId));
  const live = parseLiveState(snap.exists() ? (snap.data() as MatchLiveState) : null);
  if (live?.status === "running") {
    await pauseClock(matchId);
  } else {
    await startClock(matchId);
  }
}

export async function resetClock(matchId: string): Promise<void> {
  await updateLive(matchId, {
    accumulatedMs: 0,
    startedAt: null,
    status: "paused",
  });
}

export async function setNextTeams(
  matchId: string,
  nextHomeTeam: string,
  nextAwayTeam: string,
): Promise<void> {
  await updateLive(matchId, { nextHomeTeam, nextAwayTeam });
}

export async function setShowNextGamePicker(matchId: string, value: boolean): Promise<void> {
  await updateLive(matchId, { showNextGamePicker: value });
}

export type AddEventInput = {
  eventId: string;
  type: string;
  playerId: string;
  playerName: string;
  team: string;
  time: string;
  miniGameId: string;
};

/** Idempotente: ignora se o eventId já existir no estado. */
export async function addLiveEventAction(matchId: string, input: AddEventInput): Promise<boolean> {
  if (!isFirebaseConfigured()) return false;

  let added = false;
  await runTransaction(db, async (tx) => {
    const ref = liveRef(matchId);
    const snap = await tx.get(ref);
    if (!snap.exists()) return;

    const live = parseLiveState(snap.data() as MatchLiveState)!;
    if (live.status !== "running") return;
    if (live.events.some((e) => e.id === input.eventId)) return;

    const event: LiveEventRecord = {
      id: input.eventId,
      type: input.type,
      playerId: input.playerId,
      playerName: input.playerName,
      team: input.team,
      time: input.time,
      miniGameId: input.miniGameId,
    };

    let scoreA = live.scoreA;
    let scoreB = live.scoreB;
    if (input.type === "golo") {
      if (input.team === live.activeHomeTeam) scoreA += 1;
      if (input.team === live.activeAwayTeam) scoreB += 1;
    }

    added = true;
    tx.set(
      ref,
      stripUndefined({
        events: [event, ...live.events],
        scoreA,
        scoreB,
        updatedAt: serverTimestamp(),
        updatedBy: getCurrentUserId() ?? null,
      }),
      { merge: true },
    );
  });

  return added;
}

export async function undoLastEvent(matchId: string): Promise<void> {
  await runTransaction(db, async (tx) => {
    const ref = liveRef(matchId);
    const snap = await tx.get(ref);
    if (!snap.exists()) return;

    const live = parseLiveState(snap.data() as MatchLiveState)!;
    if (!live.events.length) return;

    const [removed, ...rest] = live.events;
    let scoreA = live.scoreA;
    let scoreB = live.scoreB;
    if (removed.type === "golo") {
      if (removed.team === live.activeHomeTeam) scoreA = Math.max(0, scoreA - 1);
      if (removed.team === live.activeAwayTeam) scoreB = Math.max(0, scoreB - 1);
    }

    tx.set(
      ref,
      stripUndefined({
        events: rest,
        scoreA,
        scoreB,
        updatedAt: serverTimestamp(),
        updatedBy: getCurrentUserId() ?? null,
      }),
      { merge: true },
    );
  });
}

export async function endMiniGame(
  matchId: string,
  teamNames: Record<string, string>,
): Promise<LiveMiniGameRecord | null> {
  let created: LiveMiniGameRecord | null = null;

  await runTransaction(db, async (tx) => {
    const ref = liveRef(matchId);
    const snap = await tx.get(ref);
    if (!snap.exists()) return;

    const live = parseLiveState(snap.data() as MatchLiveState)!;
    if (live.showNextGamePicker) return;

    const home = live.activeHomeTeam;
    const away = live.activeAwayTeam;
    const scoreA = live.scoreA;
    const scoreB = live.scoreB;
    const winner =
      scoreA === scoreB
        ? "Empate"
        : scoreA > scoreB
          ? teamNames[home] ?? home
          : teamNames[away] ?? away;

    const miniGameId = `game-${Date.now()}`;
    const miniGame: LiveMiniGameRecord = {
      id: miniGameId,
      title: `${teamNames[home] ?? home} ${scoreA} x ${scoreB} ${teamNames[away] ?? away}`,
      scoreA,
      scoreB,
      homeTeam: home,
      awayTeam: away,
      events: live.events,
      winner,
    };
    created = miniGame;

    tx.set(
      ref,
      stripUndefined({
        miniGames: [...live.miniGames, miniGame],
        scoreA: 0,
        scoreB: 0,
        events: [],
        accumulatedMs: 0,
        startedAt: null,
        status: "paused",
        nextHomeTeam: home,
        nextAwayTeam: away,
        showNextGamePicker: true,
        currentMiniGameId: null,
        updatedAt: serverTimestamp(),
        updatedBy: getCurrentUserId() ?? null,
      }),
      { merge: true },
    );
  });

  return created;
}

export async function markLiveEnded(matchId: string): Promise<void> {
  await updateLive(matchId, { status: "ended", startedAt: null });
}
