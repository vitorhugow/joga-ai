/**
 * entitlements — fundação do sistema PRO (Sprint 1).
 *
 * IMPORTANTE: o campo `entitlements` do perfil NUNCA é escrito pelo cliente.
 * As firestore.rules bloqueiam qualquer escrita cliente nesse campo; ele será
 * concedido exclusivamente por Firebase Functions (admin SDK) quando o
 * checkout Stripe confirmar a subscrição (Sprint 2). O cliente apenas LÊ.
 */

export type EntitlementPlan = "player_pro" | "organizer_pro";

export type Entitlements = {
  /** PRO ativo (fonte de verdade: webhook Stripe via Functions) */
  pro?: boolean;
  /** ISO date — fim do período pago atual */
  proUntil?: string;
  plan?: EntitlementPlan;
};

/** Preços fechados (Sprint alinhado a 04/07/2026) */
export const PRICING = {
  playerProMonthly: 4.99,
  playerProAnnual: 49.9,
  organizerProMonthly: 9.99,
  organizerProAnnual: 99.9,
  /** Pagamentos/mês isentos de taxa no plano organizador */
  organizerNoFeeCap: 50,
  /** Taxa de conveniência por pagamento de pelada (Sprint 3) */
  playerFeePerPayment: 0.5,
} as const;

/** Equivalente mensal de um preço anual (para mostrar na UI) */
export function monthlyEquivalentFromAnnual(annualTotal: number): string {
  return (annualTotal / 12).toFixed(2).replace(".", ",");
}

/** PRO ativo neste momento? (valida também a data de expiração) */
export function isProActive(entitlements?: Entitlements | null): boolean {
  if (!entitlements?.pro) return false;
  if (!entitlements.proUntil) return true;
  return Date.now() < new Date(entitlements.proUntil).getTime();
}

export function isOrganizerPro(entitlements?: Entitlements | null): boolean {
  return isProActive(entitlements) && entitlements?.plan === "organizer_pro";
}
