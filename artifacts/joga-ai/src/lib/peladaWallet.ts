/** Preço da pelada em cêntimos (sem taxa de serviço). */
export function peladaPriceCents(price?: string | null): number | null {
  if (!price?.trim()) return null;
  const value = parseFloat(price.trim().replace(",", ".").replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(value) || value <= 0) return null;
  const cents = Math.round(value * 100);
  if (cents < 50 || cents > 500) return null;
  return cents;
}

/** Total em cêntimos (preço + taxa 0,50€) para checkout Stripe. */
export function peladaCheckoutTotalCents(price?: string | null): number | null {
  const priceCents = peladaPriceCents(price);
  if (priceCents == null) return null;
  return priceCents + 50;
}

export function formatCentsEuro(cents: number): string {
  return `${(cents / 100).toFixed(2).replace(".", ",")}€`;
}
