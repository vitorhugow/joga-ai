/**
 * blockRepository — jogadores bloqueados.
 */

import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db, isFirebaseConfigured } from "./firebase";

const CACHE_KEY = "joga-ai-blocked-v1";

function readCache(userId: string): Set<string> {
  try {
    const raw = localStorage.getItem(`${CACHE_KEY}-${userId}`);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function writeCache(userId: string, ids: Set<string>): void {
  localStorage.setItem(`${CACHE_KEY}-${userId}`, JSON.stringify([...ids]));
}

export async function loadBlockedIds(userId: string): Promise<Set<string>> {
  if (!isFirebaseConfigured() || !userId) return readCache(userId);

  try {
    const snap = await getDocs(collection(db, "users", userId, "blocked"));
    const ids = new Set(snap.docs.map((d) => d.id));
    writeCache(userId, ids);
    return ids;
  } catch (err) {
    console.warn("[block] load:", err);
    return readCache(userId);
  }
}

export async function blockUser(userId: string, targetUid: string): Promise<void> {
  if (!userId || !targetUid || userId === targetUid) return;
  const cache = readCache(userId);
  cache.add(targetUid);
  writeCache(userId, cache);

  if (!isFirebaseConfigured()) return;
  await setDoc(doc(db, "users", userId, "blocked", targetUid), {
    createdAt: serverTimestamp(),
  });
}

export async function unblockUser(userId: string, targetUid: string): Promise<void> {
  if (!userId || !targetUid) return;
  const cache = readCache(userId);
  cache.delete(targetUid);
  writeCache(userId, cache);

  if (!isFirebaseConfigured()) return;
  await deleteDoc(doc(db, "users", userId, "blocked", targetUid));
}

export function filterBlocked<T extends { userId?: string; id?: string }>(
  items: T[],
  blocked: Set<string>,
): T[] {
  if (!blocked.size) return items;
  return items.filter((item) => {
    const uid = item.userId ?? item.id;
    return !uid || !blocked.has(uid);
  });
}
