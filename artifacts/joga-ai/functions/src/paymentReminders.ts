/**
 * paymentReminders — corre todos os dias às 10:00 (Lisboa).
 *
 * Para cada pelada nas próximas 48h cujo ORGANIZADOR seja PRO Organizador,
 * envia uma notificação a cada jogador com conta que ainda esteja "pendente"
 * (players[].paid === false). O id determinístico `pay-{matchId}` garante
 * no máximo UM lembrete por pelada por jogador (idempotente entre execuções),
 * e o pop-up global da app apanha o prefixo `pay-` e mostra na hora.
 */

import { onSchedule } from "firebase-functions/v2/scheduler";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const TERMINAL_OR_LIVE = new Set([
  "ao_vivo",
  "aguardando_auditoria",
  "auditada",
  "concluida",
  "expirada",
  "cancelada",
]);

function isOrganizerProEntitlements(ent: unknown): boolean {
  if (!ent || typeof ent !== "object") return false;
  const e = ent as { pro?: boolean; plan?: string; proUntil?: string };
  if (!e.pro || e.plan !== "organizer_pro") return false;
  if (e.proUntil && Date.now() >= new Date(e.proUntil).getTime()) return false;
  return true;
}

function kickoffMs(scheduledDate?: unknown, scheduledTime?: unknown): number | null {
  const date = typeof scheduledDate === "string" ? scheduledDate.trim() : "";
  if (!date) return null;
  const time = typeof scheduledTime === "string" && scheduledTime.trim() ? scheduledTime.trim() : "12:00";
  const ms = new Date(`${date}T${time}`).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function isWithinNext48h(kickoff: number, now: number): boolean {
  const horizon = now + 48 * 3600 * 1000;
  return kickoff > now && kickoff <= horizon;
}

export const paymentReminders = onSchedule(
  { schedule: "every day 10:00", timeZone: "Europe/Lisbon", region: "europe-west1" },
  async () => {
    const db = getFirestore();
    const now = Date.now();
    const today = new Date(now).toISOString().slice(0, 10);
    const in3Days = new Date(now + 3 * 24 * 3600 * 1000).toISOString().slice(0, 10);

    // Janela larga em scheduledDate; filtro fino de 48h em código (date+time).
    const snap = await db
      .collection("matches")
      .where("scheduledDate", ">=", today)
      .where("scheduledDate", "<=", in3Days)
      .get();

    let sent = 0;
    const orgProCache = new Map<string, boolean>();

    for (const matchDoc of snap.docs) {
      const match = matchDoc.data();
      if (TERMINAL_OR_LIVE.has(String(match.status ?? ""))) continue;

      const kickoff = kickoffMs(match.scheduledDate, match.scheduledTime);
      if (kickoff == null || !isWithinNext48h(kickoff, now)) continue;

      const organizerId = String(match.organizerId ?? "");
      if (!organizerId) continue;

      if (!orgProCache.has(organizerId)) {
        const orgSnap = await db.doc(`users/${organizerId}`).get();
        orgProCache.set(
          organizerId,
          isOrganizerProEntitlements(orgSnap.data()?.entitlements),
        );
      }
      if (!orgProCache.get(organizerId)) continue;

      const players: Array<{ userId?: string; paid?: boolean; name?: string }> =
        Array.isArray(match.players) ? match.players : [];
      const title = String(match.title ?? "a tua pelada");

      for (const player of players) {
        if (!player.userId || player.paid !== false) continue;
        if (player.userId === organizerId) continue;

        await db
          .doc(`users/${player.userId}/notifications/pay-${matchDoc.id}`)
          .set(
            {
              title: "Tens uma pelada por pagar ⚽",
              body: `A «${title}» está aí à porta e o teu pagamento continua pendente. Acerta com o organizador para garantires o teu lugar.`,
              type: "match",
              link: `/partida/${matchDoc.id}/pre-jogo`,
              read: false,
              createdAt: FieldValue.serverTimestamp(),
            },
            { merge: true },
          );
        sent += 1;
      }
    }

    console.log(`[paymentReminders] ${sent} lembretes enviados (${snap.size} peladas analisadas).`);
  },
);
