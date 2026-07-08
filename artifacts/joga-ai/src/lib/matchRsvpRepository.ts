/**
 * matchRsvpRepository — confirmação de presença, saída e lista de espera
 */

import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db, isFirebaseConfigured } from "./firebase";
import {
  loadMatchFromFirestore,
  saveMatchRoster,
  type MatchRosterData,
} from "./matchRepository";
import { loadPreMatch } from "./preMatchStorage";
import { loadPostMatch, savePostMatch, type SavedPostMatch } from "./postMatchStorage";
import type { LivePlayer } from "./preMatchStorage";
import { loadCommunityMembers, loadCommunity } from "./communityRepository";
import { loadMatchDetails } from "./matchRepository";
import { addNotification } from "./notificationsRepository";
import { OPEN_MATCH_STATUSES, type MatchStatus } from "./matchRepository";

/** uids únicos dos jogadores com conta — usado pelas rules para validar
 *  que só participantes reais recebem ganhos/reverts do organizador. */
export function participantUserIdsFrom(players: LivePlayer[]): string[] {
  return Array.from(
    new Set(players.map((p) => p.userId).filter((id): id is string => Boolean(id))),
  );
}

export type WaitlistEntry = {
  userId: string;
  name: string;
  position: string;
  overall: number;
  joinedAt: string;
};

export type RsvpProfile = {
  displayName: string;
  position: string;
  overall: number;
};

function getMaxPlayers(match: SavedPostMatch, detailsMax?: number): number {
  if (detailsMax && detailsMax > 0) return detailsMax;
  return Math.max(4, match.players?.length ?? 10);
}

async function assertCommunityAccess(
  communityId: string | undefined,
  openToExternal: boolean | undefined,
  userId: string,
): Promise<void> {
  if (!communityId || openToExternal !== false) return;
  const members = await loadCommunityMembers(communityId);
  if (!members.some((m) => m.userId === userId)) {
    throw new Error("Esta pelada é só para membros da comunidade.");
  }
}

function findPlayerIndex(players: LivePlayer[], userId: string): number {
  return players.findIndex((p) => p.userId === userId || p.id === userId);
}

function findWaitlistIndex(waitlist: WaitlistEntry[], userId: string): number {
  return waitlist.findIndex((w) => w.userId === userId);
}

async function loadMatchState(matchId: string): Promise<SavedPostMatch | null> {
  return (await loadMatchFromFirestore(matchId)) ?? loadPostMatch(matchId);
}

async function persistRsvpState(
  matchId: string,
  match: SavedPostMatch,
  roster: MatchRosterData,
  waitlist: WaitlistEntry[],
): Promise<void> {
  const updated: SavedPostMatch = { ...match, waitlist };
  savePostMatch(updated);

  if (isFirebaseConfigured()) {
    try {
      await updateDoc(doc(db, "matches", matchId), {
        players: roster.players,
        participantUserIds: participantUserIdsFrom(roster.players),
        playerTeams: roster.playerTeams,
        assignments: roster.assignments ?? {},
        waitlist,
        savedAt: serverTimestamp(),
      });
    } catch (err) {
      console.warn("[matchRsvp] firestore update:", err);
      const code = (err as { code?: string })?.code;
      if (code === "permission-denied") {
        throw new Error("Sem permissão para confirmar presença nesta pelada.");
      }
      throw err;
    }
  }

  await saveMatchRoster(matchId, roster);
}

function normalizeMatchStatus(status?: string): MatchStatus {
  const value = (status || "configurando").toLowerCase() as MatchStatus;
  if (OPEN_MATCH_STATUSES.includes(value)) return value;
  if (value === "configurando") return "configurando";
  return value;
}

function canConfirmPresence(status?: string): boolean {
  return normalizeMatchStatus(status) === "configurando";
}

export { canConfirmPresence };

