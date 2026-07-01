/**
 * userRepository.ts — perfil do jogador: users/{userId}
 * Contas ligadas: Firestore é a fonte de verdade (foto JPEG base64 no documento).
 * localStorage é apenas cache offline.
 */

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteField,
  serverTimestamp,
  type DocumentReference,
} from "firebase/firestore";
import { db, isFirebaseConfigured } from "./firebase";
import type { PlayerAttributes } from "./cardUtils";
import {
  applyParticipationGainsToCard,
  applyRatingGainsToCard,
  applyVoteGainsToCard,
  calculateOverall,
  computeRatingAttributeDeltas,
  generateInitialAttributes,
  revertParticipationGainsFromCard,
  revertRatingGainsFromCard,
  revertVoteGainsFromCard,
} from "./cardUtils";
import {
  deleteUserMatchHistory,
  getUserMatchHistoryEntry,
  hasParticipationApplied,
  hasVoteEvolutionApplied,
  loadUserMatchHistory,
  saveUserMatchHistory,
  type MatchResult,
  type UserMatchHistoryEntry,
} from "./matchHistoryRepository";
import { collectLinkedPlayerUserIds, computePlayerMatchStats, isPlayerTopScorer, type MatchEvent } from "./evolutionUtils";
import { deleteEvolutionRecordsForMatch } from "./evolutionRepository";

export const PROFILE_UPDATED_EVENT = "joga-ai-profile-updated";

function notifyProfileUpdated(userId: string) {
  window.dispatchEvent(new CustomEvent(PROFILE_UPDATED_EVENT, { detail: { userId } }));
}

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
  lastAttributeDeltas?: Partial<PlayerAttributes>;
  /** Partida que originou os lastAttributeDeltas */
  lastEvolutionMatchId?: string;
  badges?: string[];
  /** Handle Instagram (sem @) */
  instagram?: string;
  /** Número WhatsApp (apenas dígitos, com indicativo) */
  whatsapp?: string;
  showInstagramPublic?: boolean;
  showWhatsappPublic?: boolean;
  updatedAt?: string;
};

export type SocialLinksInput = {
  instagram?: string;
  whatsapp?: string;
  showInstagramPublic?: boolean;
  showWhatsappPublic?: boolean;
};

export type VisibleSocialLinks = {
  instagram?: string;
  whatsapp?: string;
};

/** Extrai handle Instagram de URL ou texto (@opcional). */
export function sanitizeInstagramInput(input: string): string | undefined {
  const trimmed = input.trim();
  if (!trimmed) return undefined;

  const urlMatch = trimmed.match(/instagram\.com\/([a-zA-Z0-9._]+)/i);
  if (urlMatch?.[1]) return urlMatch[1].replace(/^@/, "").toLowerCase();

  const handle = trimmed.replace(/^@/, "").replace(/\s/g, "");
  return handle ? handle.toLowerCase() : undefined;
}

/** Normaliza número ou link wa.me para dígitos. */
export function sanitizeWhatsappInput(input: string): string | undefined {
  const trimmed = input.trim();
  if (!trimmed) return undefined;

  const waMatch = trimmed.match(/wa\.me\/(\d+)/i);
  if (waMatch?.[1]) return waMatch[1];

  const phoneMatch = trimmed.match(/phone=(\d+)/i);
  if (phoneMatch?.[1]) return phoneMatch[1];

  const digits = trimmed.replace(/\D/g, "");
  return digits || undefined;
}

export function getInstagramUrl(handle?: string): string | undefined {
  if (!handle) return undefined;
  return `https://instagram.com/${handle.replace(/^@/, "")}`;
}

export function getWhatsappUrl(number?: string): string | undefined {
  if (!number) return undefined;
  return `https://wa.me/${number.replace(/\D/g, "")}`;
}

export function formatInstagramDisplay(handle: string): string {
  return `@${handle.replace(/^@/, "")}`;
}

export function formatWhatsappDisplay(number: string): string {
  const digits = number.replace(/\D/g, "");
  if (digits.length <= 4) return digits;
  return `+${digits}`;
}

