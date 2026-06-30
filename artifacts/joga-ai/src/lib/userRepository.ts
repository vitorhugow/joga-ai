/**
 * userRepository.ts — perfil do jogador: users/{userId}
 * Contas ligadas: Firestore + Firebase Storage são a fonte de verdade.
 * localStorage é apenas cache offline.
 */

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  type DocumentReference,
} from "firebase/firestore";
import { ref, uploadString, getDownloadURL } from "firebase/storage";
import { db, storage, isFirebaseConfigured } from "./firebase";
import type { PlayerAttributes } from "./cardUtils";
import { applyMatchStatsToCard, generateInitialAttributes } from "./cardUtils";

export type UserProfile = {
  uid: string;
  displayName: string;
  position: string;
  shirtNumber: number;
  photoUrl?: string;
  title: string;
  isAnonymous: boolean;
  profileComplete: boolean;
  attributes: PlayerAttributes;
  seasonStats: {
    matches: number;
    goals: number;
    assists: number;
    saves: number;
    mvp: number;
    averageRating?: number;
  };
  lastMatchRating?: number;
  updatedAt?: string;
};

const LOCAL_PROFILE_PREFIX = "joga-ai-user-profile-v2";
const LEGACY_PROFILE_KEY = "joga-ai-user-profile-v1";

function localProfileKey(userId: string) {
  return `${LOCAL_PROFILE_PREFIX}-${userId}`;
}

function readLocalProfile(userId: string): UserProfile | null {
  try {
    const raw = localStorage.getItem(localProfileKey(userId));
    if (raw) return JSON.parse(raw) as UserProfile;

    const legacy = localStorage.getItem(LEGACY_PROFILE_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy) as UserProfile;
      if (!parsed.uid || parsed.uid === userId) {
        return { ...parsed, uid: userId };
      }
    }
    return null;
  } catch {
    return null;
  }
}

function writeLocalProfile(profile: UserProfile) {
  localStorage.setItem(localProfileKey(profile.uid), JSON.stringify(profile));
}

function parseUpdatedAt(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null && "toDate" in value) {
    try {
      return (value as { toDate(): Date }).toDate().toISOString();
    } catch {
      return "";
    }
  }
  return "";
}

function remoteToPartial(data: Record<string, unknown>, userId: string): Partial<UserProfile> {
  return {
    uid: userId,
    displayName: String(data.displayName ?? ""),
    position: String(data.position ?? "AVA"),
    shirtNumber: Number(data.shirtNumber ?? 10),
    photoUrl: data.photoUrl ? String(data.photoUrl) : undefined,
    title: String(data.title ?? "Jogador"),
    isAnonymous: Boolean(data.isAnonymous),
    profileComplete: Boolean(data.profileComplete),
    attributes: data.attributes as PlayerAttributes,
    seasonStats: data.seasonStats as UserProfile["seasonStats"],
    lastMatchRating: data.lastMatchRating ? Number(data.lastMatchRating) : undefined,
    updatedAt: parseUpdatedAt(data.updatedAt),
  };
}

function buildProfileFromRemote(
  userId: string,
  seed: UserProfile,
  remote: Partial<UserProfile>,
): UserProfile {
  return {
    ...seed,
    ...remote,
    uid: userId,
    profileComplete:
      remote.profileComplete !== undefined
        ? Boolean(remote.profileComplete)
        : Boolean(String(remote.displayName ?? "").trim().length >= 2),
    seasonStats: remote.seasonStats ?? seed.seasonStats,
    attributes: remote.attributes ?? seed.attributes,
    updatedAt: remote.updatedAt || new Date().toISOString(),
  };
}

/** Contas ligadas: servidor manda; anónimos podem usar cache local */
function mergeProfiles(
  userId: string,
  seed: UserProfile,
  local: UserProfile | null,
  remote: Partial<UserProfile> | null,
  preferRemote: boolean,
): UserProfile {
  if (preferRemote && remote) {
    return buildProfileFromRemote(userId, seed, remote);
  }

  if (preferRemote && !remote && local?.profileComplete) {
    return { ...local, uid: userId };
  }

  const base = remote
    ? buildProfileFromRemote(userId, seed, remote)
    : local ?? { ...seed, uid: userId };

  if (!preferRemote && local?.profileComplete && !base.profileComplete) {
    return { ...local, uid: userId };
  }

  if (!preferRemote && local?.profileComplete && base.profileComplete) {
    const localTime = Date.parse(local.updatedAt ?? "") || 0;
    const remoteTime = Date.parse(base.updatedAt ?? "") || 0;
    if (localTime > remoteTime) {
      return { ...local, uid: userId, photoUrl: local.photoUrl ?? base.photoUrl };
    }
  }

  return base;
}

async function uploadProfilePhoto(userId: string, photoUrl: string): Promise<string> {
  if (!photoUrl.startsWith("data:")) return photoUrl;
  if (!isFirebaseConfigured()) return photoUrl;

  const photoRef = ref(storage, `users/${userId}/profile.jpg`);
  await uploadString(photoRef, photoUrl, "data_url");
  return getDownloadURL(photoRef);
}

