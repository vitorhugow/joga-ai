import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions";

initializeApp();

const db = getFirestore();

/** Lembretes básicos: votação pendente e partidas em configurando nas próximas 24h */
export const sendPushReminders = onSchedule(
  {
    schedule: "every 6 hours",
    timeZone: "Europe/Lisbon",
  },
  async () => {
    const now = Date.now();
    const in24h = now + 24 * 60 * 60 * 1000;

    const matchesSnap = await db
      .collection("matches")
      .where("status", "in", ["configurando", "aguardando_auditoria"])
      .limit(100)
      .get();

    let sent = 0;

    for (const matchDoc of matchesSnap.docs) {
      const data = matchDoc.data();
      const matchId = matchDoc.id;
      const title = String(data.title ?? "Pelada");

      if (data.status === "aguardando_auditoria") {
        const players = (data.players ?? []) as Array<{ userId?: string; name?: string }>;
        for (const player of players) {
          if (!player.userId) continue;
          const userSnap = await db.doc(`users/${player.userId}`).get();
          const tokens = (userSnap.data()?.fcmTokens ?? []) as string[];
          if (!tokens.length) continue;

          await sendToTokens(tokens, {
            title: "Hora de votar!",
            body: `A pelada «${title}» espera a tua nota.`,
            link: `/partida/${matchId}/pos-jogo`,
          });
          sent += 1;
        }
        continue;
      }

      const scheduledDate = String(data.scheduledDate ?? "");
      const scheduledTime = String(data.scheduledTime ?? "20:00");
      if (!scheduledDate) continue;

      const start = new Date(`${scheduledDate}T${scheduledTime}`).getTime();
      if (Number.isNaN(start) || start < now || start > in24h) continue;

      const players = (data.players ?? []) as Array<{ userId?: string }>;
      for (const player of players) {
        if (!player.userId) continue;
        const userSnap = await db.doc(`users/${player.userId}`).get();
        const tokens = (userSnap.data()?.fcmTokens ?? []) as string[];
        if (!tokens.length) continue;

        await sendToTokens(tokens, {
          title: "Pelada amanhã",
          body: `«${title}» está a chegar — confirma presença no Pré-Jogo.`,
          link: `/partida/${matchId}/pre-jogo`,
        });
        sent += 1;
      }
    }

    logger.info(`sendPushReminders: ${sent} mensagens enviadas`);
  },
);

async function sendToTokens(
  tokens: string[],
  payload: { title: string; body: string; link: string },
) {
  const messaging = getMessaging();
  const unique = [...new Set(tokens)].slice(0, 5);

  await messaging.sendEachForMulticast({
    tokens: unique,
    notification: {
      title: payload.title,
      body: payload.body,
    },
    data: {
      link: payload.link,
      sentAt: Timestamp.now().toMillis().toString(),
    },
  });
}
