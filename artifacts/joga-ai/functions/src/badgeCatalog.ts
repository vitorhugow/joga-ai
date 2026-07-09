/** Catálogo mínimo para notificações server-side (espelha src/lib/badgeCatalog.ts). */

export type BadgeDefinition = {
  id: string;
  name: string;
  desc: string;
};

const BADGE_CATALOG: BadgeDefinition[] = [
  { id: "first_match", name: "Estreia", desc: "Primeira pelada registada" },
  { id: "matches_5", name: "Regular", desc: "5 jogos na época" },
  { id: "matches_10", name: "Titular", desc: "10 jogos na época" },
  { id: "matches_25", name: "Veterano", desc: "25 jogos na época" },
  { id: "goals_5", name: "Goleador", desc: "5 golos na época" },
  { id: "goals_15", name: "Artilheiro", desc: "15 golos na época" },
  { id: "goals_30", name: "Matador", desc: "30 golos na época" },
  { id: "assists_5", name: "Garçom", desc: "5 assistências" },
  { id: "assists_15", name: "Maestro", desc: "15 assistências" },
  { id: "mvp_1", name: "MVP", desc: "Primeiro MVP" },
  { id: "rating_8", name: "Nota 8+", desc: "Média de nota ≥ 8" },
  { id: "rating_9", name: "Elite", desc: "Média de nota ≥ 9" },
];

export function getBadgeById(id: string): BadgeDefinition | undefined {
  return BADGE_CATALOG.find((b) => b.id === id);
}
