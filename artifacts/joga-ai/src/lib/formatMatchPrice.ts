/** Formata preço por jogador com símbolo € (ex: "5" → "5€/jogador"). */
export function formatMatchPricePerPlayer(price?: string | null): string | null {
  if (!price || price === "—" || !price.trim()) return null;
  const t = price.trim();
  if (/grátis/i.test(t)) return "Grátis";
  if (/€/.test(t)) {
    if (/\/\s*jogador/i.test(t)) return t;
    return `${t}/jogador`;
  }
  const cleaned = t.replace(/[^\d.,]/g, "");
  if (cleaned) return `${cleaned}€/jogador`;
  return `${t}€/jogador`;
}

/** Versão curta para chips (ex: "💰 5€/jog"). */
export function formatMatchPriceChip(price?: string | null): string | null {
  const full = formatMatchPricePerPlayer(price);
  if (!full) return null;
  if (/grátis/i.test(full)) return "🎁 Grátis";
  return `💰 ${full}`;
}
