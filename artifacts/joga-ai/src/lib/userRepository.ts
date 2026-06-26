/**
 * userRepository.ts — perfil do jogador: users/{userId}
 */

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db, isFirebaseConfigured } from "./firebase";
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
  };
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

/** Quando o Firebase liga, o uid muda — traz o perfil local para o uid novo */
export function migrateLocalProfileIfNeeded(fromUserId: string, toUserId: string): void {
  if (!fromUserId || !toUserId || fromUserId === toUserId) return;

  const from = readLocalProfile(fromUserId);
  if (!from) return;

  const to = readLocalProfile(toUserId);
  const toHasData =
    to?.profileComplete ||
    Boolean(to?.displayName?.trim()) ||
    Boolean(to?.photoUrl);

  if (toHasData) return;

  writeLocalProfile({ ...from, uid: toUserId });
}

function mergeProfiles(
  userId: string,
  seed: UserProfile,
  local: UserProfile | null,
  remote: Partial<UserProfile> | null,
): UserProfile {
  const base = remote
    ? {
        ...seed,
        ...remote,
        uid: userId,
        profileComplete:
          remote.profileComplete !== undefined
            ? Boolean(remote.profileComplete)
            : Boolean(String(remote.displayName ?? "").trim().length >= 2),
        seasonStats: remote.seasonStats ?? seed.seasonStats,
        attributes: remote.attributes ?? seed.attributes,
        updatedAt: remote.updatedAt ?? new Date().toISOString(),
      }
    : local ?? { ...seed, uid: userId };

  // Foto grande fica só no dispositivo — não sobrescrever com remoto vazio
  if (local?.photoUrl && !base.photoUrl) {
    base.photoUrl = local.photoUrl;
  }

  // Perfil completo local ganha se o remoto ainda estiver incompleto
  if (local?.profileComplete && !base.profileComplete) {
    return { ...local, uid: userId };
  }

  if (local?.profileComplete && base.profileComplete) {
    const localTime = Date.parse(local.updatedAt ?? "") || 0;
    const remoteTime = Date.parse(base.updatedAt ?? "") || 0;
    if (localTime >= remoteTime) {
      return { ...local, uid: userId, photoUrl: local.photoUrl ?? base.photoUrl };
    }
  }

  return base;
}

/** Perfil inicial vazio — sem dados do mock Diogo */
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
): Promise<UserProfile> {
  const seed = seedProfile ?? createIncompleteSeedProfile(userId);
  const local = readLocalProfile(userId);

  if (!isFirebaseConfigured()) {
    return local ?? seed;
  }

  try {
    const ref = doc(db, "users", userId);
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      const initial = mergeProfiles(userId, seed, local, null);
      const { photoUrl, ...forFirestore } = initial;
      await setDoc(
        ref,
        { ...forFirestore, photoUrl: photoUrl && photoUrl.length < 400_000 ? photoUrl : undefined, createdAt: serverTimestamp() },
        { merge: true },
      );
      writeLocalProfile(initial);
      return initial;
    }

    const data = snap.data() as Partial<UserProfile>;
    const profile = mergeProfiles(userId, seed, local, data);
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
  const updated: UserProfile = {
    ...current,
    uid: userId,
    displayName: input.displayName.trim(),
    position,
    shirtNumber: input.shirtNumber,
    photoUrl: input.photoUrl ?? current.photoUrl,
    title: input.title?.trim() || current.title || "Jogador",
    isAnonymous,
    profileComplete: true,
    attributes: current.profileComplete
      ? current.attributes
      : generateInitialAttributes(position),
    updatedAt: new Date().toISOString(),
  };

  writeLocalProfile(updated);

  if (isFirebaseConfigured()) {
    try {
      const ref = doc(db, "users", userId);
      const { photoUrl, ...forFirestore } = updated;
      await setDoc(
        ref,
        {
          ...forFirestore,
          photoUrl: photoUrl && photoUrl.length < 400_000 ? photoUrl : undefined,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
    } catch (err) {
      console.warn("[userRepository] completeUserProfile:", err);
    }
  }

  return updated;
}

export async function updateUserProfile(
  userId: string,
  patch: Partial<ProfileSetupInput & { title: string }>,
): Promise<UserProfile> {
  const current = readLocalProfile(userId) ?? createIncompleteSeedProfile(userId);
  const updated: UserProfile = {
    ...current,
    displayName: patch.displayName?.trim() ?? current.displayName,
    // Posição só muda no primeiro cadastro — edição preserva posição e atributos
    position: current.position,
    shirtNumber: patch.shirtNumber ?? current.shirtNumber,
    photoUrl: patch.photoUrl !== undefined ? patch.photoUrl : current.photoUrl,
    title: patch.title?.trim() ?? current.title,
    attributes: current.attributes,
    profileComplete: true,
    updatedAt: new Date().toISOString(),
  };

  writeLocalProfile(updated);

  if (isFirebaseConfigured()) {
    try {
      const { photoUrl, ...forFirestore } = updated;
      await updateDoc(doc(db, "users", userId), {
        ...forFirestore,
        photoUrl: photoUrl && photoUrl.length < 400_000 ? photoUrl : undefined,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.warn("[userRepository] updateUserProfile:", err);
    }
  }

  return updated;
}

export async function markProfileAsLinked(userId: string): Promise<void> {
  const current = readLocalProfile(userId);
  if (!current || !current.isAnonymous) return;

  const updated: UserProfile = {
    ...current,
    isAnonymous: false,
    updatedAt: new Date().toISOString(),
  };
  writeLocalProfile(updated);

  if (!isFirebaseConfigured()) return;

  try {
    await updateDoc(doc(db, "users", userId), {
      isAnonymous: false,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn("[userRepository] markProfileAsLinked:", err);
  }
}

export async function applyMatchGainsToProfile(
  userId: string,
  averageRating: number,
): Promise<void> {
  const local = readLocalProfile(userId);
  if (!local) return;

  const updatedAttrs = applyMatchStatsToCard(local.attributes, averageRating);
  const updatedStats = {
    ...local.seasonStats,
    matches: local.seasonStats.matches + 1,
  };

  const updated: UserProfile = {
    ...local,
    attributes: updatedAttrs,
    seasonStats: updatedStats,
    updatedAt: new Date().toISOString(),
  };

  writeLocalProfile(updated);

  if (!isFirebaseConfigured()) return;

  try {
    await updateDoc(doc(db, "users", userId), {
      attributes: updatedAttrs,
      seasonStats: updatedStats,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn("[userRepository] applyMatchGainsToProfile:", err);
  }
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
