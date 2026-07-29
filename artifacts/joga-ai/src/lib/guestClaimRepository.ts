/**
 * guestClaimRepository — reclamar carta de visitante após registo
 */

import { doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { db, isFirebaseConfigured } from "./firebase";
import { sanitizeLivePlayers, isOfflineFirestoreError } from "./firestoreUtils";
import { loadMatchFromFirestore, saveMatchRoster } from "./matchRepository";
import { loadUserProfile, applyMatchResultToProfile, type UserProfile } from "./userRepository";
import type { LivePlayer, LiveTeamKey } from "./preMatchStorage";
import { toast } from "@/hooks/use-toast";

export type GuestClaimToken = {
  matchId: string;
  guestId: string;
};

const PENDING_CLAIM_KEY = "joga-ai-pending-guest-claim";

export function storePendingGuestClaim(claim: string): void {
  try {
    sessionStorage.setItem(PENDING_CLAIM_KEY, claim);
  } catch {
    /* ignore */
  }
}

export function consumePendingGuestClaim(): string | null {
  try {
    const value = sessionStorage.getItem(PENDING_CLAIM_KEY);
    if (value) sessionStorage.removeItem(PENDING_CLAIM_KEY);
    return value;
  } catch {
    return null;
  }
}

export function parseGuestClaimParam(claim: string): GuestClaimToken | null {
  if (!claim.startsWith("guest-")) return null;
  const rest = claim.slice(6);
  const lastDash = rest.lastIndexOf("-");
  if (lastDash <= 0) return null;
  return { matchId: rest.slice(0, lastDash), guestId: rest.slice(lastDash + 1) };
}

export function buildGuestClaimLink(matchId: string, guestId: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/entrar?claim=guest-${matchId}-${guestId}`;
}

type GuestClaimMutation = {
  players: LivePlayer[];
  playerTeams: Record<string, LiveTeamKey>;
  assignments: Record<string, string | null>;
  guest: LivePlayer;
};

/**
 * Pura — encontra o jogador convidado (por guestId) num roster e devolve o
 * roster com a identidade dele substituída pela conta real. `null` se o
 * convidado já não existir nesse roster (reclamado ou removido por outra
 * escrita entretanto) ou pertencer a outra conta.
 */
function applyGuestClaim(
  players: LivePlayer[],
  playerTeams: Record<string, LiveTeamKey>,
  assignments: Record<string, string | null>,
  token: GuestClaimToken,
  userId: string,
  profile: UserProfile,
): GuestClaimMutation | null {
  const guestIdx = players.findIndex(
    (p) => p.guestId === token.guestId || p.id === `guest-${token.guestId}`,
  );
  if (guestIdx < 0) return null;

  const guest = players[guestIdx];
  if (guest.userId && guest.userId !== userId) return null;

  const updatedPlayers: LivePlayer[] = players.map((p, i) => {
    if (i !== guestIdx) return p;
    return {
      ...p,
      id: userId,
      userId,
      name: profile.displayName || p.name,
      position: profile.position || p.position,
      overall: profile.attributes
        ? Math.round(
            Object.values(profile.attributes).reduce((s, v) => s + v, 0) /
              Object.values(profile.attributes).length,
          )
        : p.overall,
      manual: false,
      loanCard: false,
      isMe: true,
    };
  });

  const updatedPlayerTeams = { ...playerTeams };
  const oldId = guest.id;
  if (updatedPlayerTeams[oldId]) {
    updatedPlayerTeams[userId] = updatedPlayerTeams[oldId];
    delete updatedPlayerTeams[oldId];
  }

  const updatedAssignments = { ...assignments };
  for (const key of Object.keys(updatedAssignments)) {
    if (updatedAssignments[key] === oldId) updatedAssignments[key] = userId;
  }

  return { players: updatedPlayers, playerTeams: updatedPlayerTeams, assignments: updatedAssignments, guest };
}

export async function claimGuestCard(
  userId: string,
  token: GuestClaimToken,
): Promise<boolean> {
  const match = await loadMatchFromFirestore(token.matchId);
  if (!match?.players?.length) return false;

  const profile = await loadUserProfile(userId, undefined, { preferRemote: true });

  const mutation = applyGuestClaim(
    match.players,
    match.playerTeams ?? {},
    match.assignments ?? {},
    token,
    userId,
    profile,
  );
  if (!mutation) return false;

  await saveMatchRoster(token.matchId, {
    gameMode: match.gameMode,
    teamCount: match.teamCount,
    teamNames: match.teamNames,
    players: mutation.players,
    playerTeams: mutation.playerTeams,
    assignments: mutation.assignments,
  });

  if (mutation.guest.loanCard && isFirebaseConfigured()) {
    // Escrita directa em separado (só para convidados com carta
    // emprestada) — corre numa transação: lê matches/{id} FRESCO e reaplica
    // a mesma mutação sobre esse estado actual, em vez de reescrever o
    // `mutation` calculado acima (que pode já estar desactualizado se
    // outro dispositivo mexeu no roster entre o load inicial e aqui).
    const ref = doc(db, "matches", token.matchId);
    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(ref);
        const remote = snap.exists() ? snap.data() : undefined;
        const freshPlayers = (remote?.players as LivePlayer[] | undefined) ?? [];
        const freshPlayerTeams = (remote?.playerTeams as Record<string, LiveTeamKey> | undefined) ?? {};
        const freshAssignments = (remote?.assignments as Record<string, string | null> | undefined) ?? {};

        const freshMutation = applyGuestClaim(
          freshPlayers,
          freshPlayerTeams,
          freshAssignments,
          token,
          userId,
          profile,
        );
        if (!freshMutation) return;

        tx.update(ref, {
          players: sanitizeLivePlayers(freshMutation.players),
          playerTeams: freshMutation.playerTeams,
          assignments: freshMutation.assignments,
          savedAt: serverTimestamp(),
        });
      });
    } catch (err) {
      console.warn("[guestClaim] firestore:", err);
      // Este ramo corre sempre em background (claimGuestCard é chamado com
      // `void`, sem UI própria à volta — ver AuthContext.tsx), por isso não
      // há nenhum catch de chamador para mostrar isto. Só avisa no caso de
      // falta de rede — outros erros ficam silenciosos como já estavam
      // antes, para não mudar esse comportamento sem necessidade.
      if (isOfflineFirestoreError(err)) {
        toast({
          title: "Sem ligação",
          description: "Não foi possível confirmar a tua carta emprestada agora. Tenta outra vez quando tiveres rede.",
          variant: "destructive",
        });
      }
    }
  }

  return true;
}

export async function mergeGuestStatsIntoProfile(
  userId: string,
  guestStats: { goals?: number; assists?: number; saves?: number },
): Promise<UserProfile | null> {
  if (!guestStats.goals && !guestStats.assists && !guestStats.saves) return null;

  await applyMatchResultToProfile(userId, {
    goals: guestStats.goals ?? 0,
    assists: guestStats.assists ?? 0,
    saves: guestStats.saves ?? 0,
    mvp: false,
    deferRating: true,
    voted: false,
  });

  return loadUserProfile(userId, undefined, { preferRemote: true });
}
