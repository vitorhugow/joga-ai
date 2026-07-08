/**
 * paymentReminders — corre todos os dias às 10:00 (Lisboa).
 *
 * 1) Lembretes de pagamento (org PRO): jogadores pendentes nas próximas 48h → `pay-{matchId}`
 * 2) Lembretes de jogo (grátis, todas as peladas): confirmados nas próximas 24h → `game-{matchId}`
 *    (só quem NÃO recebeu `pay-` nessa execução)
 */

import { onSchedule } from "firebase-functions/v2/scheduler";
import { getFirestore } from "firebase-admin/firestore";
import { formatMatchSchedule, notifyUser } from "./notify";

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
  const e = ent as {
    pro?: boolean;
    plan?: string;
    proUntil?: string;
    organizerPro?: { active?: boolean; proUntil?: string | null };
  };
  if (e.organizerPro) {
    if (!e.organizerPro.active) return false;
    if (e.organizerPro.proUntil && Date.now() >= new Date(e.organizerPro.proUntil).getTime()) {
      return false;
    }
    return true;
  }
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

function isWithinNext24h(kickoff: number, now: number): boolean {
  const horizon = now + 24 * 3600 * 1000;
  return kickoff > now && kickoff <= horizon;
}

export const paymentReminders = onSchedule(
  { schedule: "every day 10:00", timeZone: "Europe/Lisbon", region: "europe-west1" },
  async () => {
    const db = getFirestore();
    const now = Date.now();
    const today = new Date(now).toISOString().slice(0, 10);
    const in3Days = new Date(now + 3 * 24 * 3600 * 1000).toISOString().slice(0, 10);

    const snap = await db
      .collection("matches")
      .where("scheduledDate", ">=", today)
      .where("scheduledDate", "<=", in3Days)
      .get();

    let paySent = 0;
    let gameSent = 0;
    const orgProCache = new Map<string, boolean>();

    for (const matchDoc of snap.docs) {
      const match = matchDoc.data();
      if (TERMINAL_OR_LIVE.has(String(match.status ?? ""))) continue;

      const kickoff = kickoffMs(match.scheduledDate, match.scheduledTime);
      if (kickoff == null) continue;

      const in48h = isWithinNext48h(kickoff, now);
      const in24h = isWithinNext24h(kickoff, now);
      if (!in48h && !in24h) continue;

      const organizerId = String(match.organizerId ?? "");
      const players: Array<{ userId?: string; paid?: boolean }> = Array.isArray(match.players)
        ? match.players
        : [];
      const title = String(match.title ?? "a tua pelada");
      const schedule = formatMatchSchedule(match.scheduledDate, match.scheduledTime);

      let orgPro = false;
      if (organizerId && in48h) {
        if (!orgProCache.has(organizerId)) {
          const orgSnap = await db.doc(`users/${organizerId}`).get();
          orgProCache.set(organizerId, isOrganizerProEntitlements(orgSnap.data()?.entitlements));
        }
        orgPro = orgProCache.get(organizerId) === true;
      }

      for (const player of players) {
        if (!player.userId || player.userId === organizerId) continue;

        const getsPayReminder = in48h && orgPro && player.paid === false;
        if (getsPayReminder) {
          await notifyUser(player.userId, {
            id: `pay-${matchDoc.id}`,
            priority: "popup",
            type: "match",
            title: "Tens uma pelada por pagar ⚽",
            body: `A «${title}» está aí à porta e o teu pagamento continua pendente. Acerta com o organizador para garantires o teu lugar.`,
            link: `/partida/${matchDoc.id}/pre-jogo`,
          });
          paySent += 1;
          continue;
        }

        if (in24h) {
          await notifyUser(player.userId, {
            id: `game-${matchDoc.id}`,
            priority: "center",
            type: "match",
            title: "Pelada amanhã!",
            body: `«${title}» — ${schedule}.`,
            link: `/partida/${matchDoc.id}/pre-jogo`,
          });
          gameSent += 1;
        }
      }
    }

    console.log(
      `[paymentReminders] ${paySent} lembretes pagamento, ${gameSent} lembretes jogo (${snap.size} peladas analisadas).`,
    );
  },
);
