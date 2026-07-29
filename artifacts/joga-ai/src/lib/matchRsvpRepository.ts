/**
 * matchRsvpRepository — confirmação de presença, saída e lista de espera
 */

import { doc, getDoc, runTransaction, serverTimestamp } from "firebase/firestore";
import { db, isFirebaseConfigured } from "./firebase";
import { sanitizeLivePlayers, isOfflineFirestoreError } from "./firestoreUtils";
import {
  loadMatchFromFirestore,
  saveMatchRoster,
  type MatchRosterData,
} from "./matchRepository";
import { savePreMatch } from "./preMatchStorage";
import { loadPostMatch, savePostMatch, type SavedPostMatch } from "./postMatchStorage";
import type { LivePlayer, LiveTeamKey } from "./preMatchStorage";
import { getCurrentUserId } from "./auth";
import { MANUAL_PLAYER_OVR } from "./rosterUtils";
import { loadCommunityMembers, loadCommunity, isCommunityOrganizerPro } from "./communityRepository";
import { loadMatchDetails } from "./matchRepository";
import { resolveAccessMode } from "./matchAccess";
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

async function assertMatchAccess(
  communityId: string | undefined,
  accessMode: ReturnType<typeof resolveAccessMode>,
  userId: string,
): Promise<void> {
  if (accessMode !== "community") return;
  if (!communityId) {
    throw new Error("Esta pelada é só para membros do clube.");
  }
  const community = await loadCommunity(communityId);
  if (community?.openToExternal && (await isCommunityOrganizerPro(communityId))) return;

  const members = await loadCommunityMembers(communityId);
  if (!members.some((m) => m.userId === userId)) {
    throw new Error("Esta pelada é só para membros do clube.");
  }
}

function findPlayerIndex(players: LivePlayer[], userId: string): number {
  return players.findIndex((p) => p.userId === userId || p.id === userId);
}

function findWaitlistIndex(waitlist: WaitlistEntry[], userId: string): number {
  return waitlist.findIndex((w) => w.userId === userId);
}

async function loadMatchState(matchId: string): Promise<SavedPostMatch | null> {
  return (await loadMatchFromFirestore(matchId, { preferRemote: true })) ?? loadPostMatch(matchId);
}

type RosterSnapshot = {
  players: LivePlayer[];
  playerTeams: Record<string, LiveTeamKey>;
  assignments: Record<string, string | null>;
  waitlist: WaitlistEntry[];
};

function snapshotFromMatchDoc(remote: Record<string, unknown> | undefined): RosterSnapshot {
  return {
    players: (remote?.players as LivePlayer[] | undefined) ?? [],
    playerTeams: (remote?.playerTeams as Record<string, LiveTeamKey> | undefined) ?? {},
    assignments: (remote?.assignments as Record<string, string | null> | undefined) ?? {},
    waitlist: (remote?.waitlist as WaitlistEntry[] | undefined) ?? [],
  };
}

/**
 * Aplica uma mutação ao roster dentro de uma transação — lê matches/{id}
 * FRESCO no momento da escrita (não o `match` possivelmente desactualizado
 * carregado no início da função chamadora) e só grava a diferença dessa
 * mutação específica. Corrige a perda silenciosa de alterações quando dois
 * dispositivos mexem na mesma pelada quase ao mesmo tempo — antes, cada um
 * escrevia o array `players` inteiro por cima do outro. O Firestore repete a
 * transação sozinho se o documento mudar entre a leitura e a escrita, por
 * isso `mutate` tem de ser puro e pode correr mais do que uma vez por
 * chamada — nunca depende de estado de fora que não venha do `fresh` lido
 * aqui dentro.
 *
 * `mutate` devolve a MESMA referência `fresh` (não uma cópia) quando não há
 * nada para gravar — sinaliza a `persistRsvpMutation` para não fazer
 * nenhuma escrita (nem no Firestore nem na cache local), tal como as
 * funções antigas evitavam escritas sem efeito.
 */
