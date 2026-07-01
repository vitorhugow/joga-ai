/**
 * evolutionRepository.ts
 *
 * Camada Firestore para o histórico de evolução de atributos.
 * Subcoleção: users/{userId}/evolution/{recordId}
 *
 * Estratégia: escreve em Firestore + localStorage; lê de Firestore
 * com fallback para localStorage se offline ou não configurado.
 */

import {
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db, isFirebaseConfigured } from "./firebase";
import type { EvolutionRecord } from "./evolutionStorage";
import { deleteEvolutionRecordsForMatch as deleteEvolutionRecordsLocal } from "./evolutionStorage";

const LOCAL_KEY = "joga-ai-evolution-history-v1";
const MAX_HISTORY = 20;

function readLocal(): EvolutionRecord[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeLocal(records: EvolutionRecord[]) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(records.slice(0, MAX_HISTORY)));
}

/** Guarda um registo de evolução (Firestore + localStorage) */
export async function saveEvolutionToFirestore(
  userId: string,
  record: EvolutionRecord,
): Promise<void> {
  // Actualiza localStorage imediatamente (optimista)
  const history = readLocal().filter((r) => r.id !== record.id);
  writeLocal([record, ...history]);

  if (!isFirebaseConfigured()) return;

  try {
    const ref = doc(db, "users", userId, "evolution", record.id);
    await setDoc(ref, {
      ...record,
      savedAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn("[evolutionRepository] saveEvolutionToFirestore:", err);
  }
}

/** Carrega o histórico de evolução (Firestore com fallback localStorage) */
export async function loadEvolutionFromFirestore(
  userId: string,
): Promise<EvolutionRecord[]> {
  const local = readLocal();

  if (!isFirebaseConfigured()) return local;

  try {
    const colRef = collection(db, "users", userId, "evolution");
    const q = query(colRef, orderBy("savedAt", "desc"), limit(MAX_HISTORY));
    const snap = await getDocs(q);

    if (snap.empty) return local;

    const remote = snap.docs.map((d) => {
      const data = d.data();
      return {
        ...data,
        id: d.id,
        savedAt:
          data.savedAt?.toDate?.()?.toISOString() ??
          data.savedAt ??
          new Date().toISOString(),
      } as EvolutionRecord;
    });

    // Merge: Firestore tem precedência; actualiza cache local
    const merged = remote;
    writeLocal(merged);
    return merged;
  } catch (err) {
    console.warn("[evolutionRepository] loadEvolutionFromFirestore:", err);
    return local;
  }
}

/** Remove registos de evolução ligados a uma partida (local + Firestore) */
export async function deleteEvolutionRecordsForMatch(
  userId: string,
  matchId: string,
): Promise<void> {
  deleteEvolutionRecordsLocal(matchId, userId);

  if (!isFirebaseConfigured()) return;

  try {
    const colRef = collection(db, "users", userId, "evolution");
    const snap = await getDocs(query(colRef, where("matchId", "==", matchId)));
    await Promise.all(snap.docs.map((entry) => deleteDoc(entry.ref)));
  } catch (err) {
    console.warn("[evolutionRepository] deleteEvolutionRecordsForMatch:", err);
  }
}
