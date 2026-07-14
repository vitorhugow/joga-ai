import { calculateOverall } from "@/lib/cardUtils";
import type { LivePlayer } from "@/lib/preMatchStorage";
import type { UserProfile } from "@/lib/userRepository";

/** Jogadores sem conta não têm OVR real — 0 = "sem rating" na UI. */
export const MANUAL_PLAYER_OVR = 0;

export function overallFromProfile(profile: Pick<UserProfile, "profileComplete" | "attributes">): number {
  if (!profile.profileComplete) return MANUAL_PLAYER_OVR;
  return calculateOverall(profile.attributes);
}

export function formatPlayerOverall(player: Pick<LivePlayer, "overall" | "manual" | "userId">): string {
  if (player.manual && !player.userId && player.overall <= MANUAL_PLAYER_OVR) {
    return "—";
  }
  return String(player.overall);
}

export function isUnsetOverall(player: Pick<LivePlayer, "overall" | "manual" | "userId">): boolean {
  return Boolean(player.manual && !player.userId && player.overall <= MANUAL_PLAYER_OVR);
}

/**
 * Capacidades por ordem: preenche A, depois B, depois C (etc.).
 * Cada equipa (excepto a última) recebe metade do que falta arredondada para cima;
 * a última fica com o resto — nunca divide tudo igual entre 3+ equipas.
 */
export function computeSequentialTeamCapacities(totalPlayers: number, teamCount: number): number[] {
  if (teamCount <= 0) return [];
  if (teamCount === 1) return [totalPlayers];
  if (teamCount === 2) {
    const capA = Math.ceil(totalPlayers / 2);
    return [capA, totalPlayers - capA];
  }

  const caps: number[] = [];
  let remaining = totalPlayers;

  for (let index = 0; index < teamCount - 1; index++) {
    const cap = Math.ceil(remaining / 2);
    caps.push(cap);
    remaining -= cap;
  }

  caps.push(remaining);
  return caps;
}