async function persistRsvpMutation(
  matchId: string,
  match: SavedPostMatch,
  mutate: (fresh: RosterSnapshot) => RosterSnapshot,
): Promise<RosterSnapshot> {
  let result: RosterSnapshot;
  let changed: boolean;

  if (isFirebaseConfigured()) {
    const ref = doc(db, "matches", matchId);
    // Capturado de dentro do callback da transação — o Firestore pode
    // repetir o callback inteiro em caso de contenção, por isso esta
    // variável fica sempre com o valor da ÚLTIMA tentativa (a que
    // realmente comitou), nunca de uma tentativa descartada.
    let didWrite = false;
    try {
      result = await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        const fresh = snapshotFromMatchDoc(snap.exists() ? snap.data() : undefined);
        const next = mutate(fresh);
        if (next === fresh) {
          didWrite = false;
          return fresh;
        }

        tx.update(ref, {
          players: sanitizeLivePlayers(next.players),
          participantUserIds: participantUserIdsFrom(next.players),
          playerTeams: next.playerTeams,
          assignments: next.assignments,
          waitlist: next.waitlist,
          savedAt: serverTimestamp(),
        });
        didWrite = true;
        return next;
      });
    } catch (err) {
      console.warn("[matchRsvp] transação:", err);
      const code = (err as { code?: string })?.code;
      if (code === "permission-denied") {
        throw new Error("Sem permissão para confirmar presença nesta pelada.");
      }
      // runTransaction não beneficia do persistentLocalCache (ao contrário
      // do updateDoc que esta função substituiu) — falha logo quando não
      // há ligação, em vez de ficar em fila e sincronizar mais tarde.
      if (isOfflineFirestoreError(err)) {
        throw new Error("Sem ligação. Tenta outra vez quando tiveres rede.");
      }
      throw err;
    }
    changed = didWrite;
  } else {
    const fresh: RosterSnapshot = {
      players: match.players ?? [],
      playerTeams: match.playerTeams ?? {},
      assignments: match.assignments ?? {},
      waitlist: match.waitlist ?? [],
    };
    result = mutate(fresh);
    changed = result !== fresh;
  }

  if (!changed) return result;

  const updated: SavedPostMatch = {
    ...match,
    players: result.players,
    playerTeams: result.playerTeams,
    assignments: result.assignments,
    waitlist: result.waitlist,
  };
  savePostMatch(updated);

  const roster: MatchRosterData = {
    gameMode: match.gameMode,
    teamCount: match.teamCount,
    teamNames: match.teamNames,
    players: result.players,
    playerTeams: result.playerTeams,
    assignments: result.assignments,
    waitlist: result.waitlist,
  };

  const uid = getCurrentUserId();
  if (uid && match.organizerId === uid) {
    await saveMatchRoster(matchId, roster);
  } else {
    syncLocalPreMatchFromRoster(matchId, roster);
  }

  return result;
}

function syncLocalPreMatchFromRoster(matchId: string, roster: MatchRosterData) {
  savePreMatch(
    {
      version: 1,
      matchId,
      gameMode: roster.gameMode,
      teamCount: roster.teamCount,
      teamNames: roster.teamNames,
      players: roster.players,
      playerTeams: roster.playerTeams,
      assignments: roster.assignments ?? {},
      savedAt: new Date().toISOString(),
    },
    matchId,
  );
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
  const accessMode = resolveAccessMode({
    accessMode: match.accessMode ?? details?.accessMode,
    openToExternal: match.openToExternal ?? details?.openToExternal,
    communityId,
  });

  if (!canConfirmPresence(match.status)) {
    throw new Error("Só podes confirmar presença antes do jogo começar.");
  }

  if (communityId) {
    const isMember = await isCommunityMember(communityId, userId);
    if (!isMember) {
      await assertMatchAccess(communityId, accessMode, userId);
    }
  } else if (accessMode === "community") {
    throw new Error("Esta pelada é só para membros do clube.");
  } else {
    await assertMatchAccess(communityId, accessMode, userId);
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
      throw new Error("Paga a pelada online para confirmar presença.");
    }
  }

  const maxPlayers = getMaxPlayers(match, details?.maxPlayers);

  // A decisão "já confirmado? já em espera? há vaga?" corre aqui dentro,
  // sobre o `fresh` lido no momento da escrita — não sobre o `players`/
  // `waitlist` de `match` (carregado no início da função, pode já estar
  // desactualizado se outro dispositivo mexeu na pelada entretanto).
  let outcome: "confirmed" | "waitlist" = "confirmed";
  await persistRsvpMutation(matchId, match, (fresh) => {
    if (findPlayerIndex(fresh.players, userId) >= 0) {
      outcome = "confirmed";
      return fresh;
    }
    if (findWaitlistIndex(fresh.waitlist, userId) >= 0) {
      outcome = "waitlist";
      return fresh;
    }

    if (fresh.players.length < maxPlayers) {
      const newPlayer: LivePlayer = {
        id: userId,
        userId,
        name: profile.displayName.trim() || "Jogador",
        position: profile.position || "MEI",
        overall: profile.overall > MANUAL_PLAYER_OVR ? profile.overall : MANUAL_PLAYER_OVR,
        paid: paymentsRequired && !isOrganizer ? true : false,
        isMe: true,
      };
      outcome = "confirmed";
      return {
        ...fresh,
        players: [...fresh.players, newPlayer],
        playerTeams: { ...fresh.playerTeams, [userId]: "BENCH" },
      };
    }

    const entry: WaitlistEntry = {
      userId,
      name: profile.displayName.trim() || "Jogador",
      position: profile.position || "MEI",
      overall: profile.overall > MANUAL_PLAYER_OVR ? profile.overall : MANUAL_PLAYER_OVR,
      joinedAt: new Date().toISOString(),
    };
    outcome = "waitlist";
    return { ...fresh, waitlist: [...fresh.waitlist, entry] };
  });

  return outcome;
}

