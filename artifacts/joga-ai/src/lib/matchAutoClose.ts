/**
 * matchAutoClose.ts
 *
 * Fechamento automático de partidas após 24h.
 *
 * Opção A (implementada aqui — client-side):
 *   Verifica no arranque e na hidratação de PosJogo se `expiresAt` já passou.
 *   Se sim, actualiza status para "expirada" em Firestore + localStorage.
 *
 * Opção B (Cloud Function — ver functions/src/closeExpiredMatches.ts):
 *   Executada pelo Firebase Scheduler e não depende do cliente estar activo.
 *   Preferida em produção.
 */

import { updateMatchStatus } from "./matchRepository";
import { loadPostMatch, savePostMatch } from "./postMatchStorage";

/**
 * Verifica se a partida activa em localStorage expirou e fecha-a.
 * Chamar no arranque da app ou ao entrar em PosJogo.
 */
export async function checkAndCloseExpiredMatch(): Promise<void> {
  const match = loadPostMatch();
  if (!match) return;
  if (match.status === "expirada" || match.status === "concluida") return;

  const expired = Date.now() > new Date(match.expiresAt).getTime();
  if (!expired) return;

  const updated = { ...match, status: "expirada" as const };
  savePostMatch(updated);
  await updateMatchStatus(match.matchId, "expirada").catch(console.warn);
}