export function getVisibleSocialLinks(profile: UserProfile): VisibleSocialLinks | null {
  const links: VisibleSocialLinks = {};

  if (profile.instagram && profile.showInstagramPublic) {
    links.instagram = profile.instagram;
  }
  if (profile.whatsapp && profile.showWhatsappPublic) {
    links.whatsapp = profile.whatsapp;
  }

  return links.instagram || links.whatsapp ? links : null;
}

function applySocialLinksPatch(
  current: UserProfile,
  patch: SocialLinksInput,
): Pick<UserProfile, "instagram" | "whatsapp" | "showInstagramPublic" | "showWhatsappPublic"> {
  const instagram =
    patch.instagram !== undefined
      ? sanitizeInstagramInput(patch.instagram)
      : current.instagram;
  const whatsapp =
    patch.whatsapp !== undefined ? sanitizeWhatsappInput(patch.whatsapp) : current.whatsapp;

  const showInstagramPublic = instagram
    ? patch.showInstagramPublic ?? current.showInstagramPublic ?? false
    : false;
  const showWhatsappPublic = whatsapp
    ? patch.showWhatsappPublic ?? current.showWhatsappPublic ?? false
    : false;

  return {
    instagram,
    whatsapp,
    showInstagramPublic,
    showWhatsappPublic,
  };
}

const LOCAL_PROFILE_PREFIX = "joga-ai-user-profile-v2";
const LEGACY_PROFILE_KEY = "joga-ai-user-profile-v1";

/** Limite seguro para photoUrl base64 no documento Firestore (~280 KB) */
export const MAX_PROFILE_PHOTO_BYTES = 280_000;

export class ProfilePhotoTooLargeError extends Error {
  constructor() {
    super(
      "A foto é demasiado grande para sincronizar. Aproxima mais no recorte ou escolhe outra imagem.",
    );
    this.name = "ProfilePhotoTooLargeError";
  }
}

function validatePhotoUrlForFirestore(photoUrl?: string): string | undefined {
  if (!photoUrl) return undefined;
  if (!photoUrl.startsWith("data:")) return photoUrl;
  if (photoUrl.length > MAX_PROFILE_PHOTO_BYTES) {
    throw new ProfilePhotoTooLargeError();
  }
  return photoUrl;
}

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
    lastAttributeDeltas: data.lastAttributeDeltas as Partial<PlayerAttributes> | undefined,
    lastEvolutionMatchId: data.lastEvolutionMatchId
      ? String(data.lastEvolutionMatchId)
      : undefined,
    badges: Array.isArray(data.badges) ? (data.badges as string[]) : undefined,
    instagram: data.instagram ? sanitizeInstagramInput(String(data.instagram)) : undefined,
    whatsapp: data.whatsapp ? sanitizeWhatsappInput(String(data.whatsapp)) : undefined,
    showInstagramPublic: Boolean(data.showInstagramPublic),
    showWhatsappPublic: Boolean(data.showWhatsappPublic),
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
    const merged = buildProfileFromRemote(userId, seed, remote);
    if (local?.lastAttributeDeltas && !merged.lastAttributeDeltas) {
      return { ...merged, lastAttributeDeltas: local.lastAttributeDeltas };
    }
    return merged;
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

    let photoUrl = validatePhotoUrlForFirestore(migrated.photoUrl);

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
      const photoUrl = validatePhotoUrlForFirestore(local.photoUrl);
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

export type PublicUserProfile = {
  userId: string;
  displayName: string;
  position: string;
  photoUrl?: string;
  overall: number;
};

export type PublicPlayerProfile = PublicUserProfile & {
  shirtNumber: number;
  title: string;
  attributes: PlayerAttributes;
  seasonStats: UserProfile["seasonStats"];
  badges?: string[];
  instagram?: string;
  whatsapp?: string;
  showInstagramPublic?: boolean;
  showWhatsappPublic?: boolean;
};