async function resolvePhotoUrl(userId: string, photoUrl?: string): Promise<string | undefined> {
  if (!photoUrl) return undefined;
  try {
    return await uploadProfilePhoto(userId, photoUrl);
  } catch (err) {
    console.warn("[userRepository] uploadProfilePhoto:", err);
    if (photoUrl.startsWith("data:") && photoUrl.length < 400_000) {
      return photoUrl;
    }
    throw err;
  }
}

function profileForFirestore(profile: UserProfile) {
  const { uid: _uid, ...rest } = profile;
  return rest;
}

async function persistProfile(
  userRef: DocumentReference,
  profile: UserProfile,
  create = false,
): Promise<void> {
  const payload = {
    ...profileForFirestore(profile),
    updatedAt: serverTimestamp(),
  };

  if (create) {
    await setDoc(userRef, { ...payload, createdAt: serverTimestamp() }, { merge: true });
  } else {
    await setDoc(userRef, payload, { merge: true });
  }
}

/** Quando o Firebase liga, migra perfil local e sincroniza com o servidor */
export async function migrateLocalProfileIfNeeded(
  fromUserId: string,
  toUserId: string,
): Promise<void> {
  if (!fromUserId || !toUserId || fromUserId === toUserId) return;

  const from = readLocalProfile(fromUserId);
  if (!from) return;

  const to = readLocalProfile(toUserId);
  const toHasData =
    to?.profileComplete ||
    Boolean(to?.displayName?.trim()) ||
    Boolean(to?.photoUrl);

  if (toHasData) return;

  const migrated: UserProfile = { ...from, uid: toUserId, isAnonymous: false };
  writeLocalProfile(migrated);

  if (!isFirebaseConfigured() || !migrated.profileComplete) return;

  try {
    const userRef = doc(db, "users", toUserId);
    const snap = await getDoc(userRef);
    if (snap.exists() && snap.data()?.profileComplete) return;

    let photoUrl = migrated.photoUrl;
    if (photoUrl?.startsWith("data:")) {
      photoUrl = await resolvePhotoUrl(toUserId, photoUrl);
    }

    await persistProfile(userRef, { ...migrated, photoUrl }, !snap.exists());
    writeLocalProfile({ ...migrated, photoUrl });
  } catch (err) {
    console.warn("[userRepository] migrateLocalProfileIfNeeded:", err);
  }
}

/** Perfil inicial vazio */
export function createIncompleteSeedProfile(
  userId: string,
  isAnonymous = true,
): UserProfile {
  const position = "AVA";
  return {
    uid: userId,
    displayName: "",
    position,
    shirtNumber: 10,
    title: "Jogador",
    isAnonymous,
    profileComplete: false,
    attributes: generateInitialAttributes(position),
    seasonStats: {
      matches: 0,
      goals: 0,
      assists: 0,
      saves: 0,
      mvp: 0,
    },
  };
}

export async function loadUserProfile(
  userId: string,
  seedProfile?: UserProfile,
  options?: { preferRemote?: boolean },
): Promise<UserProfile> {
  const preferRemote = options?.preferRemote ?? false;
  const seed = seedProfile ?? createIncompleteSeedProfile(userId);
  const local = readLocalProfile(userId);

  if (!isFirebaseConfigured()) {
    return local ?? seed;
  }

  try {
    const userRef = doc(db, "users", userId);
    const snap = await getDoc(userRef);
    const remote = snap.exists()
      ? remoteToPartial(snap.data() as Record<string, unknown>, userId)
      : null;

    let profile = mergeProfiles(userId, seed, local, remote, preferRemote);

    if (preferRemote && !remote && local?.profileComplete) {
      let photoUrl = local.photoUrl;
      if (photoUrl?.startsWith("data:")) {
        photoUrl = await resolvePhotoUrl(userId, photoUrl);
      }
      profile = { ...local, uid: userId, photoUrl, isAnonymous: false };
      await persistProfile(userRef, profile, true);
    }

    writeLocalProfile(profile);
    return profile;
  } catch (err) {
    console.warn("[userRepository] loadUserProfile:", err);
    return local ?? seed;
  }
}

export type ProfileSetupInput = {
  displayName: string;
  position: string;
  shirtNumber: number;
  photoUrl?: string;
  title?: string;
};

export async function completeUserProfile(
  userId: string,
  input: ProfileSetupInput,
  isAnonymous = true,
): Promise<UserProfile> {
  const current = readLocalProfile(userId) ?? createIncompleteSeedProfile(userId, isAnonymous);
  const position = input.position || current.position;

  let photoUrl = input.photoUrl ?? current.photoUrl;
  if (!isAnonymous && photoUrl) {
    photoUrl = await resolvePhotoUrl(userId, photoUrl);
  }

  const updated: UserProfile = {
    ...current,
    uid: userId,
    displayName: input.displayName.trim(),
    position,
    shirtNumber: input.shirtNumber,
    photoUrl,
    title: input.title?.trim() || current.title || "Jogador",
    isAnonymous,
    profileComplete: true,
    attributes: current.profileComplete
      ? current.attributes
      : generateInitialAttributes(position),
    updatedAt: new Date().toISOString(),
  };

  if (isFirebaseConfigured() && !isAnonymous) {
    const userRef = doc(db, "users", userId);
    const snap = await getDoc(userRef);
    await persistProfile(userRef, updated, !snap.exists());
  }

  writeLocalProfile(updated);
  return updated;
}

