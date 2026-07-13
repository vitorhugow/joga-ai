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
