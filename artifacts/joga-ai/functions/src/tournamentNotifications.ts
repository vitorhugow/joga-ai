/**
 * tournamentNotifications — pedidos de entrada na Joga Aí Cup.
 */

import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { getFirestore } from "firebase-admin/firestore";
import { notifyUser } from "./notify";

const REGION = "europe-west1";

/** Novo pedido de entrada na Cup → avisa os admins/capitão do clube. */
export const onTournamentRequestCreatedNotifyAdmin = onDocumentCreated(
  { document: "communities/{communityId}/tournamentRequests/{requestId}", region: REGION },
  async (event) => {
    const request = event.data?.data();
    if (!request) return;

    const communityId = event.params.communityId;
    const requestId = event.params.requestId;
    const db = getFirestore();

    const communitySnap = await db.doc(`communities/${communityId}`).get();
    const community = communitySnap.data();
    if (!community) return;

    const adminId = String(community.adminId ?? "");
    const adminIds: string[] = Array.isArray(community.adminIds) ? community.adminIds : [];
    const targets = [...new Set([adminId, ...adminIds].filter(Boolean))];
    if (targets.length === 0) return;

    const playerName = String(request.playerName ?? "Jogador");
    const communityName = String(community.name ?? "o teu clube");

    await Promise.all(
      targets.map((target) =>
        notifyUser(target, {
          id: `cupreq-${communityId}-${requestId}`,
          type: "community",
          priority: "popup",
          title: "Pedido para a Joga Aí Cup",
          body: `${playerName} quer inscrever «${communityName}» na Joga Aí Cup.`,
          link: `/comunidades/${communityId}`,
        }),
      ),
    );
  },
);
