/**
 * Migração server-side de state/setup a partir do documento da partida.
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const REGION = "europe-west1";

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

function isMatchParticipant(match: Record<string, unknown>, uid: string): boolean {
  if (String(match.organizerId ?? "") === uid) return true;
  if (playerUserIds(match).has(uid)) return true;
  const participantUserIds: string[] = Array.isArray(match.participantUserIds)
    ? match.participantUserIds
    : [];
  return participantUserIds.includes(uid);
}

export const migrateMatchSetup = onCall({ region: REGION }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Inicia sessão.");

  const matchId = String(request.data?.matchId ?? "").trim();
  if (!matchId) throw new HttpsError("invalid-argument", "matchId em falta.");

  const db = getFirestore();
  const matchRef = db.doc(`matches/${matchId}`);
  const matchSnap = await matchRef.get();
  if (!matchSnap.exists) throw new HttpsError("not-found", "Partida não encontrada.");

  const match = matchSnap.data() as Record<string, unknown>;
  if (!isMatchParticipant(match, uid)) {
    throw new HttpsError("permission-denied", "Não és participante desta partida.");
  }

  const setupRef = db.doc(`matches/${matchId}/state/setup`);
  const setupSnap = await setupRef.get();
  if (setupSnap.exists) {
    return { migrated: false, reason: "already_exists" };
  }

  const teamNames = (match.teamNames as Record<string, string> | undefined) ?? {
    A: "Equipa A",
    B: "Equipa B",
    C: "Equipa C",
    D: "Equipa D",
  };

  await setupRef.set({
    gameMode: match.gameMode ?? "fut5",
    teamCount: match.teamCount ?? 2,
    teamNames,
    playerTeams: match.playerTeams ?? {},
    assignments: match.assignments ?? {},
    miniGameConfig: { durationMin: 10 },
    migratedFromServer: true,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: uid,
  });

  const patch: Record<string, unknown> = { savedAt: FieldValue.serverTimestamp() };
  const organizerId = String(match.organizerId ?? "");
  if (organizerId) {
    const existingIds: string[] = Array.isArray(match.liveControllerIds)
      ? (match.liveControllerIds as string[])
      : [];
    const legacyId = match.liveControllerId ? String(match.liveControllerId) : null;

    if (!existingIds.length) {
      const ids = legacyId && legacyId !== organizerId
        ? [organizerId, legacyId]
        : [organizerId];
      patch.liveControllerIds = ids;
      if (legacyId) patch.liveControllerId = FieldValue.delete();
    } else if (!existingIds.includes(organizerId)) {
      patch.liveControllerIds = FieldValue.arrayUnion(organizerId);
    } else if (legacyId) {
      patch.liveControllerId = FieldValue.delete();
    }
  }
  if (Object.keys(patch).length > 1) {
    await matchRef.set(patch, { merge: true });
  }

  return { migrated: true };
});