/** Confirma presença — entra no plantel ou lista de espera */
export async function confirmPresence(
  matchId: string,
  userId: string,
  profile: RsvpProfile,
): Promise<"confirmed" | "waitlist"> {
  const match = await loadMatchState(matchId);
  if (!match) throw new Error("Partida não encontrada.");

  const details = loadMatchDetails(matchId);
  const communityId = match.communityId ?? details?.communityId;

  if (!canConfirmPresence(match.status)) {
    throw new Error("Só podes confirmar presença antes do jogo começar.");
  }

  if (communityId) {
    const isMember = await isCommunityMember(communityId, userId);
    if (!isMember) {
      await assertCommunityAccess(communityId, details?.openToExternal, userId);
    }
  } else {
    await assertCommunityAccess(communityId, details?.openToExternal, userId);
  }

  const paymentsRequired =
    match.paymentsEnabled === true || details?.paymentsEnabled === true;
  const isOrganizer = match.organizerId === userId;
  const paidUserIds = match.paidUserIds ?? [];

  if (paymentsRequired && !isOrganizer) {
    const existingPlayer = (match.players ?? []).find(
      (p) => p.userId === userId || p.id === userId,
    );
    const hasPaid =
      paidUserIds.includes(userId) || existingPlayer?.paid === true;
    if (!hasPaid) {
      throw new Error("Paga a pelada online antes de confirmar presença.");
    }
  }

  const waitlist: WaitlistEntry[] = [...(match.waitlist ?? [])];
  const players: LivePlayer[] = [...(match.players ?? [])];
  const playerTeams = { ...(match.playerTeams ?? {}) };

  if (findPlayerIndex(players, userId) >= 0) return "confirmed";
  if (findWaitlistIndex(waitlist, userId) >= 0) return "waitlist";

  const maxPlayers = getMaxPlayers(match, details?.maxPlayers);

  const roster: MatchRosterData = {
    gameMode: match.gameMode,
    teamCount: match.teamCount,
    teamNames: match.teamNames,
    players,
    playerTeams,
    assignments: match.assignments ?? loadPreMatch(matchId)?.assignments ?? {},
  };

  if (players.length < maxPlayers) {
    const newPlayer: LivePlayer = {
      id: userId,
      userId,
      name: profile.displayName.trim() || "Jogador",
      position: profile.position || "MEI",
      overall: profile.overall || 50,
      paid: paymentsRequired && !isOrganizer ? true : false,
      isMe: true,
    };
    roster.players = [...players, newPlayer];
    roster.playerTeams = { ...playerTeams, [userId]: "BENCH" };
    await persistRsvpState(matchId, match, roster, waitlist);
    return "confirmed";
  }

  const entry: WaitlistEntry = {
    userId,
    name: profile.displayName.trim() || "Jogador",
    position: profile.position || "MEI",
    overall: profile.overall || 50,
    joinedAt: new Date().toISOString(),
  };
  waitlist.push(entry);
  await persistRsvpState(matchId, match, roster, waitlist);
  return "waitlist";
}

/** Sai da pelada ou da lista de espera */
export async function leaveMatch(matchId: string, userId: string): Promise<void> {
  const match = await loadMatchState(matchId);
  if (!match) throw new Error("Partida não encontrada.");
  if (match.organizerId === userId) {
    throw new Error("O organizador não pode sair da própria pelada.");
  }

  const waitlist: WaitlistEntry[] = [...(match.waitlist ?? [])];
  let players: LivePlayer[] = [...(match.players ?? [])];
  const playerTeams = { ...(match.playerTeams ?? {}) };
  const assignments = { ...(match.assignments ?? {}) };

  const wlIdx = findWaitlistIndex(waitlist, userId);
  if (wlIdx >= 0) {
    waitlist.splice(wlIdx, 1);
    const roster: MatchRosterData = {
      gameMode: match.gameMode,
      teamCount: match.teamCount,
      teamNames: match.teamNames,
      players,
      playerTeams,
      assignments,
    };
    await persistRsvpState(matchId, match, roster, waitlist);
    return;
  }

  const pIdx = findPlayerIndex(players, userId);
  if (pIdx < 0) return;

  const removedId = players[pIdx].id;
  players = players.filter((_, i) => i !== pIdx);
  delete playerTeams[removedId];
  for (const key of Object.keys(assignments)) {
    if (assignments[key] === removedId) assignments[key] = null;
  }

  const roster: MatchRosterData = {
    gameMode: match.gameMode,
    teamCount: match.teamCount,
    teamNames: match.teamNames,
    players,
    playerTeams,
    assignments,
  };

  await persistRsvpState(matchId, match, roster, waitlist);
  await promoteFromWaitlist(matchId);
}

