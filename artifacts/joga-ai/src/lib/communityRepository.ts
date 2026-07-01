/**
 * communityRepository.ts — comunidades e listagens de partidas (Firestore)
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  collectionGroup,
  writeBatch,
  increment,
} from "firebase/firestore";
import { db, isFirebaseConfigured } from "./firebase";
import { OPEN_MATCH_STATUSES } from "./matchRepository";
import { MAX_PROFILE_PHOTO_BYTES } from "./userRepository";

export class CommunityCoverTooLargeError extends Error {
  constructor() {
    super("A imagem da capa é demasiado grande. Tenta outra foto.");
    this.name = "CommunityCoverTooLargeError";
  }
}

export function validateCoverImageForFirestore(coverImage?: string): string | undefined {
  if (!coverImage) return undefined;
  if (!coverImage.startsWith("data:")) return coverImage;
  if (coverImage.length > MAX_PROFILE_PHOTO_BYTES) {
    throw new CommunityCoverTooLargeError();
  }
  return coverImage;
}

export type Community = {
  id: string;
  name: string;
  city: string;
  gameType: "fut5" | "fut7" | "futsal" | "futebol11";
  isPrivate: boolean;
  isMember: boolean;
  memberCount: number;
  coverImage?: string;
  adminId?: string;
};

export type MatchListing = {
  id: string;
  title: string;
  city: string;
  location: string;
  gameType: string;
  level: string;
  date: string;
  spotsRemaining: string;
  price: string;
  communityId?: string;
  status?: string;
};

export type CommunityMember = {
  userId: string;
  displayName: string;
  role: "admin" | "member";
};

export type JoinRequestStatus = "pending" | "approved" | "rejected";

export type AdminJoinRequest = {
  communityId: string;
  communityName: string;
  userId: string;
  displayName: string;
  requestedAt?: string;
};

export type JoinRequest = {
  userId: string;
  displayName: string;
  status: JoinRequestStatus;
  requestedAt?: string;
};

export type CreateCommunityInput = {
  name: string;
  city: string;
  gameType: Community["gameType"];
  isPrivate: boolean;
  adminId: string;
  adminDisplayName: string;
};

/** Carrega todas as comunidades */
export async function loadCommunities(userId?: string): Promise<Community[]> {
  if (!isFirebaseConfigured()) return [];

  try {
    const snap = await getDocs(collection(db, "communities"));
    if (snap.empty) return [];

    const memberIds = userId ? await loadMemberCommunityIds(userId) : new Set<string>();
    const pendingIds = userId ? await loadPendingRequestCommunityIds(userId) : new Set<string>();

    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        name: data.name ?? "Comunidade",
        city: data.city ?? "",
        gameType: data.gameType ?? "fut7",
        isPrivate: Boolean(data.isPrivate),
        memberCount: Number(data.memberCount ?? 1),
        coverImage: data.coverImage,
        adminId: data.adminId,
        isMember: memberIds.has(d.id) || (userId ? data.adminId === userId : false),
        joinPending: pendingIds.has(d.id),
      } as Community & { joinPending?: boolean };
    });
  } catch (err) {
    console.warn("[communityRepository] loadCommunities:", err);
    return [];
  }
}

function mapCommunityDoc(
  id: string,
  data: Record<string, unknown>,
  isMember = true,
): Community {
  return {
    id,
    name: String(data.name ?? "Comunidade"),
    city: String(data.city ?? ""),
    gameType: (data.gameType as Community["gameType"]) ?? "fut7",
    isPrivate: Boolean(data.isPrivate),
    memberCount: Number(data.memberCount ?? 1),
    coverImage: data.coverImage ? String(data.coverImage) : undefined,
    adminId: data.adminId ? String(data.adminId) : undefined,
    isMember,
  };
}