function mapPublicPlayerProfile(userId: string, data: Record<string, unknown>): PublicPlayerProfile {
  const attrs = (data.attributes as PlayerAttributes | undefined) ?? generateInitialAttributes(String(data.position ?? "MEI"));
  return {
    userId,
    displayName: String(data.displayName ?? "Jogador").trim() || "Jogador",
    position: String(data.position ?? "MEI"),
    photoUrl: data.photoUrl ? String(data.photoUrl) : undefined,
    overall: calculateOverall(attrs),
    shirtNumber: Number(data.shirtNumber ?? 10),
    title: String(data.title ?? "Jogador"),
    attributes: attrs,
    seasonStats: (data.seasonStats as UserProfile["seasonStats"]) ?? {
      matches: 0,
      goals: 0,
      assists: 0,
      saves: 0,
      mvp: 0,
    },
    badges: Array.isArray(data.badges) ? (data.badges as string[]) : undefined,
    instagram: data.instagram ? sanitizeInstagramInput(String(data.instagram)) : undefined,
    whatsapp: data.whatsapp ? sanitizeWhatsappInput(String(data.whatsapp)) : undefined,
    showInstagramPublic: Boolean(data.showInstagramPublic),
    showWhatsappPublic: Boolean(data.showWhatsappPublic),
  };
}

/** Perfil público completo de um jogador (carta + estatísticas) */
export async function loadPublicPlayerProfile(userId: string): Promise<PublicPlayerProfile | null> {
  if (!userId) return null;

  if (!isFirebaseConfigured()) {
    const local = readLocalProfile(userId);
    if (!local?.profileComplete) return null;
    return mapPublicPlayerProfile(userId, local as unknown as Record<string, unknown>);
  }

  try {
    const snap = await getDoc(doc(db, "users", userId));
    if (!snap.exists()) return null;
    const data = snap.data() as Record<string, unknown>;
    if (!data.profileComplete && !data.displayName) return null;
    return mapPublicPlayerProfile(userId, data);
  } catch (err) {
    console.warn("[userRepository] loadPublicPlayerProfile:", err);
    return null;
  }
}

/** Perfis públicos de outros jogadores (nome, foto, posição) */
export async function loadPublicProfiles(
  userIds: string[],
): Promise<Map<string, PublicUserProfile>> {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  const map = new Map<string, PublicUserProfile>();
  if (!uniqueIds.length) return map;

  const addProfile = (userId: string, data: Record<string, unknown>) => {
    const attrs = data.attributes as PlayerAttributes | undefined;
    map.set(userId, {
      userId,
      displayName: String(data.displayName ?? "Jogador").trim() || "Jogador",
      position: String(data.position ?? "MEI"),
      photoUrl: data.photoUrl ? String(data.photoUrl) : undefined,
      overall: attrs ? calculateOverall(attrs) : 50,
    });
  };

  if (!isFirebaseConfigured()) {
    for (const userId of uniqueIds) {
      const local = readLocalProfile(userId);
      if (local) {
        addProfile(userId, local as unknown as Record<string, unknown>);
      }
    }
    return map;
  }

  await Promise.all(
    uniqueIds.map(async (userId) => {
      try {
        const snap = await getDoc(doc(db, "users", userId));
        if (snap.exists()) {
          addProfile(userId, snap.data() as Record<string, unknown>);
        }
      } catch (err) {
        console.warn("[userRepository] loadPublicProfiles:", userId, err);
      }
    }),
  );

  return map;
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

  let photoUrl = validatePhotoUrlForFirestore(input.photoUrl ?? current.photoUrl);

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
  patch: Partial<ProfileSetupInput & { title: string } & SocialLinksInput>,
  isAnonymous = true,
): Promise<UserProfile> {
  const current = readLocalProfile(userId) ?? createIncompleteSeedProfile(userId, isAnonymous);

  const photoUrl = validatePhotoUrlForFirestore(
    patch.photoUrl !== undefined ? patch.photoUrl : current.photoUrl,
  );

  const socialPatch = applySocialLinksPatch(current, patch);

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
    ...socialPatch,
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
      const photoUrl = validatePhotoUrlForFirestore(updated.photoUrl);
      updated.photoUrl = photoUrl;
      writeLocalProfile(updated);
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
  matchId?: string;
  goals: number;
  assists: number;
  saves: number;
  fouls?: number;
  yellowCards?: number;
  mvp: boolean;
  rating?: number;
  position?: string;
  voted?: boolean;
  isTopScorer?: boolean;
  /** Se true, não actualiza média/nota — fica para liberação após 24h */
  deferRating?: boolean;
};

