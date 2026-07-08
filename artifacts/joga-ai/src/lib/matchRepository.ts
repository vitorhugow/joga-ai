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
  deleteDoc,
  getDocs,
  collection,
  onSnapshot,
  serverTimestamp,
  arrayUnion,
  type DocumentData,
  type PartialWithFieldValue,
} from "firebase/firestore";
import { db, isFirebaseConfigured } from "./firebase";
import {
  savePostMatch,
  loadPostMatch,
  clearPostMatch,
  type SavedPostMatch,
} from "./postMatchStorage";
import { clearPreMatch } from "./preMatchStorage";

import type { LivePlayer, LiveTeamKey } from "./preMatchStorage";
import { savePreMatch, loadPreMatch, type SavedPreMatch } from "./preMatchStorage";
import type { MatchListing } from "./communityRepository";
import { applyParticipationForMatchRoster, revertMatchStatsForPlayers } from "./userRepository";
import { deleteMatchResult, loadMatchResult } from "./matchHistoryRepository";
import { getVotes } from "./auditRepository";
import { collectAllEvents, computeTopScorers, collectLinkedPlayerUserIds } from "./evolutionUtils";
import { notifyMatchPlayersToVote } from "./notificationsRepository";
import type { WaitlistEntry } from "./matchRsvpRepository";
import { checkAndUnlockBadges } from "./badgeService";

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
  paymentsEnabled?: boolean;
  proBadge?: boolean;
  openToExternal: boolean;
  notes: string;
  organizerId: string;
  organizerName: string;
  organizerPosition: string;
  organizerOverall: number;
  communityId?: string;
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
  paymentsEnabled?: boolean;
  proBadge?: boolean;
  maxPlayers?: number;
  notes?: string;
  openToExternal?: boolean;
  organizerName?: string;
  organizerId?: string;
  communityId?: string;
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

/** Mantém o status da listagem local alinhado com o documento da partida. */
function syncLocalMatchListingStatus(matchId: string, status: MatchStatus) {
  const listings = readLocalListings();
  const idx = listings.findIndex((m) => m.id === matchId);
  if (idx === -1) return;
  listings[idx] = { ...listings[idx], status };
  writeLocalListings(listings);
}

/** Transição explícita para ao vivo (só a partir de pré-jogo). */
export async function startMatchLive(
  matchId: string,
  organizerId: string,
): Promise<void> {
  const existing =
    loadPostMatch(matchId) ?? (await loadMatchFromFirestore(matchId));
  if (!existing) return;

  const now = new Date().toISOString();
  await saveMatchToFirestoreOrThrow(matchId, {
    ...existing,
    status: "ao_vivo",
    organizerId: organizerId || existing.organizerId,
    savedAt: now,
  });
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
    userId: input.organizerId,
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
    title: input.title.trim() || "Nova partida",
    communityId: input.communityId,
    organizerId: input.organizerId,
    paymentsEnabled: input.paymentsEnabled ?? false,
    proBadge: input.proBadge ?? false,
    openToExternal: input.openToExternal,
    maxPlayers,
  };

  const preMatch: SavedPreMatch = {
    version: 1,
    matchId,
    gameMode,
    teamCount: 2,
    teamNames: saved.teamNames,
    players: [organizer],
    playerTeams: { [input.organizerId]: "BENCH" },
    assignments: {},
    savedAt: createdAt,
  };

  savePreMatch(preMatch, matchId);
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
    paymentsEnabled: input.paymentsEnabled ?? false,
    proBadge: input.proBadge ?? false,
    communityId: input.communityId,
    openToExternal: input.openToExternal,
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
    organizerId: input.organizerId,
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
        paymentsEnabled: input.paymentsEnabled ?? false,
        proBadge: input.proBadge ?? false,
        openToExternal: input.openToExternal,
        notes: input.notes,
        organizerId: input.organizerId,
        communityId: input.communityId ?? null,
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
  | "expirada"
  | "cancelada";

