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
/** Faixa usada só na geração da carta inicial (aleatória, OVR 50). */
const GEN_MAX_STAT = 78;
/** Teto real de um atributo ao longo da carreira do jogador. */
export const ATTRIBUTE_CAP = 99;

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

/** Clamp genérico usado para perdas/reverts — teto real (99), não o da geração. */
function clampStat(value: number): number {
  return Math.max(MIN_STAT, Math.min(ATTRIBUTE_CAP, value));
}

function clampGenStat(value: number): number {
  return Math.max(MIN_STAT, Math.min(GEN_MAX_STAT, value));
}

/**
 * Soma `amount` (sempre positivo) ao atributo `key`. Assim que esse atributo
 * atinge o limite de 99, o que sobrar dos pontos "transborda" para o
 * atributo com o valor mais baixo da carta atual — os pontos nunca se
 * perdem, só mudam de sítio.
 */
export function addAttributePoints(
  attrs: PlayerAttributes,
  key: keyof PlayerAttributes,
  amount: number,
): PlayerAttributes {
  if (amount <= 0) return attrs;

  const result: PlayerAttributes = { ...attrs };
  let remaining = amount;
  let targetKey = key;
  let guard = 0;

  while (remaining > 0 && guard < 100) {
    guard += 1;
    const current = result[targetKey];
    const room = ATTRIBUTE_CAP - current;

    if (room <= 0) {
      // Já está no limite: procura o atributo mais baixo da carta para
      // continuar a distribuir o resto dos pontos.
      targetKey = STAT_KEYS.reduce((lowest, k) => (result[k] < result[lowest] ? k : lowest), STAT_KEYS[0]);
      if (result[targetKey] >= ATTRIBUTE_CAP) break; // carta toda a 99, não há para onde ir
      continue;
    }

    const applied = Math.min(room, remaining);
    result[targetKey] = current + applied;
    remaining -= applied;

    if (remaining > 0) {
      targetKey = STAT_KEYS.reduce((lowest, k) => (result[k] < result[lowest] ? k : lowest), STAT_KEYS[0]);
    }
  }

  return result;
}

/** Aplica um delta (positivo ou negativo) a um atributo, com overflow (ver addAttributePoints) só quando soma. */
function applyStatDelta(
  attrs: PlayerAttributes,
  key: keyof PlayerAttributes,
  delta: number,
): PlayerAttributes {
  if (delta > 0) return addAttributePoints(attrs, key, delta);
  if (delta < 0) return { ...attrs, [key]: clampStat(attrs[key] + delta) };
  return attrs;
}