function computeAttributeDeltas(
  before: PlayerAttributes,
  after: PlayerAttributes,
): Partial<PlayerAttributes> {
  const deltas: Partial<PlayerAttributes> = {};
  (Object.keys(before) as (keyof PlayerAttributes)[]).forEach((key) => {
    const diff = after[key] - before[key];
    if (diff > 0) deltas[key] = diff;
  });
  return deltas;
}

/** +1 Físico para todos os jogadores ligados no plantel quando a partida termina. */
export async function applyParticipationForMatchRoster(input: {
  matchId: string;
  title?: string;
  communityId?: string;
  organizerId?: string;
  players: Array<{ id: string; userId?: string }>;
}): Promise<void> {
  const userIds = collectLinkedPlayerUserIds(input.players, input.organizerId);
  await Promise.all(
    userIds.map((userId) =>
      applyParticipationToProfile(userId, {
        matchId: input.matchId,
        title: input.title ?? `Pelada ${input.matchId}`,
        communityId: input.communityId,
      }),
    ),
  );
}

export async function applyParticipationToProfile(
  userId: string,
  input: {
    matchId: string;
    title: string;
    communityId?: string;
  },
): Promise<void> {
  if (await hasParticipationApplied(userId, input.matchId)) return;

  const local =
    readLocalProfile(userId) ??
    (isFirebaseConfigured()
      ? await loadUserProfile(userId, undefined, { preferRemote: true })
      : null);
  if (!local) return;

  const beforeAttrs = local.attributes;
  const updatedAttrs = applyParticipationGainsToCard(beforeAttrs);
  const participationDeltas = computeAttributeDeltas(beforeAttrs, updatedAttrs);

  const updatedStats = {
    ...local.seasonStats,
    matches: local.seasonStats.matches + 1,
  };

  const updated: UserProfile = {
    ...local,
    attributes: updatedAttrs,
    seasonStats: updatedStats,
    lastAttributeDeltas: participationDeltas,
    lastEvolutionMatchId: input.matchId,
    updatedAt: new Date().toISOString(),
  };

  if (isFirebaseConfigured() && !local.isAnonymous) {
    try {
      await updateDoc(doc(db, "users", userId), {
        attributes: updatedAttrs,
        seasonStats: updatedStats,
        lastAttributeDeltas: participationDeltas,
        lastEvolutionMatchId: input.matchId,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.warn("[userRepository] applyParticipationToProfile:", err);
    }
  }

  writeLocalProfile(updated);
  notifyProfileUpdated(userId);

  const historyEntry: UserMatchHistoryEntry = {
    matchId: input.matchId,
    title: input.title,
    date: new Date().toISOString(),
    rating: 0,
    goals: 0,
    assists: 0,
    communityId: input.communityId,
    participationApplied: true,
    voteEvolutionApplied: false,
    ratingPending: true,
    ratingReleased: false,
  };
  await saveUserMatchHistory(userId, historyEntry);
}

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

  const participated = stats.matchId
    ? await hasParticipationApplied(userId, stats.matchId)
    : false;

  const beforeAttrs = local.attributes;
  const updatedAttrs = applyVoteGainsToCard(beforeAttrs, {
    goals: stats.goals,
    assists: stats.assists,
    saves: stats.saves,
    fouls: stats.fouls,
    yellowCards: stats.yellowCards,
    position: stats.position ?? local.position,
    voted: stats.voted ?? true,
    isTopScorer: stats.isTopScorer,
  });
  const voteDeltas = computeAttributeDeltas(beforeAttrs, updatedAttrs);
  const attributeDeltas = {
    ...(local.lastEvolutionMatchId === stats.matchId ? local.lastAttributeDeltas : {}),
    ...voteDeltas,
  };

  const prevMatches = local.seasonStats.matches;
  const rating = stats.deferRating ? 0 : (stats.rating ?? 0);
  const prevAvg = local.seasonStats.averageRating ?? 0;
  const newAvg =
    !stats.deferRating && rating > 0
      ? prevMatches > 0
        ? (prevAvg * prevMatches + rating) / (prevMatches + 1)
        : rating
      : prevAvg;

  const updatedStats = {
    ...local.seasonStats,
    matches: participated ? local.seasonStats.matches : local.seasonStats.matches + 1,
    goals: local.seasonStats.goals + stats.goals,
    assists: local.seasonStats.assists + stats.assists,
    saves: local.seasonStats.saves + stats.saves,
    mvp: local.seasonStats.mvp + (stats.mvp ? 1 : 0),
    averageRating: stats.deferRating
      ? prevAvg
      : Math.round(newAvg * 10) / 10,
  };

  const updated: UserProfile = {
    ...local,
    attributes: updatedAttrs,
    seasonStats: updatedStats,
    lastMatchRating: stats.deferRating ? local.lastMatchRating : rating || local.lastMatchRating,
    lastAttributeDeltas: attributeDeltas,
    lastEvolutionMatchId: stats.matchId ?? local.lastEvolutionMatchId,
    isAnonymous: local.isAnonymous,
    updatedAt: new Date().toISOString(),
  };

  if (isFirebaseConfigured() && !local.isAnonymous) {
    try {
      const patch: Record<string, unknown> = {
        attributes: updatedAttrs,
        seasonStats: updatedStats,
        lastAttributeDeltas: attributeDeltas,
        updatedAt: serverTimestamp(),
      };
      if (stats.matchId) {
        patch.lastEvolutionMatchId = stats.matchId;
      }
      if (!stats.deferRating && rating > 0) {
        patch.lastMatchRating = rating;
      }
      await updateDoc(doc(db, "users", userId), patch);
    } catch (err) {
      console.warn("[userRepository] applyMatchResultToProfile:", err);
    }
  }

  writeLocalProfile(updated);
  notifyProfileUpdated(userId);
}

/** Aplica nota média + ganho de Drible (≥8) quando a nota é revelada. */
export async function applyDelayedRatingToProfile(
  userId: string,
  rating: number,
  matchId?: string,
): Promise<void> {
  const local =
    readLocalProfile(userId) ??
    (isFirebaseConfigured()
      ? await loadUserProfile(userId, undefined, { preferRemote: true })
      : null);
  if (!local || rating <= 0) return;

  const matches = local.seasonStats.matches;
  const prevAvg = local.seasonStats.averageRating ?? 0;
  const newAvg =
    matches <= 1
      ? rating
      : (prevAvg * (matches - 1) + rating) / matches;

  const updatedStats = {
    ...local.seasonStats,
    averageRating: Math.round(newAvg * 10) / 10,
  };

  const ratingDeltas = computeRatingAttributeDeltas(rating);
  const updatedAttrs = applyRatingGainsToCard(local.attributes, rating);
  const mergeDisplayDeltas =
    matchId && local.lastEvolutionMatchId === matchId && Object.keys(ratingDeltas).length > 0;
  const lastAttributeDeltas = mergeDisplayDeltas
    ? { ...(local.lastAttributeDeltas ?? {}), ...ratingDeltas }
    : local.lastAttributeDeltas;

  const updated: UserProfile = {
    ...local,
    attributes: updatedAttrs,
    seasonStats: updatedStats,
    lastMatchRating: rating,
    lastAttributeDeltas,
    updatedAt: new Date().toISOString(),
  };

  if (isFirebaseConfigured() && !local.isAnonymous) {
    try {
      const patch: Record<string, unknown> = {
        attributes: updatedAttrs,
        seasonStats: updatedStats,
        lastMatchRating: rating,
        updatedAt: serverTimestamp(),
      };
      if (mergeDisplayDeltas) {
        patch.lastAttributeDeltas = lastAttributeDeltas;
      }
      await updateDoc(doc(db, "users", userId), patch);
    } catch (err) {
      console.warn("[userRepository] applyDelayedRatingToProfile:", err);
    }
  }

  writeLocalProfile(updated);
  notifyProfileUpdated(userId);
}

export function getLastMatchAttributeDeltas(
  profile: UserProfile,
  latestMatchId?: string,
): Partial<PlayerAttributes> | undefined {
  if (!profile.lastAttributeDeltas || Object.keys(profile.lastAttributeDeltas).length === 0) {
    return undefined;
  }
  if (!profile.lastEvolutionMatchId) {
    return profile.lastAttributeDeltas;
  }
  if (latestMatchId && profile.lastEvolutionMatchId !== latestMatchId) {
    return undefined;
  }
  return profile.lastAttributeDeltas;
}

export function getOverallDelta(profile: UserProfile): number {
  return getOverallDeltaFromDeltas(profile.attributes, profile.lastAttributeDeltas);
}

export function getOverallDeltaFromDeltas(
  attributes: PlayerAttributes,
  deltas?: Partial<PlayerAttributes>,
): number {
  if (!deltas || Object.keys(deltas).length === 0) return 0;
  const before = { ...attributes };
  const after = { ...attributes };
  (Object.keys(deltas) as (keyof PlayerAttributes)[]).forEach((key) => {
    const d = deltas[key] ?? 0;
    before[key] = Math.max(28, after[key] - d);
  });
  return calculateOverall(after) - calculateOverall(before);
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

export type RevertMatchStatsInput = {
  matchId: string;
  organizerId?: string;
  players: Array<{ id: string; userId?: string; position?: string }>;
  events: MatchEvent[];
  topScorers: Array<{ name: string; goals?: number }>;
  votedUserIds?: string[];
  matchResult?: MatchResult | null;
};

function revertAverageRating(
  matches: number,
  prevAvg: number,
  rating: number,
): number | undefined {
  if (matches <= 0) return undefined;
  if (matches === 1) return rating > 0 ? rating : undefined;
  if (rating <= 0) return prevAvg > 0 ? prevAvg : undefined;
  return Math.round(((prevAvg * matches - rating) / (matches - 1)) * 10) / 10;
}

function resolveLastMatchRatingAfterDelete(
  history: UserMatchHistoryEntry[],
  deletedMatchId: string,
): number | undefined {
  const remaining = history
    .filter(
      (entry) =>
        entry.matchId !== deletedMatchId && entry.ratingReleased && (entry.rating ?? 0) > 0,
    )
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return remaining[0]?.rating;
}

async function revertMatchStatsForPlayer(
  userId: string,
  player: { id: string; position?: string },
  input: RevertMatchStatsInput,
): Promise<void> {
  const { matchId, events, topScorers, votedUserIds, matchResult } = input;

  const historyEntry = await getUserMatchHistoryEntry(userId, matchId);
  const participated =
    historyEntry?.participationApplied ?? (await hasParticipationApplied(userId, matchId));
  const voteApplied =
    historyEntry?.voteEvolutionApplied ?? (await hasVoteEvolutionApplied(userId, matchId));
  const ratingReleased =
    historyEntry?.ratingReleased ?? Boolean(matchResult?.ratingsReleased);

  if (!participated && !voteApplied && !ratingReleased && !historyEntry) {
    return;
  }

  const local =
    readLocalProfile(userId) ??
    (isFirebaseConfigured()
      ? await loadUserProfile(userId, undefined, { preferRemote: true })
      : null);
  if (!local) return;

  const playerResult = matchResult?.players.find(
    (row) => row.userId === userId || row.playerId === player.id,
  );
  const stats = computePlayerMatchStats(player.id, events);
  const isTopScorer = isPlayerTopScorer(topScorers, player);
  const voted = votedUserIds?.includes(userId) ?? voteApplied;
  const rating = playerResult?.rating ?? historyEntry?.rating ?? 0;

  let attrs = { ...local.attributes };
  let seasonStats = { ...local.seasonStats };
  const historyBeforeDelete = await loadUserMatchHistory(userId);

  if (ratingReleased && rating > 0) {
    attrs = revertRatingGainsFromCard(attrs, rating);
    const revertedAvg = revertAverageRating(
      seasonStats.matches,
      seasonStats.averageRating ?? 0,
      rating,
    );
    if (revertedAvg === undefined) {
      delete seasonStats.averageRating;
    } else {
      seasonStats.averageRating = revertedAvg;
    }
  }

  if (voteApplied) {
    attrs = revertVoteGainsFromCard(attrs, {
      goals: stats.goals,
      assists: stats.assists,
      saves: stats.saves,
      fouls: stats.fouls,
      yellowCards: stats.cards,
      position: player.position ?? local.position,
      voted,
      isTopScorer,
    });
    seasonStats = {
      ...seasonStats,
      goals: Math.max(0, seasonStats.goals - stats.goals),
      assists: Math.max(0, seasonStats.assists - stats.assists),
      saves: Math.max(0, seasonStats.saves - stats.saves),
      matches: participated ? seasonStats.matches : Math.max(0, seasonStats.matches - 1),
    };
  }

  if (participated) {
    attrs = revertParticipationGainsFromCard(attrs);
    seasonStats = {
      ...seasonStats,
      matches: Math.max(0, seasonStats.matches - 1),
    };
  }

  const clearEvolutionPointers = local.lastEvolutionMatchId === matchId;
  const remainingHistory = historyBeforeDelete.filter((entry) => entry.matchId !== matchId);
  const nextLastMatchRating = clearEvolutionPointers
    ? resolveLastMatchRatingAfterDelete(historyBeforeDelete, matchId)
    : local.lastMatchRating;

  const updated: UserProfile = {
    ...local,
    attributes: attrs,
    seasonStats,
    lastMatchRating: nextLastMatchRating,
    updatedAt: new Date().toISOString(),
  };

  if (clearEvolutionPointers) {
    delete updated.lastAttributeDeltas;
    delete updated.lastEvolutionMatchId;
  }

  if (isFirebaseConfigured() && !local.isAnonymous) {
    try {
      const patch: Record<string, unknown> = {
        attributes: attrs,
        seasonStats,
        _revertForMatchId: matchId,
        updatedAt: serverTimestamp(),
      };
      if (clearEvolutionPointers) {
        patch.lastAttributeDeltas = deleteField();
        patch.lastEvolutionMatchId = deleteField();
      }
      if (nextLastMatchRating === undefined) {
        patch.lastMatchRating = deleteField();
      } else {
        patch.lastMatchRating = nextLastMatchRating;
      }
      await updateDoc(doc(db, "users", userId), patch);
    } catch (err) {
      console.warn("[userRepository] revertMatchStatsForPlayer:", err);
    }
  }

  writeLocalProfile(updated);
  notifyProfileUpdated(userId);
  await deleteUserMatchHistory(userId, matchId);
  await deleteEvolutionRecordsForMatch(userId, matchId);
}

/** Reverte ganhos de carta, seasonStats e histórico para todos os jogadores ligados. */
export async function revertMatchStatsForPlayers(input: RevertMatchStatsInput): Promise<void> {
  const userIds = collectLinkedPlayerUserIds(input.players, input.organizerId);
  const playersByUserId = new Map<string, { id: string; position?: string }>();

  for (const player of input.players) {
    const uid = player.userId ?? (player.id === input.organizerId ? input.organizerId : undefined);
    if (uid) playersByUserId.set(uid, player);
  }

  await Promise.all(
    userIds.map((userId) => {
      const player = playersByUserId.get(userId);
      if (!player) return Promise.resolve();
      return revertMatchStatsForPlayer(userId, player, input);
    }),
  );
}
