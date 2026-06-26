export type PlayerAttributes = {
  ritmo: number;
  finalizacao: number;
  passe: number;
  defesa: number;
  drible: number;
  fisico: number;
};

export const STARTING_OVERALL = 50;

const STAT_KEYS: (keyof PlayerAttributes)[] = [
  "ritmo",
  "finalizacao",
  "passe",
  "defesa",
  "drible",
  "fisico",
];

/** Pesos por posição — definem o “formato” da carta, não o OVR */
const POSITION_WEIGHTS: Record<string, Record<keyof PlayerAttributes, number>> = {
  AVA: { ritmo: 1.12, finalizacao: 1.22, passe: 0.88, defesa: 0.62, drible: 1.1, fisico: 1.02 },
  DEF: { ritmo: 0.92, finalizacao: 0.68, passe: 0.95, defesa: 1.28, drible: 0.82, fisico: 1.18 },
  MEI: { ritmo: 1.0, finalizacao: 0.92, passe: 1.22, defesa: 0.88, drible: 1.14, fisico: 1.0 },
  GR: { ritmo: 0.78, finalizacao: 0.62, passe: 0.92, defesa: 1.18, drible: 0.68, fisico: 1.12 },
};

const MIN_STAT = 28;
const MAX_STAT = 78;

const STAT_COUNT = 6;

/**
 * Regra global do OVR — vale em todos os níveis (50, 51, 74, 99…):
 * OVR = floor(média dos 6 atributos).
 * Só sobe para N+1 quando a média atinge o inteiro N+1 (soma ≥ (N+1)×6).
 * Ex.: média 61,99 → OVR 61; média 62,0 → OVR 62.
 */
export function calculateOverall(attributes: PlayerAttributes): number {
  const sum = Object.values(attributes).reduce((acc, val) => acc + val, 0);
  return Math.floor(sum / STAT_COUNT);
}

export function calculateOverallAverage(attributes: PlayerAttributes): number {
  const sum = Object.values(attributes).reduce((acc, val) => acc + val, 0);
  return sum / STAT_COUNT;
}

/** Soma mínima dos atributos para um OVR (ex.: 51 → 306). */
export function minAttributeSumForOverall(overall: number): number {
  return overall * STAT_COUNT;
}

/** Maior soma inteira que ainda mantém o OVR (ex.: 50 → 305, média 50,83). */
export function maxAttributeSumForOverall(overall: number): number {
  return overall * STAT_COUNT + (STAT_COUNT - 1);
}

export function overallDelta(before: PlayerAttributes, after: PlayerAttributes): number {
  return calculateOverall(after) - calculateOverall(before);
}

function clampStat(value: number): number {
  return Math.max(MIN_STAT, Math.min(MAX_STAT, value));
}

function shuffleStatsPreservingSum(values: number[], iterations = 10): number[] {
  const next = [...values];
  for (let i = 0; i < iterations; i += 1) {
    const from = Math.floor(Math.random() * next.length);
    const to = Math.floor(Math.random() * next.length);
    if (from === to) continue;
    if (next[from] > MIN_STAT && next[to] < MAX_STAT) {
      next[from] -= 1;
      next[to] += 1;
    }
  }
  return next;
}

function distributeAttributes(position: string, targetSum: number): PlayerAttributes {
  const weights = POSITION_WEIGHTS[position] ?? POSITION_WEIGHTS.AVA;

  const raw = STAT_KEYS.map((key) => weights[key] * (0.82 + Math.random() * 0.36));
  const rawTotal = raw.reduce((acc, val) => acc + val, 0);

  let values = STAT_KEYS.map((_, index) =>
    clampStat(Math.round((raw[index] / rawTotal) * targetSum)),
  );

  let diff = targetSum - values.reduce((acc, val) => acc + val, 0);
  let guard = 0;
  while (diff !== 0 && guard < 200) {
    const index = guard % values.length;
    if (diff > 0 && values[index] < MAX_STAT) {
      values[index] += 1;
      diff -= 1;
    } else if (diff < 0 && values[index] > MIN_STAT) {
      values[index] -= 1;
      diff += 1;
    }
    guard += 1;
  }

  values = shuffleStatsPreservingSum(values, 12);

  return {
    ritmo: values[0],
    finalizacao: values[1],
    passe: values[2],
    defesa: values[3],
    drible: values[4],
    fisico: values[5],
  };
}

/**
 * Carta nova: atributos aleatórios por posição, OVR inicial sempre 50.
 * Soma ∈ [minOVR×6, maxOVR×6] → média até 50,83 (< 51).
 */
export function generateInitialAttributes(position?: string): PlayerAttributes {
  const pos = position && POSITION_WEIGHTS[position] ? position : "AVA";
  const minSum = minAttributeSumForOverall(STARTING_OVERALL);
  const maxSum = maxAttributeSumForOverall(STARTING_OVERALL);
  const targetSum = minSum + Math.floor(Math.random() * (maxSum - minSum + 1));
  return distributeAttributes(pos, targetSum);
}

export function applyMatchStatsToCard(
  currentAttrs: PlayerAttributes,
  matchPerformance: number,
): PlayerAttributes {
  return {
    ritmo: currentAttrs.ritmo + (matchPerformance > 8 ? 1 : 0),
    finalizacao: currentAttrs.finalizacao + (matchPerformance > 8 ? 1 : 0),
    passe: currentAttrs.passe + (matchPerformance > 8 ? 1 : 0),
    defesa: currentAttrs.defesa,
    drible: currentAttrs.drible + (matchPerformance > 8 ? 1 : 0),
    fisico: currentAttrs.fisico + (matchPerformance > 8 ? 1 : 0),
  };
}
