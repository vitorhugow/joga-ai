/**
 * communityRepository.ts
 *
 * Camada Firestore para comunidades e lista de partidas.
 * Coleções: communities/{communityId}  e  matches (query por communityId)
 *
 * Fallback: mockData quando Firebase não está configurado.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
} from "firebase/firestore";
import { db, isFirebaseConfigured } from "./firebase";
import { mockData } from "@/data/mockData";

export type Community = {
  id: string;
  name: string;
  city: string;
  gameType: "fut7" | "futsal" | "futebol11";
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

/** Carrega lista de comunidades (Firestore → mockData) */
export async function loadCommunities(): Promise<Community[]> {
  if (!isFirebaseConfigured()) {
    return mockData.communities as Community[];
  }

  try {
    const snap = await getDocs(collection(db, "communities"));
    if (snap.empty) return mockData.communities as Community[];

    return snap.docs.map((d) => ({
      id: d.id,
      isMember: false,
      ...d.data(),
    })) as Community[];
  } catch (err) {
    console.warn("[communityRepository] loadCommunities:", err);
    return mockData.communities as Community[];
  }
}

/** Carrega uma comunidade pelo id */
export async function loadCommunity(id: string): Promise<Community | null> {
  if (!isFirebaseConfigured()) {
    return (mockData.communities.find((c) => c.id === id) as Community) ?? null;
  }

  try {
    const snap = await getDoc(doc(db, "communities", id));
    if (!snap.exists()) {
      return (mockData.communities.find((c) => c.id === id) as Community) ?? null;
    }
    return { id: snap.id, isMember: false, ...snap.data() } as Community;
  } catch (err) {
    console.warn("[communityRepository] loadCommunity:", err);
    return (mockData.communities.find((c) => c.id === id) as Community) ?? null;
  }
}

/** Carrega partidas disponíveis (não concluídas/expiradas) */
export async function loadAvailableMatches(limitCount = 10): Promise<MatchListing[]> {
  const localCreated = readLocalMatchListings();

  if (!isFirebaseConfigured()) {
    const mock = mockData.availableMatches as MatchListing[];
    const merged = [...localCreated, ...mock.filter((m) => !localCreated.some((l) => l.id === m.id))];
    return merged.slice(0, limitCount);
  }

  try {
    const q = query(
      collection(db, "matches"),
      where("status", "in", ["configurando", "ao_vivo", "aguardando_auditoria"]),
      orderBy("createdAt", "desc"),
      limit(limitCount),
    );
    const snap = await getDocs(q);

    const remote = snap.docs.map((d) => ({
      id: d.id,
      title: d.data().title ?? `Partida ${d.id}`,
      city: d.data().city ?? "",
      location: d.data().location ?? "",
      gameType: d.data().gameType ?? d.data().gameMode ?? "fut7",
      level: d.data().level ?? "recreativo",
      date: d.data().scheduledDate
        ? `${d.data().scheduledDate} ${d.data().scheduledTime ?? ""}`.trim()
        : d.data().createdAt ?? new Date().toISOString(),
      spotsRemaining: d.data().maxPlayers
        ? `${Math.max(0, Number(d.data().maxPlayers) - (d.data().players?.length ?? 0))} vagas`
        : "—",
      price: d.data().price ?? "—",
      communityId: d.data().communityId,
      status: d.data().status,
    }));

    if (remote.length === 0 && localCreated.length === 0) {
      return mockData.availableMatches as MatchListing[];
    }

    const merged = [...localCreated, ...remote.filter((m) => !localCreated.some((l) => l.id === m.id))];
    return merged.slice(0, limitCount);
  } catch (err) {
    console.warn("[communityRepository] loadAvailableMatches:", err);
    const mock = mockData.availableMatches as MatchListing[];
    return [...localCreated, ...mock].slice(0, limitCount);
  }
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
