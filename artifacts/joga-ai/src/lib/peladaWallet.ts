/** Total em cêntimos (preço + taxa 0,50€) para uma pelada online. */
export function peladaCheckoutTotalCents(price?: string | null): number | null {
  if (!price?.trim()) return null;
  const value = parseFloat(price.trim().replace(",", ".").replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(value) || value <= 0) return null;
  const priceCents = Math.round(value * 100);
  if (priceCents < 50 || priceCents > 500) return null;
  return priceCents + 50;
}

export function formatCentsEuro(cents: number): string {
  return `${(cents / 100).toFixed(2).replace(".", ",")}€`;
}