/** Promove o primeiro da lista de espera para o plantel */
export async function promoteFromWaitlist(matchId: string): Promise<WaitlistEntry | null> {
  const match = await loadMatchState(matchId);
  if (!match) return null;

  const waitlist: WaitlistEntry[] = [...(match.waitlist ?? [])];
  if (!waitlist.length) return null;

  const details = loadMatchDetails(matchId);
  const maxPlayers = getMaxPlayers(match, details?.maxPlayers);
  const players: LivePlayer[] = [...(match.players ?? [])];
  if (players.length >= maxPlayers) return null;

  const promoted = waitlist.shift()!;
  const playerTeams = { ...(match.playerTeams ?? {}) };
  const newPlayer: LivePlayer = {
    id: promoted.userId,
    userId: promoted.userId,
    name: promoted.name,
    position: promoted.position,
    overall: promoted.overall,
    paid: false,
  };

  const roster: MatchRosterData = {
    gameMode: match.gameMode,
    teamCount: match.teamCount,
    teamNames: match.teamNames,
    players: [...players, newPlayer],
    playerTeams: { ...playerTeams, [promoted.userId]: "BENCH" },
    assignments: match.assignments ?? {},
  };

  await persistRsvpState(matchId, match, roster, waitlist);

  await addNotification(promoted.userId, {
    id: `promoted-${matchId}-${promoted.userId}`,
    title: "Entraste na pelada!",
    body: `Saiu uma vaga em «${match.title ?? "pelada"}» — estás confirmado.`,
    type: "match",
    link: `/partida/${matchId}/pre-jogo`,
  });

  return promoted;
}

/** Remove jogador (organizador) e promove lista de espera */
export async function removePlayerAndPromote(
  matchId: string,
  playerId: string,
): Promise<void> {
  const match = await loadMatchState(matchId);
  if (!match) return;

  const players = (match.players ?? []).filter((p) => p.id !== playerId);
  const playerTeams = { ...(match.playerTeams ?? {}) };
  delete playerTeams[playerId];
  const assignments = { ...(match.assignments ?? {}) };
  for (const key of Object.keys(assignments)) {
    if (assignments[key] === playerId) assignments[key] = null;
  }

  const roster: MatchRosterData = {
    gameMode: match.gameMode,
    teamCount: match.teamCount,
    teamNames: match.teamNames,
    players,
    playerTeams,
    assignments,
  };

  await persistRsvpState(matchId, match, roster, match.waitlist ?? []);
  await promoteFromWaitlist(matchId);
}

export async function isCommunityMember(communityId: string, userId: string): Promise<boolean> {
  const community = await loadCommunity(communityId, userId);
  if (community?.isMember || community?.adminId === userId) return true;

  const members = await loadCommunityMembers(communityId);
  return members.some((m) => m.userId === userId);
}

export async function getMatchOpenToExternal(matchId: string): Promise<boolean> {
  const details = loadMatchDetails(matchId);
  if (details?.openToExternal !== undefined) return details.openToExternal;
  if (!isFirebaseConfigured()) return true;
  try {
    const snap = await getDoc(doc(db, "matches", matchId));
    if (snap.exists()) {
      const data = snap.data();
      return data.openToExternal !== false;
    }
  } catch {
    /* ignore */
  }
  return true;
}

export function getMatchInviteUrl(matchId: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/partida/${matchId}/pre-jogo`;
}
