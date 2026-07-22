/**
 * tournamentNotifications — pedidos de entrada na Joga Aí Cup.
 */

import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { getFirestore } from "firebase-admin/firestore";
import { notifyUser } from "./notify";

const REGION = "europe-west1";

/** Mesmo uid hardcoded em isAppAdmin() nas firestore.rules. */
const APP_ADMIN_UID = "KrnnjgKclcPJm4In4W9ORp3iX6j2";

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

/** Novo clube inscrito na Cup → avisa o admin da app para rever/confirmar. */
export const onTournamentTeamCreatedNotifyAppAdmin = onDocumentCreated(
  { document: "tournaments/{tournamentId}/teams/{teamId}", region: REGION },
  async (event) => {
    const team = event.data?.data();
    if (!team) return;

    const teamId = event.params.teamId;
    const teamName = String(team.name ?? "Um clube");

    await notifyUser(APP_ADMIN_UID, {
      id: `cupteam-${teamId}`,
      type: "community",
      priority: "popup",
      title: "Novo clube na Joga Aí Cup",
      body: `«${teamName}» acabou de se inscrever — revê no painel /admin.`,
      link: "/admin",
    });
  },
);
