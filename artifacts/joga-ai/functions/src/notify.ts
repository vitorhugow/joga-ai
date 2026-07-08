/**
 * notify.ts — helper server-side para notificações (admin SDK).
 * IDs determinísticos + setDoc merge → idempotente entre reexecuções.
 */

import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

export type NotifyPriority = "popup" | "center";
export type NotifyType = "match" | "community" | "system";

export type NotifyPayload = {
  id: string;
  title: string;
  body: string;
  type?: NotifyType;
  link?: string;
  priority?: NotifyPriority;
};

const PUSH_PREFIXES = ["pay-", "game-", "vote-", "newmatch-"];

function shouldSendPush(payload: NotifyPayload): boolean {
  if (payload.priority === "popup") return true;
  return PUSH_PREFIXES.some((prefix) => payload.id.startsWith(prefix));
}

async function sendPushToUser(uid: string, payload: NotifyPayload): Promise<void> {
  if (!shouldSendPush(payload)) return;

  try {
    const db = getFirestore();
    const tokensSnap = await db.collection(`users/${uid}/fcmTokens`).get();
    if (tokensSnap.empty) return;

    const tokens = tokensSnap.docs.map((d) => d.id).filter(Boolean);
    const messaging = getMessaging();
    const response = await messaging.sendEachForMulticast({
      tokens,
      notification: {
        title: payload.title.slice(0, 80),
        body: payload.body.slice(0, 240),
      },
      data: {
        notifId: payload.id,
        ...(payload.link ? { link: payload.link } : {}),
      },
      webpush: payload.link
        ? {
            fcmOptions: { link: payload.link.startsWith("http") ? payload.link : `https://jogaai.pt${payload.link}` },
          }
        : undefined,
    });

    const invalid: string[] = [];
    response.responses.forEach((result, index) => {
      if (result.success) return;
      const code = result.error?.code ?? "";
      if (
        code === "messaging/registration-token-not-registered" ||
        code === "messaging/invalid-registration-token"
      ) {
        invalid.push(tokens[index]);
      } else {
        console.warn(`[notify] push falhou ${uid}:`, code, result.error?.message);
      }
    });

    if (invalid.length > 0) {
      const batch = db.batch();
      for (const token of invalid) {
        batch.delete(db.doc(`users/${uid}/fcmTokens/${token}`));
      }
      await batch.commit();
    }
  } catch (err) {
    console.warn(`[notify] push FCM ${uid}:`, err);
  }
}

export function formatEuroCents(cents: number): string {
  return `${(cents / 100).toFixed(2).replace(".", ",")}€`;
}

export function formatMatchSchedule(scheduledDate?: unknown, scheduledTime?: unknown): string {
  const date = typeof scheduledDate === "string" ? scheduledDate.trim() : "";
  if (!date) return "em breve";
  const time = typeof scheduledTime === "string" && scheduledTime.trim() ? scheduledTime.trim() : "12:00";
  try {
    const d = new Date(`${date}T${time}`);
    const datePart = d.toLocaleDateString("pt-PT", { weekday: "short", day: "numeric", month: "short" });
    const timePart = d.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
    return `${datePart} às ${timePart}`;
  } catch {
    return `${date} às ${time}`;
  }
}

export function shortContentHash(parts: string[]): string {
  const raw = parts.join("|");
  let h = 0;
  for (let i = 0; i < raw.length; i++) {
    h = ((h << 5) - h + raw.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36).slice(0, 8);
}

export async function notifyUser(uid: string, payload: NotifyPayload): Promise<void> {
  if (!uid || !payload.id) return;
  const db = getFirestore();
  await db.doc(`users/${uid}/notifications/${payload.id}`).set(
    {
      title: payload.title.slice(0, 80),
      body: payload.body.slice(0, 240),
      type: payload.type ?? "system",
      ...(payload.link ? { link: payload.link } : {}),
      ...(payload.priority ? { priority: payload.priority } : {}),
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  await sendPushToUser(uid, payload);
}

export async function notifyUsers(uids: string[], payload: NotifyPayload): Promise<void> {
  const unique = [...new Set(uids.filter(Boolean))];
  const results = await Promise.allSettled(unique.map((uid) => notifyUser(uid, payload)));
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      console.warn(`[notify] falhou para ${unique[index]}:`, result.reason);
    }
  });
}

export async function loadUserDisplayName(uid: string, fallback = "Jogador"): Promise<string> {
  const snap = await getFirestore().doc(`users/${uid}`).get();
  const name = snap.data()?.displayName;
  return typeof name === "string" && name.trim() ? name.trim() : fallback;
}

export function countPaidPlayers(
  players: Array<{ paid?: boolean; userId?: string }>,
  paidUserIds: string[] = [],
): { paid: number; total: number } {
  const roster = Array.isArray(players) ? players : [];
  const paidSet = new Set(paidUserIds);
  let paid = 0;
  for (const player of roster) {
    if (player.paid === true || (player.userId && paidSet.has(player.userId))) {
      paid += 1;
    }
  }
  return { paid, total: roster.length };
}

export async function notifyOrganizerPaymentReceived(
  matchId: string,
  payerUid: string,
): Promise<void> {
  const db = getFirestore();
  const matchSnap = await db.doc(`matches/${matchId}`).get();
  const match = matchSnap.data();
  if (!match) return;

  const organizerId = String(match.organizerId ?? "");
  if (!organizerId) return;

  const payerName = await loadUserDisplayName(payerUid);
  const players: Array<{ paid?: boolean; userId?: string }> = Array.isArray(match.players)
    ? match.players
    : [];
  const paidUserIds: string[] = Array.isArray(match.paidUserIds) ? match.paidUserIds : [];
  const { paid, total } = countPaidPlayers(players, paidUserIds);

  const priceStr =
    typeof match.price === "string" && match.price.trim()
      ? match.price.trim()
      : formatEuroCents(0);

  await notifyUser(organizerId, {
    id: `orgpaid-${matchId}-${payerUid}`,
    type: "match",
    priority: "center",
    title: "Pagamento recebido",
    body: `${payerName} pagou ${priceStr} em «${String(match.title ?? "pelada")}» (${paid}/${total} pagos).`,
    link: `/partida/${matchId}/pre-jogo`,
  });
}

export async function notifyPromotedFromWaitlist(
  matchId: string,
  uid: string,
  match: Record<string, unknown>,
): Promise<void> {
  const title = String(match.title ?? "pelada");
  const paymentsEnabled = match.paymentsEnabled === true;
  let body = `Saiu uma vaga em «${title}» — estás confirmado.`;
  if (paymentsEnabled && typeof match.price === "string" && match.price.trim()) {
    body = `Estás confirmado em «${title}» — falta pagar ${match.price.trim()} para garantir.`;
  }

  await notifyUser(uid, {
    id: `promoted-${matchId}-${uid}`,
    priority: "popup",
    type: "match",
    title: "Entraste na pelada!",
    body,
    link: `/partida/${matchId}/pre-jogo`,
  });
}
