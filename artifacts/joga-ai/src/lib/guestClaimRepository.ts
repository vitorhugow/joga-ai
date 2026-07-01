/**
 * guestClaimRepository — reclamar carta de visitante após registo
 */

import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db, isFirebaseConfigured } from "./firebase";
import { loadMatchFromFirestore, saveMatchRoster } from "./matchRepository";
import { loadUserProfile, applyMatchResultToProfile, type UserProfile } from "./userRepository";
import type { LivePlayer } from "./preMatchStorage";

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

export async function claimGuestCard(
  userId: string,
  token: GuestClaimToken,
): Promise<boolean> {
  const match = await loadMatchFromFirestore(token.matchId);
  if (!match?.players?.length) return false;

  const guestIdx = match.players.findIndex(
    (p) => p.guestId === token.guestId || p.id === `guest-${token.guestId}`,
  );
  if (guestIdx < 0) return false;

  const guest = match.players[guestIdx];
  if (guest.userId && guest.userId !== userId) return false;

  const profile = await loadUserProfile(userId, undefined, { preferRemote: true });

  const updatedPlayers: LivePlayer[] = match.players.map((p, i) => {
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

  const playerTeams = { ...match.playerTeams };
  const oldId = guest.id;
  if (playerTeams[oldId]) {
    playerTeams[userId] = playerTeams[oldId];
    delete playerTeams[oldId];
  }

  const assignments = { ...(match.assignments ?? {}) };
  for (const key of Object.keys(assignments)) {
    if (assignments[key] === oldId) assignments[key] = userId;
  }

  await saveMatchRoster(token.matchId, {
    gameMode: match.gameMode,
    teamCount: match.teamCount,
    teamNames: match.teamNames,
    players: updatedPlayers,
    playerTeams,
    assignments,
  });

  if (guest.loanCard && isFirebaseConfigured()) {
    try {
      await updateDoc(doc(db, "matches", token.matchId), {
        players: updatedPlayers,
        playerTeams,
        assignments,
        savedAt: serverTimestamp(),
      });
    } catch (err) {
      console.warn("[guestClaim] firestore:", err);
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
