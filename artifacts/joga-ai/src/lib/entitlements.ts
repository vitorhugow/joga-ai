/**
 * entitlements — fundação do sistema PRO (Sprint 1).
 *
 * IMPORTANTE: o campo `entitlements` do perfil NUNCA é escrito pelo cliente.
 * As firestore.rules bloqueiam qualquer escrita cliente nesse campo; ele será
 * concedido exclusivamente por Firebase Functions (admin SDK) quando o
 * checkout Stripe confirmar a subscrição (Sprint 2). O cliente apenas LÊ.
 */

export type EntitlementPlan = "player_pro" | "organizer_pro";

export type PlanEntitlementSlot = {
  active?: boolean;
  proUntil?: string | null;
  subscriptionId?: string | null;
  proCommunityId?: string;
};

export type Entitlements = {
  /** PRO ativo (derivado: playerPro || organizerPro; retrocompat com campo legado) */
  pro?: boolean;
  /** ISO date — fim do período pago actual (plano principal) */
  proUntil?: string;
  plan?: EntitlementPlan;
  /** Clube PRO activo nesta comunidade (última subscrição organizador) */
  proCommunityId?: string;
  /** Mapa comunidade → validade (várias subs possíveis) */
  proCommunities?: Record<string, { proUntil?: string; subscriptionId?: string }>;
  /** Subscrição Jogador PRO (independente) */
  playerPro?: PlanEntitlementSlot;
  /** Subscrição Organizador PRO (independente) */
  organizerPro?: PlanEntitlementSlot;
};

/** Preços fechados (Sprint alinhado a 04/07/2026) */
export const PRICING = {
  playerProMonthly: 4.99,
  playerProAnnual: 49.9,
  organizerProMonthly: 9.99,
  organizerProAnnual: 99.9,
  /** Taxa de conveniência por pagamento de pelada (Sprint 3) */
  playerFeePerPayment: 0.5,
} as const;

/** Equivalente mensal de um preço anual (para mostrar na UI) */
export function monthlyEquivalentFromAnnual(annualTotal: number): string {
  return (annualTotal / 12).toFixed(2).replace(".", ",");
}

function slotActive(slot?: PlanEntitlementSlot | null): boolean {
  if (!slot?.active) return false;
  if (!slot.proUntil) return true;
  return Date.now() < new Date(slot.proUntil).getTime();
}

function legacyProActive(entitlements?: Entitlements | null): boolean {
  if (!entitlements) return false;
  if (entitlements.playerPro || entitlements.organizerPro) {
    return slotActive(entitlements.playerPro) || slotActive(entitlements.organizerPro);
  }
  if (!entitlements.pro) return false;
  if (!entitlements.proUntil) return true;
  return Date.now() < new Date(entitlements.proUntil).getTime();
}

/** PRO ativo neste momento? (valida também a data de expiração) */
export function isProActive(entitlements?: Entitlements | null): boolean {
  return legacyProActive(entitlements);
}

export function isOrganizerPro(entitlements?: Entitlements | null): boolean {
  if (entitlements?.organizerPro) return slotActive(entitlements.organizerPro);
  return isProActive(entitlements) && entitlements?.plan === "organizer_pro";
}

/** Clube PRO activo para uma comunidade específica. */
export function isOrganizerProForCommunity(
  entitlements?: Entitlements | null,
  communityId?: string | null,
): boolean {
  if (!isOrganizerPro(entitlements)) return false;
  if (!communityId) return true;
  const club = entitlements?.proCommunities?.[communityId];
  if (club?.proUntil) {
    return Date.now() < new Date(club.proUntil).getTime();
  }
  const orgCommunity =
    entitlements?.organizerPro?.proCommunityId ?? entitlements?.proCommunityId;
  return orgCommunity === communityId;
}

/** PRO Jogador (inclui quem tem PRO Organizador — tem tudo do jogador). */
export function hasPlayerPro(entitlements?: Entitlements | null): boolean {
  if (entitlements?.playerPro || entitlements?.organizerPro) {
    return slotActive(entitlements.playerPro) || slotActive(entitlements.organizerPro);
  }
  return isProActive(entitlements);
}

/** Subscrição Jogador PRO activa (exclui só Clube PRO sem Jogador PRO). */
export function hasPlayerProOnly(entitlements?: Entitlements | null): boolean {
  if (entitlements?.playerPro) return slotActive(entitlements.playerPro);
  if (entitlements?.organizerPro) return false;
  return isProActive(entitlements) && entitlements?.plan === "player_pro";
}
