/**
 * matchRepository.ts
 *
 * Camada de acesso a dados para `matches/{matchId}` no Firestore.
 * Quando Firebase não está configurado (projectId vazio) usa apenas localStorage.
 *
 * Padrão: escreve em Firestore + localStorage (cache local).
 * Lê: Firestore se disponível, caso contrário localStorage.
 */

import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  serverTimestamp,
  type DocumentData,
  type PartialWithFieldValue,
} from "firebase/firestore";
import { db, isFirebaseConfigured } from "./firebase";
import {
  savePostMatch,
  loadPostMatch,
  type SavedPostMatch,
} from "./postMatchStorage";

import type { LivePlayer } from "./preMatchStorage";
import { savePreMatch, type SavedPreMatch } from "./preMatchStorage";
import type { MatchListing } from "./communityRepository";

export type CreateMatchInput = {
  title: string;
  city: string;
  location: string;
  gameType: string;
  level: string;
  date: string;
  time: string;
  maxPlayers: number;
  price: string;
  openToExternal: boolean;
  notes: string;
  organizerId: string;
  organizerName: string;
  organizerPosition: string;
  organizerOverall: number;
};

const LISTINGS_KEY = "joga-ai-match-listings-v1";
const DETAILS_KEY = "joga-ai-match-details-v1";

export type MatchDetails = {
  id: string;
  title: string;
  city: string;
  location: string;
  gameType: string;
  level: string;
  date: string;
  scheduledDate?: string;
  scheduledTime?: string;
  spotsRemaining: string;
  price: string;
  maxPlayers?: number;
  notes?: string;
  openToExternal?: boolean;
  organizerName?: string;
  status?: string;
};

