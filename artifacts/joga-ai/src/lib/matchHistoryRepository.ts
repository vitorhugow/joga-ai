/**
 * matchHistoryRepository — resultados e histórico de peladas
 */

import {
  collection,
  doc,
  setDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  deleteDoc,
  serverTimestamp,
  getDoc,
  getDocFromServer,
  type Unsubscribe,
} from "firebase/firestore";
import { db, isFirebaseConfigured } from "./firebase";
import { stripUndefined } from "./firestoreUtils";

export type MatchPlayerResult = {
  playerId: string;
  userId?: string;
  name: string;
  goals: number;
  assists: number;
  saves: number;
  rating: number;
  mvp?: boolean;
};

export type MatchResult = {
  matchId: string;
  title: string;
  completedAt: string;
  ratingsReleaseAt?: string;
  ratingsReleased?: boolean;
  ratingsReleasedAt?: string;
  ratingsReleaseReason?: "organizer" | "24h";
  communityId?: string;
  organizerId?: string;
  players: MatchPlayerResult[];
  topScorers: { name: string; goals: number }[];
  teamNames?: Record<string, string>;
};

export type UserMatchHistoryEntry = {
  matchId: string;
  title: string;
  date: string;
  rating: number;
  goals: number;
  assists: number;
  communityId?: string;
  ratingPending?: boolean;
  ratingReleased?: boolean;
  participationApplied?: boolean;
  voteEvolutionApplied?: boolean;
};

/** Limite de partidas visíveis no Perfil sem PRO Jogador (gate de leitura apenas). */
export const FREE_HISTORY_LIMIT = 10;
export const INITIAL_HISTORY_VISIBLE = 3;
export const HISTORY_PAGE_SIZE = 3;

const LOCAL_HISTORY_PREFIX = "joga-ai-match-history-v1";

function localHistoryKey(userId: string) {
  return `${LOCAL_HISTORY_PREFIX}-${userId}`;
}

