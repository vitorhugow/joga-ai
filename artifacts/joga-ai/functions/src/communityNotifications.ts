/**
 * communityNotifications — pedidos de adesão e remoção de membros.
 */

import { onDocumentCreated, onDocumentDeleted } from "firebase-functions/v2/firestore";
import { getFirestore } from "firebase-admin/firestore";
import { notifyUser } from "./notify";

const REGION = "europe-west1";

/** Novo pedido de adesão → avisa o admin da comunidade. */
export const onJoinRequestCreatedNotifyAdmin = onDocumentCreated(
  { document: "communities/{communityId}/joinRequests/{userId}", region: REGION },
  async (event) => {
    const request = event.data?.data();
    if (!request) return;

    const communityId = event.params.communityId;
    const userId = event.params.userId;
    const db = getFirestore();

    const communitySnap = await db.doc(`communities/${communityId}`).get();
    const community = communitySnap.data();
    if (!community) return;

    const adminId = String(community.adminId ?? "");
    if (!adminId) return;

    const displayName = String(request.displayName ?? "Jogador");
    const communityName = String(community.name ?? "comunidade");

    await notifyUser(adminId, {
      id: `joinreq-${communityId}-${userId}`,
      type: "community",
      priority: "center",
      title: "Novo pedido de adesão",
      body: `${displayName} quer entrar em «${communityName}».`,
      link: `/comunidades/${communityId}`,
    });
  },
);

/** Membro removido da comunidade → avisa o utilizador. */
export const onCommunityMemberRemovedNotify = onDocumentDeleted(
  { document: "communities/{communityId}/members/{memberId}", region: REGION },
  async (event) => {
    const memberId = event.params.memberId;
    const communityId = event.params.communityId;
    if (!memberId) return;

    const db = getFirestore();
    const communitySnap = await db.doc(`communities/${communityId}`).get();
    if (!communitySnap.exists) return;

    const communityName = String(communitySnap.data()?.name ?? "comunidade");

    await notifyUser(memberId, {
      id: `removed-${communityId}`,
      type: "community",
      priority: "center",
      title: "Comunidade",
      body: `Já não fazes parte de «${communityName}».`,
      link: "/comunidades",
    });
  },
);
