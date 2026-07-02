import type { PlayerAttributes } from "./cardUtils";
import type { EvolutionGain } from "./evolutionUtils";
import {
  getLastMatchAttributeDeltas,
  getOverallDeltaFromDeltas,
  type UserProfile,
} from "./userRepository";

export type EvolutionDisplayItem = {
  label: string;
  value: string;
  variant: "up" | "down";
};

const ATTR_LABELS: Record<keyof PlayerAttributes, string> = {
  ritmo: "Ritmo",
  fisico: "Físico",
  finalizacao: "Finalização",
  passe: "Passe",
  defesa: "Defesa",
  drible: "Drible",
};

const NON_ATTR_GAIN_TITLES = new Set(["Nota dos colegas"]);

function parseGainValue(value: string): number | null {
  const match = value.match(/^([+-]?\d+)/);
  if (!match) return null;
  return Number(match[1]);
}

/** Resumo para ecrã — sem motivos; pendente fica oculto. */
export function summarizeGainsForDisplay(gains: EvolutionGain[]): EvolutionDisplayItem[] {
  const applied = gains.filter(
    (gain) =>
      gain.type === "up" &&
      !NON_ATTR_GAIN_TITLES.has(gain.title) &&
      gain.value !== "—" &&
      gain.value !== "Com nota" &&
      !gain.value.startsWith("Em") &&
      !gain.value.startsWith("Por votar"),
  );

  if (applied.length === 0) return [];

  if (applied.length === 1) {
    const gain = applied[0];
    const numeric = parseGainValue(gain.value);
    return [
      {
        label: gain.title,
        value: gain.value,
        variant: numeric != null && numeric < 0 ? "down" : "up",
      },
    ];
  }

  const total = applied.reduce((sum, gain) => sum + (parseGainValue(gain.value) ?? 0), 0);
  return [
    {
      label: "Overall",
      value: total > 0 ? `+${total}` : `${total}`,
      variant: total >= 0 ? "up" : "down",
    },
  ];
}

/** Resumo a partir dos deltas reais do perfil (pós-jogo). */
export function formatEvolutionDisplayFromProfile(
  profile: UserProfile,
  matchId?: string,
): EvolutionDisplayItem[] {
  const deltas = getLastMatchAttributeDeltas(profile, matchId);
  if (!deltas) return [];

  const keys = (Object.keys(deltas) as (keyof PlayerAttributes)[]).filter(
    (key) => (deltas[key] ?? 0) !== 0,
  );
  if (keys.length === 0) return [];

  if (keys.length === 1) {
    const key = keys[0];
    const delta = deltas[key] ?? 0;
    return [
      {
        label: ATTR_LABELS[key],
        value: delta > 0 ? `+${delta}` : `${delta}`,
        variant: delta > 0 ? "up" : "down",
      },
    ];
  }

  const overallDelta = getOverallDeltaFromDeltas(profile.attributes, deltas);
  return [
    {
      label: "Overall",
      value: overallDelta > 0 ? `+${overallDelta}` : `${overallDelta}`,
      variant: overallDelta >= 0 ? "up" : "down",
    },
  ];
}