/** Comunidades onde o utilizador é membro ou administrador */
export async function loadMyCommunities(userId: string): Promise<Community[]> {
  if (!isFirebaseConfigured() || !userId) return [];

  const byId = new Map<string, Community>();

  try {
    const memberSnap = await getDocs(
      query(collectionGroup(db, "members"), where("userId", "==", userId)),
    );

    for (const memberDoc of memberSnap.docs) {
      const communityRef = memberDoc.ref.parent.parent;
      if (!communityRef) continue;
      const communitySnap = await getDoc(communityRef);
      if (!communitySnap.exists()) continue;
      byId.set(communitySnap.id, mapCommunityDoc(communitySnap.id, communitySnap.data()));
    }
  } catch (err) {
    console.warn("[communityRepository] loadMyCommunities members:", err);
  }

  try {
    const adminSnap = await getDocs(
      query(collection(db, "communities"), where("adminId", "==", userId)),
    );

    for (const communityDoc of adminSnap.docs) {
      if (!byId.has(communityDoc.id)) {
        byId.set(communityDoc.id, mapCommunityDoc(communityDoc.id, communityDoc.data()));
      }
    }
  } catch (err) {
    console.warn("[communityRepository] loadMyCommunities admin:", err);
  }

  return Array.from(byId.values());
}

async function loadMemberCommunityIds(userId: string): Promise<Set<string>> {
  try {
    const snap = await getDocs(
      query(collectionGroup(db, "members"), where("userId", "==", userId)),
    );
    const ids = new Set<string>();
    for (const d of snap.docs) {
      const ref = d.ref.parent.parent;
      if (ref) ids.add(ref.id);
    }
    return ids;
  } catch {
    return new Set();
  }
}

async function loadPendingRequestCommunityIds(userId: string): Promise<Set<string>> {
  try {
    const snap = await getDocs(
      query(
        collectionGroup(db, "joinRequests"),
        where("userId", "==", userId),
        where("status", "==", "pending"),
      ),
    );
    const ids = new Set<string>();
    for (const d of snap.docs) {
      const ref = d.ref.parent.parent;
      if (ref) ids.add(ref.id);
    }
    return ids;
  } catch {
    return new Set();
  }
}

export async function loadCommunity(
  id: string,
  userId?: string,
): Promise<(Community & { joinPending?: boolean }) | null> {
  if (!isFirebaseConfigured()) return null;

  try {
    const snap = await getDoc(doc(db, "communities", id));
    if (!snap.exists()) return null;

    const data = snap.data();
    const memberIds = userId ? await loadMemberCommunityIds(userId) : new Set<string>();
    const pendingIds = userId ? await loadPendingRequestCommunityIds(userId) : new Set<string>();

    return {
      id: snap.id,
      name: data.name ?? "Comunidade",
      city: data.city ?? "",
      gameType: data.gameType ?? "fut7",
      isPrivate: Boolean(data.isPrivate),
      memberCount: Number(data.memberCount ?? 1),
      coverImage: data.coverImage,
      adminId: data.adminId,
      isMember: memberIds.has(snap.id) || (userId ? data.adminId === userId : false),
      joinPending: pendingIds.has(snap.id),
    };
  } catch (err) {
    console.warn("[communityRepository] loadCommunity:", err);
    return null;
  }
}

export async function createCommunity(input: CreateCommunityInput): Promise<string> {
  if (!isFirebaseConfigured()) throw new Error("Firebase não configurado");

  const ref = doc(collection(db, "communities"));
  const communityId = ref.id;

  await setDoc(ref, {
    name: input.name.trim(),
    city: input.city.trim(),
    gameType: input.gameType,
    isPrivate: input.isPrivate,
    memberCount: 1,
    adminId: input.adminId,
    createdAt: serverTimestamp(),
  });

  await setDoc(doc(db, "communities", communityId, "members", input.adminId), {
    userId: input.adminId,
    displayName: input.adminDisplayName,
    role: "admin",
    joinedAt: serverTimestamp(),
  });

  return communityId;
}

