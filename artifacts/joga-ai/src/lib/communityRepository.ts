/**
 * communityRepository.ts — comunidades e listagens de partidas (Firestore)
 */

import {
  collection,
  doc,
  documentId,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  collectionGroup,
  writeBatch,
  increment,
} from "firebase/firestore";
import { db, isFirebaseConfigured } from "./firebase";
import { OPEN_MATCH_STATUSES, COMMUNITY_ACTIVE_MATCH_STATUSES, loadLocalMatchListings, loadMatchDetails } from "./matchRepository";
import { MAX_PROFILE_PHOTO_BYTES } from "./userRepository";
import { loadAllPostMatches } from "./postMatchStorage";

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

/**
 * Confirma para cada comunidade se o utilizador é membro, com um pedido
 * directo por comunidade (communities/{id}/members/{userId}). Mais lento que
 * uma única collection-group query, mas muito mais fiável: a regra da
 * collection-group (`{path=**}/members/{memberId}`) exige que o Firestore
 * consiga provar estaticamente a condição da regra a partir dos filtros da
 * query, o que falha sempre que a regra tem mais do que uma cláusula — como
 * é o caso aqui — deixando "Minhas" vazio para membros não-admin.
 */
async function loadMembershipFlags(
  communityIds: string[],
  userId: string,
): Promise<Set<string>> {
  const ids = new Set<string>();
  await Promise.all(
    communityIds.map(async (communityId) => {
      if (await isCommunityMember(communityId, userId)) ids.add(communityId);
    }),
  );
  return ids;
}

