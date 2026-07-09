/**
 * matchNotifications — notificações de ciclo de vida da pelada (triggers Firestore).
 */

import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import { getFirestore } from "firebase-admin/firestore";
import {
  formatMatchSchedule,
  notifyMatchPlayersToVote,
  notifyPromotedFromWaitlist,
  notifyUser,
  notifyUsers,
  shortContentHash,
} from "./notify";

const REGION = "europe-west1";

const OPEN_STATUSES = new Set(["configurando", "ao_vivo"]);

function linkedPlayerIds(match: Record<string, unknown>, excludeOrganizer = true): string[] {
  const organizerId = String(match.organizerId ?? "");
  const ids = new Set<string>();

  const players: Array<{ userId?: string }> = Array.isArray(match.players) ? match.players : [];
  for (const player of players) {
    if (player.userId) ids.add(player.userId);
  }

  const participantUserIds: string[] = Array.isArray(match.participantUserIds)
    ? match.participantUserIds
    : [];
  for (const id of participantUserIds) {
    if (id) ids.add(id);
  }

  const paidUserIds: string[] = Array.isArray(match.paidUserIds) ? match.paidUserIds : [];
  for (const id of paidUserIds) {
    if (id) ids.add(id);
  }

  if (excludeOrganizer && organizerId) ids.delete(organizerId);
  return [...ids];
}

/** Nova pelada numa comunidade → avisa membros (exceto organizador). */
export const onMatchCreatedNotifyCommunity = onDocumentCreated(
  { document: "matches/{matchId}", region: REGION },
  async (event) => {
    const match = event.data?.data();
    if (!match) return;

    const communityId = typeof match.communityId === "string" ? match.communityId.trim() : "";
    if (!communityId) return;

    const matchId = event.params.matchId;
    const organizerId = String(match.organizerId ?? "");
    const db = getFirestore();

    const [communitySnap, membersSnap] = await Promise.all([
      db.doc(`communities/${communityId}`).get(),
      db.collection(`communities/${communityId}/members`).get(),
    ]);

    const communityName = String(communitySnap.data()?.name ?? "comunidade");
    const title = String(match.title ?? "Nova pelada");
    const schedule = formatMatchSchedule(match.scheduledDate, match.scheduledTime);

    const memberIds = membersSnap.docs
      .map((d) => d.id)
      .filter((uid) => uid && uid !== organizerId);

    await notifyUsers(memberIds, {
      id: `newmatch-${matchId}`,
      type: "community",
      priority: "center",
      title: `Nova pelada em «${communityName}»`,
      body: `${title} — ${schedule}. Garante a tua vaga!`,
      link: `/partida/${matchId}/pre-jogo`,
    });
  },
);

function playerUserIds(match: Record<string, unknown>): Set<string> {
  const ids = new Set<string>();
  const players: Array<{ userId?: string; id?: string }> = Array.isArray(match.players)
    ? match.players
    : [];
  for (const player of players) {
    const uid = player.userId ?? player.id;
    if (uid) ids.add(String(uid));
  }
  return ids;
}

function waitlistUserIds(match: Record<string, unknown>): Set<string> {
  const ids = new Set<string>();
  const waitlist: Array<{ userId?: string }> = Array.isArray(match.waitlist) ? match.waitlist : [];
  for (const entry of waitlist) {
    if (entry.userId) ids.add(String(entry.userId));
  }
  return ids;
}

function detectPromotedFromWaitlist(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): string | null {
  const beforePlayers = playerUserIds(before);
  const afterPlayers = playerUserIds(after);
  const beforeWaitlist = waitlistUserIds(before);

  for (const uid of afterPlayers) {
    if (!beforePlayers.has(uid) && beforeWaitlist.has(uid)) {
      return uid;
    }
  }
  return null;
}

/** Pelada entra em votação → avisa jogadores com conta (exceto organizador). */
export const onMatchEnteringVoteNotify = onDocumentUpdated(
  { document: "matches/{matchId}", region: REGION },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;

    const prevStatus = String(before.status ?? "");
    const nextStatus = String(after.status ?? "");
    if (prevStatus === nextStatus || nextStatus !== "aguardando_auditoria") return;
    if (prevStatus === "aguardando_auditoria") return;

    await notifyMatchPlayersToVote(event.params.matchId, after);
  },
);

/** Promoção da lista de espera → popup ao jogador promovido. */
export const onMatchPromotedFromWaitlistNotify = onDocumentUpdated(
  { document: "matches/{matchId}", region: REGION },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;

    const promotedUid = detectPromotedFromWaitlist(before, after);
    if (!promotedUid) return;

    await notifyPromotedFromWaitlist(event.params.matchId, promotedUid, after);
  },
);

/** Notas publicadas → notificação evo-{matchId} para cada jogador com nota. */
export const onMatchRatingsReleasedNotify = onDocumentUpdated(
  { document: "matches/{matchId}/summary/result", region: REGION },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!after?.ratingsReleased) return;
    if (before?.ratingsReleased === true) return;

    const matchId = event.params.matchId;
    const title = String(after.title ?? "pelada");
    const players: Array<{ userId?: string; rating?: number }> = Array.isArray(after.players)
      ? after.players
      : [];

    const targets = players.filter((p) => p.userId && Number(p.rating) > 0);
    await Promise.allSettled(
      targets.map((player) =>
        notifyUser(String(player.userId), {
          id: `evo-${matchId}`,
          type: "match",
          title: "A tua nota saiu!",
          body: `Recebeste ${Number(player.rating).toFixed(1)} na pelada «${title}». Vê a tua evolução.`,
          link: "/perfil/evolucao",
        }),
      ),
    );
  },
);

/** Pelada alterada (data/hora/local) → popup aos jogadores com conta. */
export const onMatchUpdatedNotifyChanges = onDocumentUpdated(
  { document: "matches/{matchId}", region: REGION },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;

    const status = String(after.status ?? "");
    if (!OPEN_STATUSES.has(status)) return;

    const dateChanged = before.scheduledDate !== after.scheduledDate;
    const timeChanged = before.scheduledTime !== after.scheduledTime;
    const locationChanged = before.location !== after.location;
    if (!dateChanged && !timeChanged && !locationChanged) return;

    const matchId = event.params.matchId;
    const title = String(after.title ?? "pelada");
    const schedule = formatMatchSchedule(after.scheduledDate, after.scheduledTime);
    const location = String(after.location ?? "local a confirmar");
    const hash = shortContentHash([
      String(after.scheduledDate ?? ""),
      String(after.scheduledTime ?? ""),
      location,
    ]);

    const targets = linkedPlayerIds(after);
    await notifyUsers(targets, {
      id: `changed-${matchId}-${hash}`,
      priority: "popup",
      type: "match",
      title: "Pelada alterada",
      body: `«${title}» mudou: agora é ${schedule} em ${location}.`,
      link: `/partida/${matchId}/pre-jogo`,
    });
  },
);
