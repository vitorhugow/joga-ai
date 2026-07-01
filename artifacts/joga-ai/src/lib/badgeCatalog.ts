/**
 * badgeCatalog — distintivos desbloqueáveis
 */

export type BadgeRarity = "gold" | "silver" | "bronze";

export type BadgeDefinition = {
  id: string;
  name: string;
  icon: string;
  rarity: BadgeRarity;
  desc: string;
};

export const BADGE_CATALOG: BadgeDefinition[] = [
  { id: "first_match", name: "Estreia", icon: "⚽", rarity: "bronze", desc: "Primeira pelada registada" },
  { id: "matches_5", name: "Regular", icon: "📅", rarity: "bronze", desc: "5 jogos na época" },
  { id: "matches_10", name: "Titular", icon: "👟", rarity: "silver", desc: "10 jogos na época" },
  { id: "matches_25", name: "Veterano", icon: "🏟️", rarity: "gold", desc: "25 jogos na época" },
  { id: "goals_5", name: "Goleador", icon: "🎯", rarity: "bronze", desc: "5 golos na época" },
  { id: "goals_15", name: "Artilheiro", icon: "🔥", rarity: "silver", desc: "15 golos na época" },
  { id: "goals_30", name: "Matador", icon: "💥", rarity: "gold", desc: "30 golos na época" },
  { id: "assists_5", name: "Garçom", icon: "🅰️", rarity: "bronze", desc: "5 assistências" },
  { id: "assists_15", name: "Maestro", icon: "🎼", rarity: "silver", desc: "15 assistências" },
  { id: "mvp_1", name: "MVP", icon: "⭐", rarity: "silver", desc: "Primeiro MVP" },
  { id: "rating_8", name: "Nota 8+", icon: "🌟", rarity: "silver", desc: "Média de nota ≥ 8" },
  { id: "rating_9", name: "Elite", icon: "👑", rarity: "gold", desc: "Média de nota ≥ 9" },
];

export function getBadgeById(id: string): BadgeDefinition | undefined {
  return BADGE_CATALOG.find((b) => b.id === id);
}

export function badgesFromIds(ids: string[]): BadgeDefinition[] {
  return ids.map(getBadgeById).filter((b): b is BadgeDefinition => Boolean(b));
}
