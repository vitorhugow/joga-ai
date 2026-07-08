/** Valor curto para cards — ex: "5" → "5€" */
export function formatMatchPriceAmount(price?: string | null): string | null {
  if (!price || price === "—" || !price.trim()) return null;
  const t = price.trim();
  if (/grátis/i.test(t)) return "Grátis";
  if (/€/.test(t)) {
    return t.replace(/\/\s*jogador/gi, "").trim();
  }
  const cleaned = t.replace(/[^\d.,]/g, "");
  if (cleaned) return `${cleaned}€`;
  return `${t}€`;
}

/** @deprecated prefer formatMatchPriceAmount — mantido para textos longos */
export function formatMatchPricePerPlayer(price?: string | null): string | null {
  return formatMatchPriceAmount(price);
}

/** Versão curta para chips nos cards (ex: "💰 5€"). */
export function formatMatchPriceChip(price?: string | null): string | null {
  const amount = formatMatchPriceAmount(price);
  if (!amount) return null;
  if (/grátis/i.test(amount)) return "🎁 Grátis";
  return `💰 ${amount}`;
}
