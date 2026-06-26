/**
 * communityRepository.ts — comunidades e listagens de partidas (Firestore)
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  collectionGroup,
} from "firebase/firestore";
import { db, isFirebaseConfigured } from "./firebase";

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
        isMember: memberIds.has(d.id),
        joinPending: pendingIds.has(d.id),
      } as Community & { joinPending?: boolean };
    });
  } catch (err) {
    console.warn("[communityRepository] loadCommunities:", err);
    return [];
  }
}

/** Comunidades onde o utilizador é membro */
export async function loadMyCommunities(userId: string): Promise<Community[]> {
  if (!isFirebaseConfigured() || !userId) return [];

  try {
    const memberSnap = await getDocs(
      query(collectionGroup(db, "members"), where("userId", "==", userId)),
    );

    const communities: Community[] = [];
    for (const memberDoc of memberSnap.docs) {
      const communityRef = memberDoc.ref.parent.parent;
      if (!communityRef) continue;
      const communitySnap = await getDoc(communityRef);
      if (!communitySnap.exists()) continue;
      const data = communitySnap.data();
      communities.push({
        id: communitySnap.id,
        name: data.name ?? "Comunidade",
        city: data.city ?? "",
        gameType: data.gameType ?? "fut7",
        isPrivate: Boolean(data.isPrivate),
        memberCount: Number(data.memberCount ?? 1),
        coverImage: data.coverImage,
        adminId: data.adminId,
        isMember: true,
      });
    }
    return communities;
  } catch (err) {
    console.warn("[communityRepository] loadMyCommunities:", err);
    return [];
  }
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
      isMember: memberIds.has(snap.id),
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

/** Partidas disponíveis (Firestore + cache local) */
export async function loadAvailableMatches(limitCount = 10): Promise<MatchListing[]> {
  const localCreated = readLocalMatchListings();

  if (!isFirebaseConfigured()) {
    return localCreated.slice(0, limitCount);
  }

  try {
    const q = query(
      collection(db, "matches"),
      where("status", "in", ["configurando", "ao_vivo", "aguardando_auditoria"]),
      orderBy("createdAt", "desc"),
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
    console.warn("[communityRepository] loadAvailableMatches:", err);
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