function readMatchDetailsMap(): Record<string, MatchDetails> {
  try {
    const raw = localStorage.getItem(DETAILS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeMatchDetailsMap(map: Record<string, MatchDetails>) {
  localStorage.setItem(DETAILS_KEY, JSON.stringify(map));
}

export function saveMatchDetails(details: MatchDetails) {
  const map = readMatchDetailsMap();
  map[details.id] = details;
  writeMatchDetailsMap(map);
}

export function loadMatchDetails(matchId: string): MatchDetails | null {
  const map = readMatchDetailsMap();
  if (map[matchId]) return map[matchId];

  const listing = readLocalListings().find((m) => m.id === matchId);
  return listing ? { ...listing, id: listing.id } : null;
}

function readLocalListings(): MatchListing[] {
  try {
    const raw = localStorage.getItem(LISTINGS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeLocalListings(list: MatchListing[]) {
  localStorage.setItem(LISTINGS_KEY, JSON.stringify(list));
}

function mapGameMode(gameType: string): "fut5" | "fut7" {
  return gameType === "fut5" || gameType === "futsal" ? "fut5" : "fut7";
}

function formatMatchDate(date: string, time: string): string {
  if (!date && !time) return "A definir";
  if (date && time) {
    try {
      const d = new Date(`${date}T${time}`);
      return d.toLocaleString("pt-PT", {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return `${date} ${time}`;
    }
  }
  return date || time;
}

function generateMatchId(): string {
  return `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Cria partida nova e devolve o id */
export async function createMatch(input: CreateMatchInput): Promise<string> {
  const matchId = generateMatchId();
  const gameMode = mapGameMode(input.gameType);
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const maxPlayers = Math.max(4, input.maxPlayers);
  const spotsLeft = Math.max(0, maxPlayers - 1);

  const organizer: LivePlayer = {
    id: input.organizerId,
    name: input.organizerName,
    position: input.organizerPosition,
    overall: input.organizerOverall,
    paid: true,
    isMe: true,
  };

  const saved: SavedPostMatch = {
    version: 1,
    matchId,
    status: "configurando",
    createdAt,
    expiresAt,
    savedAt: createdAt,
    gameMode,
    teamCount: 2,
    teamNames: { A: "Equipa A", B: "Equipa B", C: "Equipa C", D: "Equipa D" },
    players: [organizer],
    playerTeams: { [input.organizerId]: "BENCH" },
    currentPlayerId: input.organizerId,
    miniGames: [],
  };

  const preMatch: SavedPreMatch = {
    version: 1,
    gameMode,
    teamCount: 2,
    teamNames: saved.teamNames,
    players: [organizer],
    playerTeams: { [input.organizerId]: "BENCH" },
    assignments: {},
    savedAt: createdAt,
  };

  savePreMatch(preMatch);
  await saveMatchToFirestore(matchId, saved);

  const listing: MatchListing = {
    id: matchId,
    title: input.title.trim() || "Nova partida",
    city: input.city.trim() || "—",
    location: input.location.trim() || "—",
    gameType: input.gameType,
    level: input.level,
    date: formatMatchDate(input.date, input.time),
    spotsRemaining: spotsLeft > 0 ? `${spotsLeft} vagas` : "Lotado",
    price: input.price.trim() || "Grátis",
    status: "configurando",
  };

  const listings = [listing, ...readLocalListings().filter((m) => m.id !== matchId)];
  writeLocalListings(listings);

  saveMatchDetails({
    ...listing,
    id: matchId,
    scheduledDate: input.date,
    scheduledTime: input.time,
    maxPlayers,
    notes: input.notes,
    openToExternal: input.openToExternal,
    organizerName: input.organizerName,
  });

  if (isFirebaseConfigured()) {
    try {
      const ref = doc(db, "matches", matchId);
      await setDoc(ref, {
        ...saved,
        title: listing.title,
        city: listing.city,
        location: listing.location,
        level: input.level,
        gameType: input.gameType,
        maxPlayers,
        price: listing.price,
        openToExternal: input.openToExternal,
        notes: input.notes,
        organizerId: input.organizerId,
        scheduledDate: input.date,
        scheduledTime: input.time,
        savedAt: serverTimestamp(),
      });
    } catch (err) {
      console.warn("[matchRepository] createMatch firestore:", err);
    }
  }

  return matchId;
}

export function loadLocalMatchListings(): MatchListing[] {
  return readLocalListings();
}

export type MatchStatus =
  | "configurando"
  | "ao_vivo"
  | "aguardando_auditoria"
  | "auditada"
  | "concluida"
  | "expirada";

/** Salva ou actualiza o documento `matches/{matchId}` */
export async function saveMatchToFirestore(
  matchId: string,
  data: SavedPostMatch,
): Promise<void> {
  // Escreve em localStorage sempre (cache optimista)
  savePostMatch(data);

  if (!isFirebaseConfigured()) return;

  try {
    const ref = doc(db, "matches", matchId);
    const payload: PartialWithFieldValue<DocumentData> = {
      matchId,
      status: data.status,
      gameMode: data.gameMode,
      teamCount: data.teamCount,
      teamNames: data.teamNames,
      players: data.players,
      playerTeams: data.playerTeams,
      currentPlayerId: data.currentPlayerId,
      miniGames: data.miniGames,
      createdAt: data.createdAt,
      expiresAt: data.expiresAt,
      savedAt: serverTimestamp(),
    };
    await setDoc(ref, payload, { merge: true });
  } catch (err) {
    console.warn("[matchRepository] saveMatchToFirestore:", err);
  }
}

/** Actualiza apenas o campo `status` de um match */
export async function updateMatchStatus(
  matchId: string,
  status: MatchStatus,
): Promise<void> {
  // Actualiza cache local
  const local = loadPostMatch();
  if (local && local.matchId === matchId) {
    savePostMatch({ ...local, status: status as SavedPostMatch["status"] });
  }

  if (!isFirebaseConfigured()) return;

  try {
    const ref = doc(db, "matches", matchId);
    await updateDoc(ref, { status, savedAt: serverTimestamp() });
  } catch (err) {
    console.warn("[matchRepository] updateMatchStatus:", err);
  }
}

/**
 * Carrega o documento `matches/{matchId}` do Firestore.
 * Faz merge com localStorage (Firestore tem precedência).
 * Se Firestore não disponível, retorna localStorage.
 */
export async function loadMatchFromFirestore(
  matchId: string,
): Promise<SavedPostMatch | null> {
  const local = loadPostMatch();

  if (!isFirebaseConfigured()) return local;

  try {
    const ref = doc(db, "matches", matchId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return local;

    const remote = snap.data() as Omit<SavedPostMatch, "version">;
    const merged: SavedPostMatch = {
      version: 1,
      matchId: remote.matchId ?? matchId,
      status: remote.status ?? local?.status ?? "aguardando_auditoria",
      createdAt: remote.createdAt ?? local?.createdAt ?? new Date().toISOString(),
      expiresAt: remote.expiresAt ?? local?.expiresAt ?? new Date().toISOString(),
      savedAt: new Date().toISOString(),
      gameMode: remote.gameMode ?? local?.gameMode ?? "fut5",
      teamCount: remote.teamCount ?? local?.teamCount ?? 2,
      teamNames: remote.teamNames ?? local?.teamNames ?? { A: "Equipa A", B: "Equipa B", C: "Equipa C", D: "Equipa D" },
      players: remote.players ?? local?.players ?? [],
      playerTeams: remote.playerTeams ?? local?.playerTeams ?? {},
      currentPlayerId: remote.currentPlayerId ?? local?.currentPlayerId ?? "",
      miniGames: remote.miniGames ?? local?.miniGames ?? [],
    };

    // Actualiza cache local com dados do Firestore
    savePostMatch(merged);
    return merged;
  } catch (err) {
    console.warn("[matchRepository] loadMatchFromFirestore:", err);
    return local;
  }
}

/**
 * Verifica se o match está expirado pelo campo `expiresAt`.
 * Funciona com dados locais; não precisa de Firestore.
 */
export function isMatchExpired(data: SavedPostMatch | null): boolean {
  if (!data?.expiresAt) return false;
  return Date.now() > new Date(data.expiresAt).getTime();
}