export async function updateUserProfile(
  userId: string,
  patch: Partial<ProfileSetupInput & { title: string }>,
  isAnonymous = true,
): Promise<UserProfile> {
  const current = readLocalProfile(userId) ?? createIncompleteSeedProfile(userId, isAnonymous);

  let photoUrl = patch.photoUrl !== undefined ? patch.photoUrl : current.photoUrl;
  if (!isAnonymous && photoUrl?.startsWith("data:")) {
    photoUrl = await resolvePhotoUrl(userId, photoUrl);
  }

  const updated: UserProfile = {
    ...current,
    displayName: patch.displayName?.trim() ?? current.displayName,
    position: current.position,
    shirtNumber: patch.shirtNumber ?? current.shirtNumber,
    photoUrl,
    title: patch.title?.trim() ?? current.title,
    attributes: current.attributes,
    profileComplete: true,
    isAnonymous,
    updatedAt: new Date().toISOString(),
  };

  if (isFirebaseConfigured() && !isAnonymous) {
    await persistProfile(doc(db, "users", userId), updated);
  }

  writeLocalProfile(updated);
  return updated;
}

export async function markProfileAsLinked(userId: string): Promise<void> {
  const current = readLocalProfile(userId);
  if (!current) return;

  const updated: UserProfile = {
    ...current,
    isAnonymous: false,
    updatedAt: new Date().toISOString(),
  };
  writeLocalProfile(updated);

  if (!isFirebaseConfigured()) return;

  try {
    const userRef = doc(db, "users", userId);
    if (updated.profileComplete) {
      let photoUrl = updated.photoUrl;
      if (photoUrl?.startsWith("data:")) {
        photoUrl = await resolvePhotoUrl(userId, photoUrl);
        updated.photoUrl = photoUrl;
        writeLocalProfile(updated);
      }
      const snap = await getDoc(userRef);
      await persistProfile(userRef, updated, !snap.exists());
    } else {
      await updateDoc(userRef, {
        isAnonymous: false,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    console.warn("[userRepository] markProfileAsLinked:", err);
  }
}

export async function applyMatchGainsToProfile(
  userId: string,
  averageRating: number,
): Promise<void> {
  await applyMatchResultToProfile(userId, {
    goals: 0,
    assists: 0,
    saves: 0,
    mvp: false,
    rating: averageRating,
  });
}

export type MatchResultStats = {
  goals: number;
  assists: number;
  saves: number;
  mvp: boolean;
  rating: number;
};

export async function applyMatchResultToProfile(
  userId: string,
  stats: MatchResultStats,
): Promise<void> {
  const local =
    readLocalProfile(userId) ??
    (isFirebaseConfigured()
      ? await loadUserProfile(userId, undefined, { preferRemote: true })
      : null);
  if (!local) return;

  const updatedAttrs = applyMatchStatsToCard(local.attributes, stats.rating);
  const prevAvg = local.seasonStats.averageRating ?? 0;
  const prevMatches = local.seasonStats.matches;
  const newAvg =
    prevMatches > 0
      ? (prevAvg * prevMatches + stats.rating) / (prevMatches + 1)
      : stats.rating;

  const updatedStats = {
    ...local.seasonStats,
    matches: local.seasonStats.matches + 1,
    goals: local.seasonStats.goals + stats.goals,
    assists: local.seasonStats.assists + stats.assists,
    saves: local.seasonStats.saves + stats.saves,
    mvp: local.seasonStats.mvp + (stats.mvp ? 1 : 0),
    averageRating: Math.round(newAvg * 10) / 10,
  };

  const updated: UserProfile = {
    ...local,
    attributes: updatedAttrs,
    seasonStats: updatedStats,
    lastMatchRating: stats.rating,
    isAnonymous: local.isAnonymous,
    updatedAt: new Date().toISOString(),
  };

  if (isFirebaseConfigured() && !local.isAnonymous) {
    try {
      await updateDoc(doc(db, "users", userId), {
        attributes: updatedAttrs,
        seasonStats: updatedStats,
        lastMatchRating: stats.rating,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.warn("[userRepository] applyMatchResultToProfile:", err);
    }
  }

  writeLocalProfile(updated);
}

export function getCachedProfile(userId?: string): UserProfile | null {
  if (!userId) return null;
  return readLocalProfile(userId);
}

export function profileToPlayerCard(profile: UserProfile) {
  return {
    name: profile.displayName || "Jogador",
    position: profile.position,
    shirtNumber: profile.shirtNumber,
    photoUrl: profile.photoUrl,
    title: profile.title,
    attributes: profile.attributes,
    seasonStats: profile.seasonStats,
  };
}