// Só "configurando" aparece na descoberta pública de Jogos — assim que a
// partida vai para "ao_vivo" já não pode ser encontrada por gente nova,
// só quem já entrou (ver loadMyMatches, aba "Minhas" em Jogos).
export const OPEN_MATCH_STATUSES: MatchStatus[] = ["configurando"];

export const COMMUNITY_ACTIVE_MATCH_STATUSES: MatchStatus[] = [
  "configurando",
  "ao_vivo",
  "aguardando_auditoria",
  "auditada",
];

export const CLOSED_MATCH_STATUSES: MatchStatus[] = [
  "aguardando_auditoria",
  "auditada",
  "concluida",
  "expirada",
  "cancelada",
];

/** Statuses that remove a match from public/community listings */
export const LISTING_REMOVED_STATUSES: MatchStatus[] = [
  "concluida",
  "expirada",
  "cancelada",
];

function isListingRemovedStatus(status?: string): boolean {
  return LISTING_REMOVED_STATUSES.includes(status as MatchStatus);
}

export function getMatchRoutePath(matchId: string, status?: string): string {
  switch (status) {
    case "ao_vivo":
      return `/partida/${matchId}/ao-vivo`;
    case "aguardando_auditoria":
    case "auditada":
    case "concluida":
      return `/partida/${matchId}/pos-jogo`;
    default:
      return `/partida/${matchId}/pre-jogo`;
  }
}

export function getMatchStatusLabel(status?: string): string {
  switch (status) {
    case "configurando":
      return "Pré-jogo";
    case "ao_vivo":
      return "Ao vivo";
    case "aguardando_auditoria":
    case "auditada":
      return "Votação";
    case "concluida":
      return "Concluída";
    case "expirada":
      return "Expirada";
    case "cancelada":
      return "Cancelada";
    default:
      return "Pré-jogo";
  }
}

/** Destino do botão voltar: `from` na query ou home. */
export function getMatchReturnPath(search?: string): string {
  const from = new URLSearchParams(search ?? window.location.search).get("from");
  return from || "/";
}

/** Escuta alterações de status da partida em tempo real (Firestore + cache local). */
export function subscribeMatchStatus(
  matchId: string,
  callback: (status: MatchStatus) => void,
): () => void {
  if (!matchId || matchId === "default") return () => {};

  const emitLocal = () => {
    const local = loadPostMatch(matchId);
    callback((local?.status ?? "configurando") as MatchStatus);
  };

  if (!isFirebaseConfigured()) {
    emitLocal();
    const onStorage = (event: StorageEvent) => {
      if (event.key?.includes(matchId)) emitLocal();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }

  const ref = doc(db, "matches", matchId);
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        emitLocal();
        return;
      }
      const remoteStatus = snap.data().status as MatchStatus | undefined;
      const local = loadPostMatch(matchId);
      if (local && remoteStatus) {
        savePostMatch({ ...local, status: remoteStatus });
      }
      callback(remoteStatus ?? (local?.status as MatchStatus) ?? "configurando");
    },
    (err) => {
      console.warn("[matchRepository] subscribeMatchStatus:", err);
      emitLocal();
    },
  );
}

/** Cancela partida (organizador) — só em configurando ou ao_vivo */
export async function cancelMatch(matchId: string): Promise<void> {
  const local = loadPostMatch(matchId);
  const status = local?.status ?? "configurando";
  if (status !== "configurando" && status !== "ao_vivo") {
    throw new Error("Só podes cancelar partidas em preparação ou ao vivo.");
  }
  await updateMatchStatus(matchId, "cancelada");
}

/** Remove partida da lista pública em Jogos (localStorage). */
export function removeMatchFromListings(matchId: string): void {
  const list = readLocalListings().filter((m) => m.id !== matchId);
  writeLocalListings(list);

  const details = readMatchDetailsMap();
  if (details[matchId]) {
    delete details[matchId];
    writeMatchDetailsMap(details);
  }
}

export class MatchDeleteForbiddenError extends Error {
  constructor(message = "Apenas o organizador pode excluir esta partida.") {
    super(message);
    this.name = "MatchDeleteForbiddenError";
  }
}