/** Carrega todas as comunidades */
export async function loadCommunities(userId?: string): Promise<Community[]> {
  if (!isFirebaseConfigured()) return [];

  try {
    const snap = await getDocs(collection(db, "communities"));
    if (snap.empty) return [];

    const memberIds = userId
      ? await loadMembershipFlags(snap.docs.map((d) => d.id), userId)
      : new Set<string>();
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

  // Caminho fiável: lê todas as comunidades e confirma a membership com um
  // pedido directo por comunidade (ver loadMembershipFlags). Cobre também o
  // caso de o utilizador ser admin sem doc em members/.
  try {
    const allSnap = await getDocs(collection(db, "communities"));
    const communityIds = allSnap.docs.map((d) => d.id);
    const memberIds = await loadMembershipFlags(communityIds, userId);

    for (const communityDoc of allSnap.docs) {
      const data = communityDoc.data();
      const isAdmin = data.adminId === userId;
      if (memberIds.has(communityDoc.id) || isAdmin) {
        byId.set(communityDoc.id, mapCommunityDoc(communityDoc.id, data));
      }
    }
  } catch (err) {
    console.warn("[communityRepository] loadMyCommunities direct:", err);
  }

  // Rede de segurança adicional via collection-group query — nem sempre
  // funciona (ver nota em loadMembershipFlags), mas quando funciona pode
  // apanhar comunidades que a leitura directa acima tenha falhado por algum
  // erro pontual.
  try {
    const memberSnap = await getDocs(
      query(collectionGroup(db, "members"), where("userId", "==", userId)),
    );

    for (const memberDoc of memberSnap.docs) {
      const communityRef = memberDoc.ref.parent.parent;
      if (!communityRef || byId.has(communityRef.id)) continue;
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
  const ids = new Set<string>();
  if (!isFirebaseConfigured() || !userId) return ids;

  try {
    const snap = await getDocs(
      query(collectionGroup(db, "members"), where("userId", "==", userId)),
    );
    for (const d of snap.docs) {
      const ref = d.ref.parent.parent;
      if (ref) ids.add(ref.id);
    }
  } catch (err) {
    console.warn("[communityRepository] loadMemberCommunityIds collectionGroup:", err);
  }

  return ids;
}

/** Verifica membro via documento directo (mais fiável que só collection group). */
export async function isCommunityMember(
  communityId: string,
  userId: string,
): Promise<boolean> {
  if (!isFirebaseConfigured() || !userId || !communityId) return false;
  try {
    const snap = await getDoc(doc(db, "communities", communityId, "members", userId));
    return snap.exists();
  } catch {
    return false;
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
    const isMemberDirect = userId ? await isCommunityMember(snap.id, userId) : false;

    return {
      id: snap.id,
      name: data.name ?? "Comunidade",
      city: data.city ?? "",
      gameType: data.gameType ?? "fut7",
      isPrivate: Boolean(data.isPrivate),
      memberCount: Number(data.memberCount ?? 1),
      coverImage: data.coverImage,
      adminId: data.adminId,
      isMember:
        isMemberDirect ||
        memberIds.has(snap.id) ||
        (userId ? data.adminId === userId : false),
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

/**
 * Nota importante: quando o Firebase está configurado, a query remota é
 * SEMPRE a única fonte de verdade sobre quais partidas continuam "activas"
 * (o filtro `where("status","in",...)` já exclui concluídas/expiradas/
 * canceladas no servidor). NÃO fazer merge com `joga-ai-match-listings-v1`
 * (cache local por dispositivo) para decidir o que está activo: essa cópia
 * só é actualizada no aparelho de quem executa a acção, por isso noutros
 * dispositivos fica presa num status antigo (ex: "ao_vivo"/"auditada"). Ao
 * "salvar" partidas que o servidor já excluiu, a partida "ressuscitava" como
 * aberta mesmo depois de terminada/votada por todos.
 */

/** Partidas públicas (Firestore) — exclui peladas de comunidade */
export async function loadAvailableMatches(limitCount = 10): Promise<MatchListing[]> {
  if (!isFirebaseConfigured()) {
    return readLocalMatchListings().filter(isOpenPublicMatch).slice(0, limitCount);
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

    return remote.slice(0, limitCount);
  } catch (err) {
    console.warn("[communityRepository] loadAvailableMatches:", err);
    return readLocalMatchListings().filter(isOpenPublicMatch).slice(0, limitCount);
  }
}

const MY_MATCHES_ACTIVE_STATUSES = [
  "configurando",
  "ao_vivo",
  "aguardando_auditoria",
  "auditada",
] as const;

function isMatchPlayer(data: Record<string, unknown>, userId: string): boolean {
  if (data.organizerId === userId) return true;
  const players = Array.isArray(data.players) ? (data.players as Record<string, unknown>[]) : [];
  return players.some((p) => p.userId === userId || p.id === userId);
}

/**
 * Partidas onde o utilizador é organizador ou já confirmou presença — usada
 * na aba "Minhas" de Jogos para acompanhar Ao Vivo/votação depois da
 * partida sair da descoberta pública (ver OPEN_MATCH_STATUSES).
 * Junta partidas organizadas por mim (query directa) com as que este
 * aparelho já visitou localmente (postMatchStorage), e confirma o estado
 * mais recente de cada uma no Firestore.
 */
export async function loadMyMatches(userId: string): Promise<MatchListing[]> {
  if (!userId) return [];

  if (!isFirebaseConfigured()) {
    return loadAllPostMatches()
      .filter(
        (m) =>
          MY_MATCHES_ACTIVE_STATUSES.includes(m.status as (typeof MY_MATCHES_ACTIVE_STATUSES)[number]) &&
          isMatchPlayer(m as unknown as Record<string, unknown>, userId),
      )
      .map((m) => mapMatchDoc(m.matchId, m as unknown as Record<string, unknown>))
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  const candidateIds = new Set<string>();

  try {
    const organizerSnap = await getDocs(
      query(
        collection(db, "matches"),
        where("organizerId", "==", userId),
        where("status", "in", [...MY_MATCHES_ACTIVE_STATUSES]),
        limit(30),
      ),
    );
    organizerSnap.docs.forEach((d) => candidateIds.add(d.id));
  } catch (err) {
    console.warn("[communityRepository] loadMyMatches (organizer):", err);
  }

  for (const m of loadAllPostMatches()) candidateIds.add(m.matchId);

  for (const listing of loadLocalMatchListings()) {
    candidateIds.add(listing.id);
    const details = loadMatchDetails(listing.id);
    if (details?.organizerId === userId) candidateIds.add(listing.id);
  }

  const ids = [...candidateIds];
  const docsById = new Map<string, Record<string, unknown>>();

  for (let i = 0; i < ids.length; i += 30) {
    const chunk = ids.slice(i, i + 30);
    if (!chunk.length) continue;
    try {
      const snap = await getDocs(
        query(collection(db, "matches"), where(documentId(), "in", chunk)),
      );
      snap.docs.forEach((d) => docsById.set(d.id, d.data()));
    } catch (err) {
      console.warn("[communityRepository] loadMyMatches (batch):", err);
    }
  }

  const results: MatchListing[] = [];
  docsById.forEach((data, id) => {
    const status = String(data.status ?? "configurando");
    if (!MY_MATCHES_ACTIVE_STATUSES.includes(status as (typeof MY_MATCHES_ACTIVE_STATUSES)[number])) return;
    if (!isMatchPlayer(data, userId)) return;
    results.push(mapMatchDoc(id, data));
  });

  for (const id of candidateIds) {
    if (results.some((r) => r.id === id)) continue;
    const local =
      loadAllPostMatches().find((m) => m.matchId === id) ??
      (() => {
        const details = loadMatchDetails(id);
        if (!details) return null;
        return {
          matchId: id,
          status: details.status ?? "configurando",
          organizerId: details.organizerId,
          players: [],
          title: details.title,
          city: details.city,
          location: details.location,
          gameType: details.gameType,
          level: details.level,
          scheduledDate: details.scheduledDate,
          scheduledTime: details.scheduledTime,
          price: details.price,
          communityId: details.communityId,
        } as Record<string, unknown>;
      })();
    if (!local) continue;
    const status = String((local as Record<string, unknown>).status ?? "configurando");
    if (!MY_MATCHES_ACTIVE_STATUSES.includes(status as (typeof MY_MATCHES_ACTIVE_STATUSES)[number])) continue;
    if (!isMatchPlayer(local as Record<string, unknown>, userId)) continue;
    results.push(mapMatchDoc(id, local as Record<string, unknown>));
  }

  results.sort((a, b) => b.date.localeCompare(a.date));
  return results;
}

/** Partidas abertas de uma comunidade */
export async function loadCommunityMatches(
  communityId: string,
  limitCount = 20,
): Promise<MatchListing[]> {
  if (!isFirebaseConfigured()) {
    return readLocalMatchListings()
      .filter(
        (m) =>
          m.communityId === communityId &&
          (!m.status ||
            COMMUNITY_ACTIVE_MATCH_STATUSES.includes(
              m.status as (typeof COMMUNITY_ACTIVE_MATCH_STATUSES)[number],
            )),
      )
      .slice(0, limitCount);
  }

  try {
    const q = query(
      collection(db, "matches"),
      where("communityId", "==", communityId),
      where("status", "in", [...COMMUNITY_ACTIVE_MATCH_STATUSES]),
      orderBy("savedAt", "desc"),
      limit(limitCount),
    );
    const snap = await getDocs(q);

    return snap.docs.map((d) => mapMatchDoc(d.id, d.data())).slice(0, limitCount);
  } catch (err) {
    console.warn("[communityRepository] loadCommunityMatches:", err);
    return readLocalMatchListings()
      .filter(
        (m) =>
          m.communityId === communityId &&
          (!m.status ||
            COMMUNITY_ACTIVE_MATCH_STATUSES.includes(
              m.status as (typeof COMMUNITY_ACTIVE_MATCH_STATUSES)[number],
            )),
      )
      .slice(0, limitCount);
  }
}

/** Listener em tempo real das partidas activas de uma comunidade. */
export function subscribeCommunityMatches(
  communityId: string,
  callback: (matches: MatchListing[]) => void,
  limitCount = 20,
): () => void {
  if (!isFirebaseConfigured()) {
    void loadCommunityMatches(communityId, limitCount).then(callback);
    return () => {};
  }

  const q = query(
    collection(db, "matches"),
    where("communityId", "==", communityId),
    where("status", "in", [...COMMUNITY_ACTIVE_MATCH_STATUSES]),
    orderBy("savedAt", "desc"),
    limit(limitCount),
  );

  return onSnapshot(
    q,
    (snap) => {
      const remote = snap.docs.map((d) => mapMatchDoc(d.id, d.data()));
      callback(remote.slice(0, limitCount));
    },
    (err) => {
      console.warn("[communityRepository] subscribeCommunityMatches:", err);
      void loadCommunityMatches(communityId, limitCount).then(callback);
    },
  );
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
