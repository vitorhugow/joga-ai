/**
 * badgeService — desbloqueio de distintivos
 */

import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db, isFirebaseConfigured } from "./firebase";
import { loadUserProfile, type UserProfile } from "./userRepository";
import { addNotification } from "./notificationsRepository";
import { getBadgeById } from "./badgeCatalog";

function readLocalProfile(userId: string): UserProfile | null {
  try {
    const raw = localStorage.getItem(`joga-ai-user-profile-v2-${userId}`);
    return raw ? (JSON.parse(raw) as UserProfile) : null;
  } catch {
    return null;
  }
}

function writeLocalBadges(userId: string, badges: string[]) {
  const local = readLocalProfile(userId);
  if (!local) return;
  localStorage.setItem(
    `joga-ai-user-profile-v2-${userId}`,
    JSON.stringify({ ...local, badges }),
  );
}

function computeEligibleBadges(profile: UserProfile, lastRating?: number): string[] {
  const stats = profile.seasonStats;
  const eligible: string[] = [];

  if (stats.matches >= 1) eligible.push("first_match");
  if (stats.matches >= 5) eligible.push("matches_5");
  if (stats.matches >= 10) eligible.push("matches_10");
  if (stats.matches >= 25) eligible.push("matches_25");
  if (stats.goals >= 5) eligible.push("goals_5");
  if (stats.goals >= 15) eligible.push("goals_15");
  if (stats.goals >= 30) eligible.push("goals_30");
  if (stats.assists >= 5) eligible.push("assists_5");
  if (stats.assists >= 15) eligible.push("assists_15");
  if (stats.mvp >= 1) eligible.push("mvp_1");

  const avg = stats.averageRating ?? lastRating ?? profile.lastMatchRating ?? 0;
  if (avg >= 8) eligible.push("rating_8");
  if (avg >= 9) eligible.push("rating_9");

  return eligible;
}

export async function checkAndUnlockBadges(
  userId: string,
  context?: { lastRating?: number; matchMvp?: boolean; applyForMatchId?: string },
): Promise<string[]> {
  if (!userId) return [];

  const profile =
    readLocalProfile(userId) ??
    (await loadUserProfile(userId, undefined, { preferRemote: true }));
  const current = profile.badges ?? [];
  const eligible = computeEligibleBadges(profile, context?.lastRating);
  const newlyUnlocked = eligible.filter((id) => !current.includes(id));

  if (!newlyUnlocked.length) return [];

  const merged = [...new Set([...current, ...newlyUnlocked])];
  writeLocalBadges(userId, merged);

  if (isFirebaseConfigured() && !profile.isAnonymous) {
    try {
      const patch: Record<string, unknown> = {
        badges: merged,
        updatedAt: serverTimestamp(),
      };
      // Ver nota em userRepository.applyDelayedRatingToProfile — permite a
      // quem finaliza a votação (não necessariamente o organizador ou o
      // próprio dono) desbloquear distintivos de todos os jogadores.
      if (context?.applyForMatchId) {
        patch._applyForMatchId = context.applyForMatchId;
      }
      await updateDoc(doc(db, "users", userId), patch);
    } catch (err) {
      console.warn("[badgeService] persist:", err);
    }
  }

  for (const id of newlyUnlocked) {
    const badge = getBadgeById(id);
    if (!badge) continue;
    await addNotification(userId, {
      id: `badge-${id}`,
      title: "Novo distintivo!",
      body: `Desbloqueaste «${badge.name}» — ${badge.desc}`,
      type: "system",
      link: "/perfil",
    });
  }

  return newlyUnlocked;
}
