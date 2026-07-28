/**
 * auditRepository.ts
 *
 * Camada Firestore para auditores e votos de uma partida.
 * Subcoleções: matches/{matchId}/auditors  e  matches/{matchId}/votes
 *
 * Quando Firebase não está configurado, toda a lógica cai no
 * createMatchFlowStore() de matchFlowStorage.ts (localStorage).
 */

import {
  collection,
  doc,
  setDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { db, isFirebaseConfigured } from "./firebase";
import { createMatchFlowStore, type MatchVoteRecord } from "./matchFlowStorage";

export type AuditorRecord = {
  userId: string;
  joinedAt: string;
  confirmed: boolean;
  confirmedAt?: string;
};

/** Regista um auditor (máx. 3) */
export async function registerAuditor(
  matchId: string,
  userId: string,
): Promise<{ success: boolean; auditors: AuditorRecord[] }> {
  if (!isFirebaseConfigured()) return { success: false, auditors: [] };

  const colRef = collection(db, "matches", matchId, "auditors");
  const docRef = doc(colRef, userId);

  try {
    const snap = await getDocs(colRef);
    const existing = snap.docs.map((d) => ({
      userId: d.id,
      ...d.data(),
    })) as AuditorRecord[];

    if (existing.some((a) => a.userId === userId)) {
      return { success: true, auditors: existing };
    }
    if (existing.length >= 3) {
      return { success: false, auditors: existing };
    }

    await setDoc(docRef, {
      userId,
      joinedAt: new Date().toISOString(),
      confirmed: false,
    });

    return {
      success: true,
      auditors: [...existing, { userId, joinedAt: new Date().toISOString(), confirmed: false }],
    };
  } catch (err) {
    console.warn("[auditRepository] registerAuditor:", err);
    return { success: false, auditors: [] };
  }
}

/** Marca um auditor como confirmado */
export async function confirmAuditor(
  matchId: string,
  userId: string,
): Promise<void> {
  if (!isFirebaseConfigured()) return;

  try {
    const ref = doc(db, "matches", matchId, "auditors", userId);
    await setDoc(
      ref,
      { confirmed: true, confirmedAt: serverTimestamp() },
      { merge: true },
    );
  } catch (err) {
    console.warn("[auditRepository] confirmAuditor:", err);
  }
}

/** Submete um voto (imutável — só criação) */
export async function submitVote(
  matchId: string,
  vote: MatchVoteRecord,
): Promise<void> {
  if (!isFirebaseConfigured()) return;

  try {
    const ref = doc(db, "matches", matchId, "votes", vote.userId);
    await setDoc(ref, {
      ratings: vote.ratings,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn("[auditRepository] submitVote:", err);
  }
}

export type VotesResult = {
  votes: MatchVoteRecord[];
  /**
   * "server": a leitura confirmou junto do Firestore — 0 documentos aqui
   * significa mesmo "ninguém votou". "cache": veio da cache local (offline,
   * ou persistentLocalCache ainda por sincronizar) ou do fallback em erro —
   * 0 documentos aqui NÃO prova que ninguém votou, só que não conseguimos
   * confirmar agora. Esta distinção existe porque tratar os dois casos como
   * iguais já corrompeu notas publicadas (recalculadas para 0 a partir de
   * uma leitura vazia que só estava vazia por estar offline).
   */
  source: "server" | "cache";
};

/** Lê todos os votos (Firestore + cache local) */
export async function getVotes(matchId: string): Promise<VotesResult> {
  const store = createMatchFlowStore(matchId);
  const local = store.readVotes();

  if (!isFirebaseConfigured()) return { votes: local, source: "cache" };

  try {
    const snap = await getDocs(collection(db, "matches", matchId, "votes"));
    const remote = snap.docs.map((d) => ({
      userId: d.id,
      ratings: d.data().ratings as Record<string, number>,
      createdAt:
        d.data().createdAt?.toDate?.()?.toISOString() ??
        new Date().toISOString(),
    }));

    if (snap.metadata.fromCache) {
      // Não confirmámos junto do servidor — não sabemos se "remote" reflecte
      // a realidade. Preferimos a cache local (que pelo menos sabemos de
      // onde veio) só para exibição, mas o `source: "cache"` impede que isto
      // seja usado para calcular/gravar notas.
      return { votes: remote.length > 0 ? remote : local, source: "cache" };
    }

    // O servidor confirmou esta leitura — se disse 0 votos, são mesmo 0.
    // `local` pode ter sobras de outra sessão/dispositivo (mergeRemoteVotes
    // é union, nunca remove o que falta no remote); devolvê-lo aqui rotulava
    // votos nunca confirmados nesta leitura como "source: server".
    return {
      votes: remote.length > 0 ? store.mergeRemoteVotes(remote) : remote,
      source: "server",
    };
  } catch (err) {
    console.warn("[auditRepository] getVotes:", err);
    return { votes: local, source: "cache" };
  }
}

/** Observa auditores em tempo real */
export function watchAuditors(
  matchId: string,
  callback: (auditors: AuditorRecord[]) => void,
): Unsubscribe {
  if (!isFirebaseConfigured()) return () => {};

  const colRef = collection(db, "matches", matchId, "auditors");
  return onSnapshot(
    colRef,
    (snap) => {
      const records = snap.docs.map((d) => ({
        userId: d.id,
        ...(d.data() as Omit<AuditorRecord, "userId">),
      }));
      callback(records);
    },
    (err) => console.warn("[auditRepository] watchAuditors:", err),
  );
}

/** Observa votos em tempo real */
export function watchVotes(
  matchId: string,
  callback: (votes: MatchVoteRecord[]) => void,
): Unsubscribe {
  if (!isFirebaseConfigured()) return () => {};

  const colRef = collection(db, "matches", matchId, "votes");
  return onSnapshot(
    colRef,
    (snap) => {
      const records = snap.docs.map((d) => ({
        userId: d.id,
        ratings: d.data().ratings as Record<string, number>,
        createdAt:
          d.data().createdAt?.toDate?.()?.toISOString() ??
          new Date().toISOString(),
      }));
      callback(records);
    },
    (err) => console.warn("[auditRepository] watchVotes:", err),
  );
}
