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
import { loadPostMatch, savePostMatch, loadAllPostMatches } from "./postMatchStorage";

/**
 * Verifica se a partida activa em localStorage expirou e fecha-a.
 * Chamar no arranque da app ou ao entrar em PosJogo.
 */
export async function checkAndCloseExpiredMatch(): Promise<void> {
  const matches = loadAllPostMatches();
  if (matches.length === 0) {
    const legacy = loadPostMatch();
    if (legacy) matches.push(legacy);
  }

  for (const match of matches) {
    if (match.status === "expirada" || match.status === "concluida") continue;

    const expired = Date.now() > new Date(match.expiresAt).getTime();
    if (!expired) continue;

    const updated = { ...match, status: "expirada" as const };
    savePostMatch(updated);
    await updateMatchStatus(match.matchId, "expirada").catch(console.warn);
  }
}