async function deleteFirestoreSubcollection(
  matchId: string,
  subcollection: string,
): Promise<void> {
  if (!isFirebaseConfigured()) return;
  const snap = await getDocs(collection(db, "matches", matchId, subcollection));
  await Promise.all(snap.docs.map((entry) => deleteDoc(entry.ref)));
}

/**
 * Exclui uma partida e reverte todos os ganhos de carta/estatísticas
 * para todos os jogadores ligados. Apenas o organizador pode executar.
 */
export async function deleteMatch(matchId: string, requesterId: string): Promise<void> {
  const match = (await loadMatchFromFirestore(matchId)) ?? loadPostMatch(matchId);
  if (!match) return;

  if (!match.organizerId || match.organizerId !== requesterId) {
    throw new MatchDeleteForbiddenError();
  }

  const matchResult = await loadMatchResult(matchId);
  const events = collectAllEvents(match.miniGames ?? []);
  const topScorers = matchResult?.topScorers ?? computeTopScorers(events);
  const votes = await getVotes(matchId);
  const votedUserIds = [
    ...new Set([
      ...(match.votedUserIds ?? []),
      ...votes.map((vote) => vote.userId),
    ]),
  ];

  await revertMatchStatsForPlayers({
    matchId,
    organizerId: match.organizerId,
    players: match.players ?? [],
    events,
    topScorers,
    votedUserIds,
    matchResult,
  });

  clearPostMatch(matchId);
  clearPreMatch(matchId);
  removeMatchFromListings(matchId);

  if (!isFirebaseConfigured()) return;

  try {
    await deleteMatchResult(matchId);
    await deleteFirestoreSubcollection(matchId, "auditors");
    await deleteFirestoreSubcollection(matchId, "votes");
    await deleteDoc(doc(db, "matches", matchId));
  } catch (err) {
    console.warn("[matchRepository] deleteMatch firestore:", err);
    throw err;
  }
}

export type MatchRosterData = {
  gameMode: "fut5" | "fut7";
  teamCount: 2 | 3 | 4;
  teamNames: Record<"A" | "B" | "C" | "D", string>;
  players: LivePlayer[];
  playerTeams: Record<string, LiveTeamKey>;
  assignments: Record<string, string | null>;
  waitlist?: WaitlistEntry[];
};

/** Persiste o plantel da partida (local + Firestore) */
export async function saveMatchRoster(
  matchId: string,
  roster: MatchRosterData,
): Promise<void> {
  const now = new Date().toISOString();

  const preMatch: SavedPreMatch = {
    version: 1,
    matchId,
    gameMode: roster.gameMode,
    teamCount: roster.teamCount,
    teamNames: roster.teamNames,
    players: roster.players,
    playerTeams: roster.playerTeams,
    assignments: roster.assignments,
    savedAt: now,
  };
  savePreMatch(preMatch, matchId);

  const existing = loadPostMatch(matchId) ?? (await loadMatchFromFirestore(matchId));
  const currentPlayerId =
    existing?.currentPlayerId ??
    roster.players.find((player) => player.isMe)?.id ??
    roster.players[0]?.id ??
    "";

  const updated: SavedPostMatch = {
    version: 1,
    matchId,
    status: existing?.status ?? "configurando",
    createdAt: existing?.createdAt ?? now,
    expiresAt: existing?.expiresAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    savedAt: now,
    gameMode: roster.gameMode,
    teamCount: roster.teamCount,
    teamNames: roster.teamNames,
    players: roster.players,
    playerTeams: roster.playerTeams,
    assignments: roster.assignments,
    currentPlayerId,
    miniGames: existing?.miniGames ?? [],
    votedUserIds: existing?.votedUserIds,
    waitlist: roster.waitlist ?? existing?.waitlist ?? [],
    title: existing?.title,
    communityId: existing?.communityId,
    organizerId: existing?.organizerId,
  };

  await saveMatchToFirestore(matchId, updated);
}