/** Sai da pelada ou da lista de espera */
export async function leaveMatch(matchId: string, userId: string): Promise<void> {
  const match = await loadMatchState(matchId);
  if (!match) throw new Error("Partida não encontrada.");
  if (match.organizerId === userId) {
    throw new Error("O organizador não pode sair da própria pelada.");
  }

  // `freedSlot` só é true quando um jogador (não alguém em espera) sai —
  // é a única situação em que vale a pena tentar promover da lista de
  // espera a seguir. Capturado dentro de `mutate`, sobre o `fresh` lido no
  // momento da escrita — mesma razão de ser do `outcome` em confirmPresence.
  let freedSlot = false;
  await persistRsvpMutation(matchId, match, (fresh) => {
    const waitlist = [...fresh.waitlist];
    const wlIdx = findWaitlistIndex(waitlist, userId);
    if (wlIdx >= 0) {
      waitlist.splice(wlIdx, 1);
      freedSlot = false;
      return { ...fresh, waitlist };
    }

    const players = [...fresh.players];
    const pIdx = findPlayerIndex(players, userId);
    if (pIdx < 0) {
      freedSlot = false;
      return fresh;
    }

    const removedId = players[pIdx].id;
    const nextPlayers = players.filter((_, i) => i !== pIdx);
    const playerTeams = { ...fresh.playerTeams };
    delete playerTeams[removedId];
    const assignments = { ...fresh.assignments };
    for (const key of Object.keys(assignments)) {
      if (assignments[key] === removedId) assignments[key] = null;
    }

    freedSlot = true;
    return { players: nextPlayers, playerTeams, assignments, waitlist };
  });

  if (freedSlot) {
    // Passo "bónus" à parte — se falhar (ex: rede caiu mesmo depois do
    // "sair" ter sido gravado com sucesso), não deve fazer esta função
    // parecer ter falhado por inteiro nem accionar um revert no chamador.
    try {
      await promoteFromWaitlist(matchId);
    } catch (err) {
      console.warn("[matchRsvp] promoteFromWaitlist após leaveMatch:", err);
    }
  }
}

/** Promove o primeiro da lista de espera para o plantel */
export async function promoteFromWaitlist(matchId: string): Promise<WaitlistEntry | null> {
  const match = await loadMatchState(matchId);
  if (!match) return null;

  const details = loadMatchDetails(matchId);
  const maxPlayers = getMaxPlayers(match, details?.maxPlayers);

  let promoted: WaitlistEntry | null = null;
  await persistRsvpMutation(matchId, match, (fresh) => {
    if (!fresh.waitlist.length || fresh.players.length >= maxPlayers) {
      promoted = null;
      return fresh;
    }

    const waitlist = [...fresh.waitlist];
    const entry = waitlist.shift()!;
    promoted = entry;
    const newPlayer: LivePlayer = {
      id: entry.userId,
      userId: entry.userId,
      name: entry.name,
      position: entry.position,
      overall: entry.overall,
      paid: false,
    };

    return {
      players: [...fresh.players, newPlayer],
      playerTeams: { ...fresh.playerTeams, [entry.userId]: "BENCH" },
      assignments: fresh.assignments,
      waitlist,
    };
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

  await persistRsvpMutation(matchId, match, (fresh) => {
    const players = fresh.players.filter((p) => p.id !== playerId);
    const playerTeams = { ...fresh.playerTeams };
    delete playerTeams[playerId];
    const assignments = { ...fresh.assignments };
    for (const key of Object.keys(assignments)) {
      if (assignments[key] === playerId) assignments[key] = null;
    }
    return { players, playerTeams, assignments, waitlist: fresh.waitlist };
  });

  // Idem leaveMatch — não deixar uma falha aqui parecer que a remoção
  // (já gravada) falhou.
  try {
    await promoteFromWaitlist(matchId);
  } catch (err) {
    console.warn("[matchRsvp] promoteFromWaitlist após removePlayerAndPromote:", err);
  }
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
  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://jogaai.pt";
  return `${origin}/og/partida/${matchId}`;
}

/** Destino real da app (após preview OG). */
export function getMatchAppUrl(matchId: string): string {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://jogaai.pt";
  return `${origin}/partida/${matchId}/pre-jogo`;
}