function readLocalHistory(userId: string): UserMatchHistoryEntry[] {
  try {
    const raw = localStorage.getItem(localHistoryKey(userId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeLocalHistory(userId: string, entries: UserMatchHistoryEntry[]) {
  localStorage.setItem(localHistoryKey(userId), JSON.stringify(entries.slice(0, 30)));
}

/**
 * Grava o resultado (players/topScorers/etc) do resumo da pelada.
 *
 * NUNCA usa setDoc sem merge — um setDoc sem merge substitui o documento
 * inteiro, apagando ratingsReleased/ratingsReleasedAt/ratingsReleaseReason
 * sempre que algo (ex: a reparação de eventos ao vivo) grava de novo o
 * resultado depois das notas já terem saído. Isso fazia o pódio "esquecer"
 * que as notas já tinham sido publicadas.
 *
 * Também tem uma guarda anti-regressão: nunca aceita um payload em que
 * TODOS os jogadores ficam com nota 0 se já existir um resultado publicado
 * com pelo menos uma nota real — isso corrompia o pódio permanentemente
 * sempre que os votos eram lidos de uma cache offline vazia (0 documentos,
 * sem erro nenhum) e recalculados como se ninguém tivesse votado.
 *
 * Devolve true só quando o setDoc realmente correu com sucesso; false
 * quando a guarda anti-regressão abortar ou quando qualquer erro cair no
 * catch — para o chamador (ex: releaseMatchRatings) só marcar
 * ratingsReleased depois de confirmar que os dados foram mesmo gravados.
 */
export async function saveMatchResult(result: MatchResult): Promise<boolean> {
  if (!isFirebaseConfigured()) return false;

  const ref = doc(db, "matches", result.matchId, "summary", "result");

  try {
    const allZero =
      result.players.length > 0 && result.players.every((p) => p.rating <= 0);
    if (allZero) {
      // getDocFromServer, não getDoc: um getDoc normal pode resolver da
      // cache local offline/instável. Se o resultado real ainda não tiver
      // sincronizado nessa cache, existingSnap.exists() dava false mesmo
      // com notas reais no servidor, e esta guarda não disparava — deixando
      // o payload zerado passar por cima do resultado real via merge. Sem
      // ligação para confirmar, isto lança e cai no catch: não escreve
      // nada, que é o comportamento certo quando não há como confirmar.
      const existingSnap = await getDocFromServer(ref);
      if (existingSnap.exists()) {
        const existing = existingSnap.data() as MatchResult;
        const hadRealRating = existing.players?.some((p) => p.rating > 0);
        if (hadRealRating) {
          console.error(
            "[matchHistory] saveMatchResult ABORTADO — payload zeraria notas já publicadas",
            result.matchId,
          );
          return false;
        }
      }
    }

    await setDoc(
      ref,
      stripUndefined({
        ...result,
        savedAt: serverTimestamp(),
      }),
      { merge: true },
    );
    return true;
  } catch (err) {
    console.warn("[matchHistory] saveMatchResult:", err);
    return false;
  }
}

/**
 * Marca as notas como publicadas — escreve APENAS ratingsReleased,
 * ratingsReleasedAt e ratingsReleaseReason (merge). Nunca reescreve
 * `players`/`topScorers`; usa saveMatchResult() para isso, antes de chamar
 * esta função.
 */
export async function markRatingsReleased(
  matchId: string,
  reason: "organizer" | "24h",
): Promise<void> {
  if (!isFirebaseConfigured()) return;

  try {
    await setDoc(
      doc(db, "matches", matchId, "summary", "result"),
      {
        ratingsReleased: true,
        ratingsReleasedAt: new Date().toISOString(),
        ratingsReleaseReason: reason,
        savedAt: serverTimestamp(),
      },
      { merge: true },
    );
  } catch (err) {
    console.warn("[matchHistory] markRatingsReleased:", err);
  }
}

export type LoadMatchResultOutcome =
  | { ok: true; result: MatchResult | null }
  | { ok: false; errorCode: string };

/**
 * Lê matches/{id}/summary/result. Ao contrário da versão anterior, NÃO
 * engole erros de permissão/rede como "não existe" — devolve
 * { ok: false, errorCode } para o chamador poder distinguir "ainda não há
 * resultado" de "não consegui ler agora". Confundir os dois foi uma das
 * causas do pódio corromper-se: um erro engolido era tratado como "ainda
 * não há resultado", levando a recriar o resultado do zero por cima de um
 * já publicado.
 */
export async function loadMatchResult(matchId: string): Promise<LoadMatchResultOutcome> {
  if (!isFirebaseConfigured()) return { ok: true, result: null };

  try {
    const snap = await getDoc(doc(db, "matches", matchId, "summary", "result"));
    return { ok: true, result: snap.exists() ? (snap.data() as MatchResult) : null };
  } catch (err) {
    const errorCode = (err as { code?: string })?.code ?? "unknown";
    console.warn("[matchHistory] loadMatchResult:", matchId, errorCode, err);
    return { ok: false, errorCode };
  }
}

/**
 * Observa matches/{id}/summary/result em tempo real — o pódio reage assim
 * que as notas saírem, sem depender de um fetch pontual que pode ter
 * corrido antes da escrita chegar ou pode ter falhado silenciosamente.
 * Tal como loadMatchResult, distingue erro de "documento inexistente".
 */
export function watchMatchResult(
  matchId: string,
  callback: (outcome: LoadMatchResultOutcome) => void,
): Unsubscribe {
  if (!isFirebaseConfigured()) {
    callback({ ok: true, result: null });
    return () => {};
  }

  return onSnapshot(
    doc(db, "matches", matchId, "summary", "result"),
    (snap) => {
      callback({ ok: true, result: snap.exists() ? (snap.data() as MatchResult) : null });
    },
    (err) => {
      const errorCode = (err as { code?: string })?.code ?? "unknown";
      console.warn("[matchHistory] watchMatchResult:", matchId, errorCode, err);
      callback({ ok: false, errorCode });
    },
  );
}

export async function getUserMatchHistoryEntry(
  userId: string,
  matchId: string,
): Promise<UserMatchHistoryEntry | null> {
  const local = readLocalHistory(userId).find((e) => e.matchId === matchId);
  if (local) return local;

  if (!isFirebaseConfigured() || !userId) return null;

  try {
    const snap = await getDoc(doc(db, "users", userId, "matchHistory", matchId));
    return snap.exists() ? (snap.data() as UserMatchHistoryEntry) : null;
  } catch {
    return null;
  }
}

export async function hasParticipationApplied(
  userId: string,
  matchId: string,
): Promise<boolean> {
  const entry = await getUserMatchHistoryEntry(userId, matchId);
  return Boolean(entry?.participationApplied);
}

export async function hasVoteEvolutionApplied(
  userId: string,
  matchId: string,
): Promise<boolean> {
  const entry = await getUserMatchHistoryEntry(userId, matchId);
  return Boolean(entry?.voteEvolutionApplied);
}

export async function hasUserMatchHistoryEntry(
  userId: string,
  matchId: string,
): Promise<boolean> {
  if (readLocalHistory(userId).some((entry) => entry.matchId === matchId)) {
    return true;
  }

  if (!isFirebaseConfigured() || !userId) return false;

  try {
    const snap = await getDoc(doc(db, "users", userId, "matchHistory", matchId));
    return snap.exists();
  } catch {
    return false;
  }
}

export async function saveUserMatchHistory(
  userId: string,
  entry: UserMatchHistoryEntry,
): Promise<void> {
  const local = readLocalHistory(userId);
  const merged = [entry, ...local.filter((e) => e.matchId !== entry.matchId)];
  writeLocalHistory(userId, merged);

  if (!isFirebaseConfigured() || !userId) return;

  try {
    await setDoc(
      doc(db, "users", userId, "matchHistory", entry.matchId),
      stripUndefined({
        ...entry,
        savedAt: serverTimestamp(),
      }),
    );
  } catch (err) {
    console.warn("[matchHistory] saveUserMatchHistory:", err);
  }
}

export async function loadUserMatchHistory(userId: string): Promise<UserMatchHistoryEntry[]> {
  const local = readLocalHistory(userId);

  if (!isFirebaseConfigured() || !userId) return local;

  try {
    const snap = await getDocs(
      query(
        collection(db, "users", userId, "matchHistory"),
        orderBy("date", "desc"),
        limit(20),
      ),
    );
    if (snap.empty) return local;

    const remote = snap.docs.map((d) => d.data() as UserMatchHistoryEntry);
    const byId = new Map<string, UserMatchHistoryEntry>();
    [...remote, ...local].forEach((e) => byId.set(e.matchId, e));
    return [...byId.values()].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
  } catch (err) {
    console.warn("[matchHistory] loadUserMatchHistory:", err);
    return local;
  }
}

export async function loadCommunityMatchResults(
  communityId: string,
  limitCount = 10,
): Promise<MatchResult[]> {
  if (!isFirebaseConfigured()) return [];

  try {
    const snap = await getDocs(
      query(
        collection(db, "matches"),
        where("communityId", "==", communityId),
        where("status", "==", "concluida"),
        orderBy("savedAt", "desc"),
        limit(limitCount),
      ),
    );

    const results: MatchResult[] = [];
    for (const matchDoc of snap.docs) {
      const resultSnap = await getDoc(
        doc(db, "matches", matchDoc.id, "summary", "result"),
      );
      if (resultSnap.exists()) {
        results.push(resultSnap.data() as MatchResult);
      }
    }
    return results;
  } catch (err) {
    console.warn("[matchHistory] loadCommunityMatchResults:", err);
    return [];
  }
}

export async function deleteUserMatchHistory(userId: string, matchId: string): Promise<void> {
  const local = readLocalHistory(userId).filter((e) => e.matchId !== matchId);
  writeLocalHistory(userId, local);
  if (!isFirebaseConfigured()) return;
  try {
    await deleteDoc(doc(db, "users", userId, "matchHistory", matchId));
  } catch (err) {
    console.warn("[matchHistory] deleteUserMatchHistory:", err);
  }
}

export async function deleteMatchResult(matchId: string): Promise<void> {
  if (!isFirebaseConfigured()) return;
  try {
    await deleteDoc(doc(db, "matches", matchId, "summary", "result"));
  } catch (err) {
    console.warn("[matchHistory] deleteMatchResult:", err);
  }
}