export async function requestToJoin(
  communityId: string,
  userId: string,
  displayName: string,
): Promise<void> {
  if (!isFirebaseConfigured()) throw new Error("Firebase não configurado");

  await setDoc(doc(db, "communities", communityId, "joinRequests", userId), {
    userId,
    displayName: displayName.trim() || "Jogador",
    status: "pending" as JoinRequestStatus,
    requestedAt: serverTimestamp(),
  });
}

export async function getJoinRequestStatus(
  communityId: string,
  userId: string,
): Promise<JoinRequestStatus | null> {
  if (!isFirebaseConfigured() || !userId) return null;

  try {
    const snap = await getDoc(
      doc(db, "communities", communityId, "joinRequests", userId),
    );
    if (!snap.exists()) return null;
    return (snap.data().status as JoinRequestStatus) ?? null;
  } catch {
    return null;
  }
}

/** Pedidos pendentes nas comunidades onde o utilizador é admin */
export async function loadPendingJoinRequestsForAdmin(
  adminId: string,
): Promise<AdminJoinRequest[]> {
  if (!isFirebaseConfigured() || !adminId) return [];

  try {
    const communitiesSnap = await getDocs(
      query(collection(db, "communities"), where("adminId", "==", adminId)),
    );

    const requests: AdminJoinRequest[] = [];

    for (const communityDoc of communitiesSnap.docs) {
      const pendingSnap = await getDocs(
        query(
          collection(db, "communities", communityDoc.id, "joinRequests"),
          where("status", "==", "pending"),
        ),
      );

      for (const requestDoc of pendingSnap.docs) {
        const data = requestDoc.data();
        const requestedAt = data.requestedAt?.toDate?.()
          ? data.requestedAt.toDate().toISOString()
          : undefined;

        requests.push({
          communityId: communityDoc.id,
          communityName: communityDoc.data().name ?? "Comunidade",
          userId: requestDoc.id,
          displayName: data.displayName ?? "Jogador",
          requestedAt,
        });
      }
    }

    return requests.sort((a, b) => {
      const aTime = a.requestedAt ? new Date(a.requestedAt).getTime() : 0;
      const bTime = b.requestedAt ? new Date(b.requestedAt).getTime() : 0;
      return bTime - aTime;
    });
  } catch (err) {
    console.warn("[communityRepository] loadPendingJoinRequestsForAdmin:", err);
    return [];
  }
}

export async function approveJoinRequest(
  communityId: string,
  userId: string,
  displayName: string,
): Promise<void> {
  if (!isFirebaseConfigured()) throw new Error("Firebase não configurado");

  const batch = writeBatch(db);
  const requestRef = doc(db, "communities", communityId, "joinRequests", userId);
  const memberRef = doc(db, "communities", communityId, "members", userId);
  const communityRef = doc(db, "communities", communityId);

  batch.update(requestRef, {
    status: "approved" as JoinRequestStatus,
    reviewedAt: serverTimestamp(),
  });

  batch.set(memberRef, {
    userId,
    displayName: displayName.trim() || "Jogador",
    role: "member",
    joinedAt: serverTimestamp(),
  });

  batch.update(communityRef, {
    memberCount: increment(1),
  });

  await batch.commit();
}

export async function rejectJoinRequest(
  communityId: string,
  userId: string,
): Promise<void> {
  if (!isFirebaseConfigured()) throw new Error("Firebase não configurado");

  await updateDoc(doc(db, "communities", communityId, "joinRequests", userId), {
    status: "rejected" as JoinRequestStatus,
    reviewedAt: serverTimestamp(),
  });
}

export async function loadCommunityMembers(communityId: string): Promise<CommunityMember[]> {
  if (!isFirebaseConfigured()) return [];

  try {
    const snap = await getDocs(collection(db, "communities", communityId, "members"));
    return snap.docs.map((d) => ({
      userId: d.data().userId ?? d.id,
      displayName: d.data().displayName ?? "Jogador",
      role: (d.data().role as CommunityMember["role"]) ?? "member",
    }));
  } catch (err) {
    console.warn("[communityRepository] loadCommunityMembers:", err);
    return [];
  }
}