/**
 * O SDK do Firestore usado aqui (getFirestore, sem ignoreUndefinedProperties)
 * rejeita QUALQUER campo com valor `undefined` — o setDoc lança logo no
 * cliente, antes de sequer contactar o servidor. Como vários matches não têm
 * `title`/`communityId` definidos, isto podia bloquear silenciosamente
 * transições críticas (ex: terminar a pelada), fazendo parecer que a partida
 * "fica presa" no Ao Vivo. Por isso todos os campos opcionais têm fallback
 * explícito para `null` em vez de deixar passar `undefined`.
 */
function buildMatchDocPayload(data: SavedPostMatch): PartialWithFieldValue<DocumentData> {
  return {
    matchId: data.matchId,
    status: data.status,
    gameMode: data.gameMode,
    teamCount: data.teamCount,
    teamNames: data.teamNames,
    players: data.players,
    participantUserIds: Array.from(
      new Set(
        (data.players ?? [])
          .map((p) => p.userId)
          .filter((id): id is string => Boolean(id)),
      ),
    ),
    playerTeams: data.playerTeams,
    assignments: data.assignments ?? {},
    currentPlayerId: data.currentPlayerId ?? "",
    miniGames: data.miniGames ?? [],
    createdAt: data.createdAt,
    expiresAt: data.expiresAt,
    votedUserIds: data.votedUserIds ?? [],
    waitlist: data.waitlist ?? [],
    paymentsEnabled: data.paymentsEnabled ?? false,
    proBadge: data.proBadge ?? false,
    openToExternal: data.openToExternal ?? null,
    title: data.title ?? null,
    communityId: data.communityId ?? null,
    organizerId: data.organizerId ?? null,
    savedAt: serverTimestamp(),
  };
}

/** Aplica cache local + efeitos colaterais (participação, notificações, badges). */
function applyLocalMatchUpdate(matchId: string, data: SavedPostMatch) {
  const prev = loadPostMatch(matchId);
  const enteringPostMatch =
    data.status === "aguardando_auditoria" &&
    prev?.status !== "aguardando_auditoria";

  savePostMatch(data);
  syncLocalMatchListingStatus(matchId, data.status as MatchStatus);

  if (enteringPostMatch && data.players?.length) {
    void applyParticipationForMatchRoster({
      matchId,
      title: data.title,
      communityId: data.communityId,
      organizerId: data.organizerId,
      players: data.players,
    })
      .then(() => {
        const userIds = collectLinkedPlayerUserIds(data.players ?? [], data.organizerId);
        return Promise.all([
          notifyMatchPlayersToVote(matchId, data.players ?? [], data.title ?? "Pelada", data.organizerId),
          ...userIds.map((uid) => checkAndUnlockBadges(uid)),
        ]);
      })
      .catch((err) => console.warn("[matchRepository] participation:", err));
  }
}

/** Salva ou actualiza o documento `matches/{matchId}` (melhor esforço, não propaga erros). */
export async function saveMatchToFirestore(
  matchId: string,
  data: SavedPostMatch,
): Promise<void> {
  applyLocalMatchUpdate(matchId, data);

  if (!isFirebaseConfigured()) return;

  try {
    const ref = doc(db, "matches", matchId);
    await setDoc(ref, buildMatchDocPayload(data), { merge: true });
    if (isListingRemovedStatus(data.status)) {
      removeMatchFromListings(matchId);
    }
  } catch (err) {
    console.warn("[matchRepository] saveMatchToFirestore:", err);
  }
}

/**
 * Igual a `saveMatchToFirestore`, mas propaga erros do Firestore (ex: permissão
 * negada). Usa-se em transições críticas de estado (iniciar/terminar ao vivo)
 * onde a UI precisa de saber se a escrita realmente foi aceite antes de navegar.
 */
export async function saveMatchToFirestoreOrThrow(
  matchId: string,
  data: SavedPostMatch,
): Promise<void> {
  applyLocalMatchUpdate(matchId, data);

  if (!isFirebaseConfigured()) return;

  const ref = doc(db, "matches", matchId);
  await setDoc(ref, buildMatchDocPayload(data), { merge: true });
  if (isListingRemovedStatus(data.status)) {
    removeMatchFromListings(matchId);
  }
}

