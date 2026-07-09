/**
 * userNotifications — notificações derivadas de alterações no perfil.
 */

import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { getBadgeById } from "./badgeCatalog";
import { notifyUser } from "./notify";

const REGION = "europe-west1";

/** Novos distintivos no perfil → notificação badge-{id}. */
export const onUserBadgesUpdatedNotify = onDocumentUpdated(
  { document: "users/{uid}", region: REGION },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!after) return;

    const beforeBadges: string[] = Array.isArray(before?.badges) ? before.badges : [];
    const afterBadges: string[] = Array.isArray(after.badges) ? after.badges : [];
    const newBadges = afterBadges.filter((id) => !beforeBadges.includes(id));
    if (!newBadges.length) return;

    const uid = event.params.uid;
    await Promise.allSettled(
      newBadges.map(async (badgeId) => {
        const badge = getBadgeById(badgeId);
        if (!badge) return;
        await notifyUser(uid, {
          id: `badge-${badgeId}`,
          type: "system",
          title: "Novo distintivo!",
          body: `Desbloqueaste «${badge.name}» — ${badge.desc}`,
          link: "/perfil",
        });
      }),
    );
  },
);