function shuffleStatsPreservingSum(values: number[], iterations = 10): number[] {
  const next = [...values];
  for (let i = 0; i < iterations; i += 1) {
    const from = Math.floor(Math.random() * next.length);
    const to = Math.floor(Math.random() * next.length);
    if (from === to) continue;
    if (next[from] > MIN_STAT && next[to] < GEN_MAX_STAT) {
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
    clampGenStat(Math.round((raw[index] / rawTotal) * targetSum)),
  );

  let diff = targetSum - values.reduce((acc, val) => acc + val, 0);
  let guard = 0;
  while (diff !== 0 && guard < 200) {
    const index = guard % values.length;
    if (diff > 0 && values[index] < GEN_MAX_STAT) {
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

/**
 * Distribuição manual no cadastro: o jogador reparte 300 pontos pelos 6
 * atributos (soma = 300 → OVR inicial 50, igual à geração aleatória), com um
 * piso e um teto por atributo para evitar cartas absurdas logo ao início.
 */
export const ALLOCATION_TOTAL_POINTS = 300;
export const ALLOCATION_MIN_PER_ATTRIBUTE = 20;
export const ALLOCATION_MAX_PER_ATTRIBUTE = 60;

export function createInitialAllocation(): PlayerAttributes {
  return STAT_KEYS.reduce((acc, key) => {
    acc[key] = ALLOCATION_MIN_PER_ATTRIBUTE;
    return acc;
  }, {} as PlayerAttributes);
}

export function allocationPointsUsed(attrs: PlayerAttributes): number {
  return STAT_KEYS.reduce((sum, key) => sum + attrs[key], 0);
}

export function allocationPointsRemaining(attrs: PlayerAttributes): number {
  return ALLOCATION_TOTAL_POINTS - allocationPointsUsed(attrs);
}

export function isValidInitialAllocation(attrs: PlayerAttributes): boolean {
  const sum = allocationPointsUsed(attrs);
  if (sum !== ALLOCATION_TOTAL_POINTS) return false;
  return STAT_KEYS.every(
    (key) => attrs[key] >= ALLOCATION_MIN_PER_ATTRIBUTE && attrs[key] <= ALLOCATION_MAX_PER_ATTRIBUTE,
  );
}

export const ATTRIBUTE_KEYS: readonly (keyof PlayerAttributes)[] = STAT_KEYS;

export type MatchEventGains = {
  goals: number;
  assists: number;
  saves: number;
  fouls?: number;
  yellowCards?: number;
  position?: string;
  voted?: boolean;
  isTopScorer?: boolean;
};

/** Nota média dos colegas → Drible (DRI) */
export const RATING_DRIBLE_MIN = 8;

export function computeRatingAttributeDeltas(
  rating: number,
): Partial<PlayerAttributes> {
  const deltas: Partial<PlayerAttributes> = {};
  if (rating >= RATING_DRIBLE_MIN) deltas.drible = 1;
  return deltas;
}

export function applyRatingGainsToCard(
  currentAttrs: PlayerAttributes,
  rating: number,
): PlayerAttributes {
  const deltas = computeRatingAttributeDeltas(rating);
  return applyStatDelta(currentAttrs, "drible", deltas.drible ?? 0);
}

/** +1 Físico por jogar a pelada */
export function applyParticipationGainsToCard(
  currentAttrs: PlayerAttributes,
): PlayerAttributes {
  return applyStatDelta(currentAttrs, "fisico", 1);
}

/** Reverte +1 Físico de participação */
export function revertParticipationGainsFromCard(
  currentAttrs: PlayerAttributes,
): PlayerAttributes {
  return {
    ...currentAttrs,
    fisico: clampStat(currentAttrs.fisico - 1),
  };
}

/** Ganhos na votação: eventos, votar (+Ritmo), faltas/cartões (−Ritmo), artilheiro */
export function applyVoteGainsToCard(
  currentAttrs: PlayerAttributes,
  events: MatchEventGains,
): PlayerAttributes {
  const fouls = events.fouls ?? 0;
  const yellowCards = events.yellowCards ?? 0;

  let ritmoDelta = 0;
  if (events.voted) ritmoDelta += 1;
  ritmoDelta -= fouls + yellowCards;

  let finalizacaoGain = events.goals > 0 ? events.goals : 0;
  const defesaGain = events.saves;

  if (events.isTopScorer) {
    finalizacaoGain += 1;
  }

  // Aplica cada delta em sequência: ganhos positivos usam addAttributePoints
  // (transbordam para o atributo mais baixo ao atingir 99); perdas só
  // fazem clamp normal.
  let result = applyStatDelta(currentAttrs, "ritmo", ritmoDelta);
  result = applyStatDelta(result, "finalizacao", finalizacaoGain);
  result = applyStatDelta(result, "passe", events.assists);
  result = applyStatDelta(result, "defesa", defesaGain);
  return result;
}

/**
 * Reverte ganhos de votação aplicados por applyVoteGainsToCard.
 * Nota: se o ganho original tiver "transbordado" para outro atributo (por
 * ter batido no limite de 99), o revert subtrai sempre do atributo de
 * origem — em teoria isso pode deixar esse atributo um pouco mais baixo do
 * que estava antes do ganho. É um caso extremo (exige o atributo já perto
 * de 99) e o revert só acontece ao apagar/corrigir uma partida.
 */
export function revertVoteGainsFromCard(
  currentAttrs: PlayerAttributes,
  events: MatchEventGains,
): PlayerAttributes {
  const fouls = events.fouls ?? 0;
  const yellowCards = events.yellowCards ?? 0;

  let ritmoDelta = 0;
  if (events.voted) ritmoDelta -= 1;
  ritmoDelta += fouls + yellowCards;

  let finalizacaoLoss = events.goals > 0 ? events.goals : 0;
  if (events.isTopScorer) finalizacaoLoss += 1;

  return {
    ritmo: clampStat(currentAttrs.ritmo + ritmoDelta),
    finalizacao: clampStat(currentAttrs.finalizacao - finalizacaoLoss),
    passe: clampStat(currentAttrs.passe - events.assists),
    defesa: clampStat(currentAttrs.defesa - events.saves),
    drible: currentAttrs.drible,
    fisico: currentAttrs.fisico,
  };
}

/** Reverte ganho de Drible por nota ≥ limiar */
export function revertRatingGainsFromCard(
  currentAttrs: PlayerAttributes,
  rating: number,
): PlayerAttributes {
  const deltas = computeRatingAttributeDeltas(rating);
  return {
    ...currentAttrs,
    drible: clampStat(currentAttrs.drible - (deltas.drible ?? 0)),
  };
}

/** @deprecated Use applyVoteGainsToCard */
export function applyEventGainsToCard(
  currentAttrs: PlayerAttributes,
  events: MatchEventGains,
): PlayerAttributes {
  return applyVoteGainsToCard(currentAttrs, { ...events, voted: true });
}

/** @deprecated Use applyEventGainsToCard — mantido para compatibilidade interna */
export function applyMatchStatsToCard(
  currentAttrs: PlayerAttributes,
  matchPerformance: number,
): PlayerAttributes {
  return applyVoteGainsToCard(currentAttrs, {
    goals: matchPerformance > 8 ? 1 : 0,
    assists: 0,
    saves: 0,
    voted: true,
  });
}
