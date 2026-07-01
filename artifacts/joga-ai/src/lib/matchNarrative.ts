/**
 * matchNarrative — texto narrativo automático do resumo da pelada
 */

import type { MatchResult } from "./matchHistoryRepository";
import type { MiniGameSummary } from "./evolutionUtils";

type NarrativeInput = {
  matchResult?: Pick<MatchResult, "title" | "topScorers" | "players" | "teamNames"> | null;
  events?: Array<{ type: string; playerName?: string }>;
  miniGames?: MiniGameSummary[];
};

function countEvents(events: NarrativeInput["events"] = []) {
  let goals = 0;
  let assists = 0;
  let saves = 0;
  for (const e of events) {
    if (e.type === "golo") goals += 1;
    if (e.type === "assistencia") assists += 1;
    if (e.type === "defesa") saves += 1;
  }
  return { goals, assists, saves };
}

function pickTemplate(seed: string, templates: string[]): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash + seed.charCodeAt(i) * (i + 1)) % templates.length;
  }
  return templates[hash] ?? templates[0];
}

export function generateMatchNarrative(input: NarrativeInput): string {
  const title = input.matchResult?.title ?? "A pelada";
  const topScorer = input.matchResult?.topScorers?.[0];
  const games = input.miniGames ?? [];
  const allEvents =
    input.events ??
    games.flatMap((g) =>
      (g.events ?? []).map((e) => ({ type: e.type, playerName: e.playerName })),
    );

  const { goals, assists } = countEvents(allEvents);
  const gameCount = games.length || 1;

  const ratedPlayers = (input.matchResult?.players ?? []).filter((p) => p.rating > 0);
  const mvp = [...ratedPlayers].sort((a, b) => b.rating - a.rating)[0];

  const openerTemplates = [
    `Foi dia de bola em «${title}» — ${gameCount} jogo${gameCount > 1 ? "s" : ""} e muita intensidade.`,
    `«${title}» trouxe futebol a sério: ${goals} golo${goals !== 1 ? "s" : ""} e ${assists} assistência${assists !== 1 ? "s" : ""} no total.`,
    `A malta juntou-se para «${title}» e o relato ficou marcado por ${goals} golo${goals !== 1 ? "s" : ""}.`,
  ];

  const parts: string[] = [pickTemplate(title, openerTemplates)];

  if (topScorer && topScorer.goals && topScorer.goals > 0) {
    const scorerTemplates = [
      `${topScorer.name} liderou a artilharia com ${topScorer.goals} golo${topScorer.goals > 1 ? "s" : ""}.`,
      `Destaque ofensivo para ${topScorer.name}, autor de ${topScorer.goals} golo${topScorer.goals > 1 ? "s" : ""}.`,
      `A rede balançou várias vezes — ${topScorer.name} marcou ${topScorer.goals}.`,
    ];
    parts.push(pickTemplate(topScorer.name, scorerTemplates));
  }

  if (mvp && mvp.rating >= 8) {
    parts.push(
      `${mvp.name} foi o jogador mais votado (${mvp.rating.toFixed(1)}/10) — noite de carta subir.`,
    );
  } else if (goals === 0) {
    parts.push("Jogo fechado, mas a disputa manteve-se viva do primeiro ao último minuto.");
  }

  if (assists >= 3) {
    parts.push("Houve boa circulação: várias assistências construíram o resultado.");
  }

  return parts.join(" ");
}