/** Corrige memberCount no documento com base na subcoleção members */
export async function syncCommunityMemberCount(communityId: string): Promise<number> {
  const members = await loadCommunityMembers(communityId);
  const count = Math.max(1, members.length);

  if (isFirebaseConfigured()) {
    try {
      await updateDoc(doc(db, "communities", communityId), { memberCount: count });
    } catch (err) {
      console.warn("[communityRepository] syncCommunityMemberCount:", err);
    }
  }

  return count;
}

export type UpdateCommunityInput = {
  name?: string;
  city?: string;
  gameType?: Community["gameType"];
  isPrivate?: boolean;
  coverImage?: string;
};

export async function loadPendingJoinRequests(communityId: string): Promise<JoinRequest[]> {
  if (!isFirebaseConfigured()) return [];

  try {
    const snap = await getDocs(
      query(
        collection(db, "communities", communityId, "joinRequests"),
        where("status", "==", "pending"),
      ),
    );
    return snap.docs.map((d) => ({
      userId: d.data().userId ?? d.id,
      displayName: d.data().displayName ?? "Jogador",
      status: (d.data().status as JoinRequestStatus) ?? "pending",
      requestedAt: d.data().requestedAt?.toDate?.()?.toISOString(),
    }));
  } catch (err) {
    console.warn("[communityRepository] loadPendingJoinRequests:", err);
    return [];
  }
}

export async function joinCommunityPublic(
  communityId: string,
  userId: string,
  displayName: string,
): Promise<void> {
  if (!isFirebaseConfigured()) throw new Error("Firebase não configurado");

  const communitySnap = await getDoc(doc(db, "communities", communityId));
  if (!communitySnap.exists()) throw new Error("Comunidade não encontrada");
  if (communitySnap.data().isPrivate) throw new Error("Comunidade privada");

  const memberRef = doc(db, "communities", communityId, "members", userId);
  const existing = await getDoc(memberRef);
  if (existing.exists()) return;

  await setDoc(memberRef, {
    userId,
    displayName: displayName.trim() || "Jogador",
    role: "member",
    joinedAt: serverTimestamp(),
  });

  const count = Number(communitySnap.data().memberCount ?? 0);
  await updateDoc(doc(db, "communities", communityId), { memberCount: count + 1 });
}

export async function updateCommunity(
  communityId: string,
  input: UpdateCommunityInput,
): Promise<void> {
  if (!isFirebaseConfigured()) throw new Error("Firebase não configurado");

  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.city !== undefined) patch.city = input.city.trim();
  if (input.gameType !== undefined) patch.gameType = input.gameType;
  if (input.isPrivate !== undefined) patch.isPrivate = input.isPrivate;
  if (input.coverImage !== undefined) {
    patch.coverImage = validateCoverImageForFirestore(input.coverImage);
  }

  await updateDoc(doc(db, "communities", communityId), patch);
}

export async function leaveCommunity(communityId: string, userId: string): Promise<void> {
  if (!isFirebaseConfigured() || !userId) throw new Error("Firebase não configurado");

  const communitySnap = await getDoc(doc(db, "communities", communityId));
  if (!communitySnap.exists()) return;
  if (communitySnap.data().adminId === userId) {
    throw new Error("O administrador não pode sair — transfere ou apaga a comunidade.");
  }

  await removeCommunityMember(communityId, userId);
}

export async function removeCommunityMember(
  communityId: string,
  memberUserId: string,
): Promise<void> {
  if (!isFirebaseConfigured()) throw new Error("Firebase não configurado");

  const communityRef = doc(db, "communities", communityId);
  const communitySnap = await getDoc(communityRef);
  if (!communitySnap.exists()) return;

  await deleteDoc(doc(db, "communities", communityId, "members", memberUserId));
  const count = Math.max(1, Number(communitySnap.data().memberCount ?? 1) - 1);
  await updateDoc(communityRef, { memberCount: count });
}