/**
 * Marca um utilizador como tendo votado, de forma atómica (arrayUnion).
 * Evita a corrida em que dois votos em simultâneo se sobrepõem e "perdem"
 * um dos votantes no array `votedUserIds` do documento principal.
 */
export async function markUserVoted(matchId: string, userId: string): Promise<void> {
  const local = loadPostMatch(matchId);
  if (local && local.matchId === matchId) {
    const nextIds = [...new Set([...(local.votedUserIds ?? []), userId])];
    savePostMatch({ ...local, votedUserIds: nextIds });
  }

  if (!isFirebaseConfigured()) return;

  try {
    const ref = doc(db, "matches", matchId);
    await updateDoc(ref, {
      votedUserIds: arrayUnion(userId),
      savedAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn("[matchRepository] markUserVoted:", err);
  }
}

/**
 * Actualiza apenas o campo `status` de um match.
 *
 * IMPORTANTE: propaga erros do Firestore (ex: permissão negada) em vez de os
 * engolir — quem chama isto (ex: finalização da votação) precisa de saber
 * quando a escrita remota falhou, para não marcar localmente a pelada como
 * "concluida"/finalizada quando na verdade o Firestore ainda tem o status
 * antigo (o que a deixava presa em "aguardando_auditoria"/"auditada" para
 * todos os outros jogadores e na comunidade).
 */
export async function updateMatchStatus(
  matchId: string,
  status: MatchStatus,
): Promise<void> {
  // Actualiza cache local optimisticamente (não crítico se a escrita remota
  // falhar depois — o próximo hidratar a partir do Firestore corrige isto).
  const local = loadPostMatch(matchId);
  if (local && local.matchId === matchId) {
    savePostMatch({ ...local, status: status as SavedPostMatch["status"] });
  }
  syncLocalMatchListingStatus(matchId, status);

  if (!isFirebaseConfigured()) {
    if (isListingRemovedStatus(status)) {
      removeMatchFromListings(matchId);
    }
    return;
  }

  const ref = doc(db, "matches", matchId);
  await updateDoc(ref, { status, savedAt: serverTimestamp() });
  if (isListingRemovedStatus(status)) {
    removeMatchFromListings(matchId);
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
  const local = loadPostMatch(matchId);
  const pre = loadPreMatch(matchId);

  if (!isFirebaseConfigured()) {
    return mergeMatchSources(matchId, null, local, pre);
  }

  try {
    const ref = doc(db, "matches", matchId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      return mergeMatchSources(matchId, null, local, pre);
    }

    const remote = snap.data() as Omit<SavedPostMatch, "version">;
    const remoteMatch: SavedPostMatch = {
      version: 1,
      matchId: remote.matchId ?? matchId,
      status: remote.status ?? "configurando",
      createdAt: remote.createdAt ?? new Date().toISOString(),
      expiresAt: remote.expiresAt ?? new Date().toISOString(),
      savedAt: remote.savedAt ?? new Date().toISOString(),
      gameMode: remote.gameMode ?? "fut5",
      teamCount: remote.teamCount ?? 2,
      teamNames: remote.teamNames ?? { A: "Equipa A", B: "Equipa B", C: "Equipa C", D: "Equipa D" },
      players: remote.players ?? [],
      playerTeams: remote.playerTeams ?? {},
      assignments: remote.assignments ?? {},
      currentPlayerId: remote.currentPlayerId ?? "",
      miniGames: remote.miniGames ?? [],
      votedUserIds: remote.votedUserIds,
      waitlist: remote.waitlist ?? [],
      title: remote.title,
      communityId: remote.communityId,
      organizerId: remote.organizerId,
      paymentsEnabled: remote.paymentsEnabled ?? false,
      proBadge: remote.proBadge ?? false,
    };

    const merged = mergeMatchSources(matchId, remoteMatch, local, pre);
    if (merged) savePostMatch(merged);
    return merged;
  } catch (err) {
    console.warn("[matchRepository] loadMatchFromFirestore:", err);
    return mergeMatchSources(matchId, null, local, pre);
  }
}

function parseSavedAt(value?: string) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function miniGameRichness(miniGames: SavedPostMatch["miniGames"] = []) {
  if (!miniGames.length) return 0;
  return miniGames.reduce(
    (sum, game) => sum + (game.events?.length ?? 0) + 1,
    0,
  );
}

function mergeMatchSources(
  matchId: string,
  remote: SavedPostMatch | null,
  local: SavedPostMatch | null,
  pre: SavedPreMatch | null,
): SavedPostMatch | null {
  const remoteValid = remote?.matchId === matchId ? remote : null;
  const localValid = local?.matchId === matchId ? local : null;
  const preValid = pre && (!pre.matchId || pre.matchId === matchId) ? pre : null;

  if (!remoteValid && !localValid && !preValid) return null;

  const rosterCandidates = [
    {
      players: remoteValid?.players ?? [],
      playerTeams: remoteValid?.playerTeams ?? {},
      assignments: remoteValid?.assignments ?? {},
      savedAt: parseSavedAt(remoteValid?.savedAt),
    },
    {
      players: localValid?.players ?? [],
      playerTeams: localValid?.playerTeams ?? {},
      assignments: localValid?.assignments ?? {},
      savedAt: parseSavedAt(localValid?.savedAt),
    },
    {
      players: preValid?.players ?? [],
      playerTeams: preValid?.playerTeams ?? {},
      assignments: preValid?.assignments ?? {},
      savedAt: parseSavedAt(preValid?.savedAt),
    },
  ];

  const bestRoster = [...rosterCandidates].sort((a, b) => {
    if (b.players.length !== a.players.length) {
      return b.players.length - a.players.length;
    }
    return b.savedAt - a.savedAt;
  })[0];

  const base = remoteValid ?? localValid;
  const now = new Date().toISOString();
  const remoteMini = remoteValid?.miniGames ?? [];
  const localMini = localValid?.miniGames ?? [];
  const miniGames =
    miniGameRichness(localMini) >= miniGameRichness(remoteMini)
      ? localMini
      : remoteMini;

  return {
    version: 1,
    matchId,
    status: base?.status ?? "configurando",
    createdAt: base?.createdAt ?? now,
    expiresAt: base?.expiresAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    savedAt: now,
    gameMode: base?.gameMode ?? preValid?.gameMode ?? "fut5",
    teamCount: base?.teamCount ?? preValid?.teamCount ?? 2,
    teamNames: base?.teamNames ?? preValid?.teamNames ?? { A: "Equipa A", B: "Equipa B", C: "Equipa C", D: "Equipa D" },
    players: bestRoster.players,
    playerTeams: bestRoster.playerTeams,
    assignments: bestRoster.assignments,
    currentPlayerId: base?.currentPlayerId ?? bestRoster.players.find((player) => player.isMe)?.id ?? bestRoster.players[0]?.id ?? "",
    miniGames,
    votedUserIds: base?.votedUserIds,
    waitlist: remoteValid?.waitlist ?? localValid?.waitlist ?? [],
    title: base?.title,
    communityId: base?.communityId,
    organizerId: base?.organizerId,
    paymentsEnabled:
      remoteValid?.paymentsEnabled ??
      localValid?.paymentsEnabled ??
      loadMatchDetails(matchId)?.paymentsEnabled ??
      false,
    proBadge: remoteValid?.proBadge ?? localValid?.proBadge ?? false,
    openToExternal: remoteValid?.openToExternal ?? localValid?.openToExternal,
  };
}

/**
 * Verifica se o match está expirado pelo campo `expiresAt`.
 * Funciona com dados locais; não precisa de Firestore.
 */
export function isMatchExpired(data: SavedPostMatch | null): boolean {
  if (!data?.expiresAt) return false;
  return Date.now() > new Date(data.expiresAt).getTime();
}
