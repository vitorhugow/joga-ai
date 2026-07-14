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

export type GameModeRoster = "fut5" | "fut7";

/** Jogadores por equipa em campo (Fut5 = 5, Fut7 = 7). */
export function fieldPlayersPerSide(gameMode: GameModeRoster): number {
  return gameMode === "fut5" ? 5 : 7;
}

export type RandomizeCapacityResult = {
  capacities: number[];
  /** Aviso quando há 3+ equipas activas mas jogadores insuficientes. */
  notifyInsufficientTeams?: string;
};

/**
 * Sorteio: enche A (5 ou 7), depois B (5 ou 7), resto vai para C.
 * Com menos de 2×capacidade, divide só entre A e B.
 */
export function computeSequentialTeamCapacities(
  totalPlayers: number,
  teamCount: number,
  gameMode: GameModeRoster,
): RandomizeCapacityResult {
  if (teamCount <= 0 || totalPlayers <= 0) {
    return { capacities: [] };
  }

  const perSide = fieldPlayersPerSide(gameMode);
  const minForFullAb = perSide * 2;
  const caps = new Array(teamCount).fill(0);

  if (totalPlayers < minForFullAb) {
    caps[0] = Math.ceil(totalPlayers / 2);
    if (teamCount > 1) caps[1] = totalPlayers - caps[0];

    const notifyInsufficientTeams =
      teamCount > 2
        ? `Só há ${totalPlayers} jogadores — sorteamos A e B. Para 3 ou 4 equipas completas precisas de pelo menos ${minForFullAb}.`
        : undefined;

    return { capacities: caps, notifyInsufficientTeams };
  }

  caps[0] = perSide;
  if (teamCount > 1) caps[1] = perSide;

  const overflow = totalPlayers - minForFullAb;
  if (overflow > 0 && teamCount >= 3) {
    caps[2] = overflow;
  }

  let notifyInsufficientTeams: string | undefined;
  if (teamCount >= 4 && overflow === 0) {
    notifyInsufficientTeams =
      `Com ${totalPlayers} jogadores temos A e B completos (${perSide}+${perSide}) — equipas C e D ficam vazias.`;
  } else if (teamCount >= 4 && overflow > 0) {
    notifyInsufficientTeams =
      `Sobram ${overflow} jogador(es) para a equipa C — não há jogadores suficientes para a equipa D.`;
  } else if (teamCount === 3 && overflow === 0) {
    notifyInsufficientTeams =
      `Com ${totalPlayers} jogadores temos A e B completos — a equipa C fica vazia.`;
  }

  return { capacities: caps, notifyInsufficientTeams };
}