export async function deleteCommunity(communityId: string): Promise<void> {
  if (!isFirebaseConfigured()) throw new Error("Firebase não configurado");

  const batch = writeBatch(db);
  const membersSnap = await getDocs(collection(db, "communities", communityId, "members"));
  membersSnap.docs.forEach((d) => batch.delete(d.ref));
  const requestsSnap = await getDocs(collection(db, "communities", communityId, "joinRequests"));
  requestsSnap.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(doc(db, "communities", communityId));
  await batch.commit();
}

function isOpenPublicMatch(m: MatchListing): boolean {
  if (m.communityId) return false;
  return !m.status || OPEN_MATCH_STATUSES.includes(m.status as (typeof OPEN_MATCH_STATUSES)[number]);
}

/** Partidas públicas (Firestore + cache local) — exclui peladas de comunidade */
export async function loadAvailableMatches(limitCount = 10): Promise<MatchListing[]> {
  const localCreated = readLocalMatchListings().filter(isOpenPublicMatch);

  if (!isFirebaseConfigured()) {
    return localCreated.slice(0, limitCount);
  }

  try {
    const q = query(
      collection(db, "matches"),
      where("status", "in", [...OPEN_MATCH_STATUSES]),
      orderBy("createdAt", "desc"),
      limit(limitCount * 3),
    );
    const snap = await getDocs(q);

    const remote = snap.docs
      .map((d) => mapMatchDoc(d.id, d.data()))
      .filter(isOpenPublicMatch);

    const merged = [
      ...localCreated,
      ...remote.filter((m) => !localCreated.some((l) => l.id === m.id)),
    ];
    return merged.slice(0, limitCount);
  } catch (err) {
    console.warn("[communityRepository] loadAvailableMatches:", err);
    return localCreated.slice(0, limitCount);
  }
}

/** Partidas abertas de uma comunidade */
export async function loadCommunityMatches(
  communityId: string,
  limitCount = 20,
): Promise<MatchListing[]> {
  const localCreated = readLocalMatchListings().filter(
    (m) =>
      m.communityId === communityId &&
      (!m.status || OPEN_MATCH_STATUSES.includes(m.status as (typeof OPEN_MATCH_STATUSES)[number])),
  );

  if (!isFirebaseConfigured()) {
    return localCreated.slice(0, limitCount);
  }

  try {
    const q = query(
      collection(db, "matches"),
      where("communityId", "==", communityId),
      where("status", "in", [...OPEN_MATCH_STATUSES]),
      orderBy("savedAt", "desc"),
      limit(limitCount),
    );
    const snap = await getDocs(q);

    const remote = snap.docs.map((d) => mapMatchDoc(d.id, d.data()));

    const merged = [
      ...localCreated,
      ...remote.filter((m) => !localCreated.some((l) => l.id === m.id)),
    ];
    return merged.slice(0, limitCount);
  } catch (err) {
    console.warn("[communityRepository] loadCommunityMatches:", err);
    return localCreated.slice(0, limitCount);
  }
}

function mapMatchDoc(id: string, data: Record<string, unknown>): MatchListing {
  return {
    id,
    title: String(data.title ?? `Partida ${id}`),
    city: String(data.city ?? ""),
    location: String(data.location ?? ""),
    gameType: String(data.gameType ?? data.gameMode ?? "fut7"),
    level: String(data.level ?? "recreativo"),
    date: data.scheduledDate
      ? `${data.scheduledDate} ${String(data.scheduledTime ?? "")}`.trim()
      : String(data.createdAt ?? new Date().toISOString()),
    spotsRemaining: data.maxPlayers
      ? `${Math.max(0, Number(data.maxPlayers) - (Array.isArray(data.players) ? data.players.length : 0))} vagas`
      : "—",
    price: String(data.price ?? "—"),
    communityId: data.communityId ? String(data.communityId) : undefined,
    status: data.status ? String(data.status) : undefined,
  };
}

const LISTINGS_KEY = "joga-ai-match-listings-v1";

function readLocalMatchListings(): MatchListing[] {
  try {
    const raw = localStorage.getItem(LISTINGS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
