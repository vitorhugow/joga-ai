/**
 * notificationsRepository — notificações do utilizador
 */

import {
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  orderBy,
  limit,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db, isFirebaseConfigured } from "./firebase";

export type AppNotification = {
  id: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  type?: "match" | "community" | "system";
  link?: string;
};

const LOCAL_KEY = "joga-ai-notifications-v1";

function localKey(userId: string) {
  return `${LOCAL_KEY}-${userId}`;
}

function readLocal(userId: string): AppNotification[] {
  try {
    const raw = localStorage.getItem(localKey(userId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeLocal(userId: string, items: AppNotification[]) {
  localStorage.setItem(localKey(userId), JSON.stringify(items.slice(0, 30)));
}

export async function loadNotifications(userId: string): Promise<AppNotification[]> {
  const local = readLocal(userId);
  if (!isFirebaseConfigured() || !userId) return local;

  try {
    const snap = await getDocs(
      query(
        collection(db, "users", userId, "notifications"),
        orderBy("createdAt", "desc"),
        limit(20),
      ),
    );
    if (snap.empty) return local;

    return snap.docs.map((d) => ({
      id: d.id,
      title: String(d.data().title ?? ""),
      body: String(d.data().body ?? ""),
      read: Boolean(d.data().read),
      createdAt: d.data().createdAt?.toDate?.()?.toISOString() ?? new Date().toISOString(),
      type: d.data().type,
      link: d.data().link,
    }));
  } catch (err) {
    console.warn("[notifications] load:", err);
    return local;
  }
}

export async function addNotification(
  userId: string,
  notif: Omit<AppNotification, "id" | "read" | "createdAt">,
): Promise<void> {
  const id = `n-${Date.now()}`;
  const entry: AppNotification = {
    ...notif,
    id,
    read: false,
    createdAt: new Date().toISOString(),
  };

  const local = [entry, ...readLocal(userId)];
  writeLocal(userId, local);

  if (!isFirebaseConfigured()) return;

  try {
    await setDoc(doc(db, "users", userId, "notifications", id), {
      ...notif,
      read: false,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn("[notifications] add:", err);
  }
}

export async function markNotificationRead(userId: string, notifId: string): Promise<void> {
  const local = readLocal(userId).map((n) =>
    n.id === notifId ? { ...n, read: true } : n,
  );
  writeLocal(userId, local);

  if (!isFirebaseConfigured()) return;

  try {
    await updateDoc(doc(db, "users", userId, "notifications", notifId), { read: true });
  } catch {
    /* ignore */
  }
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  const local = readLocal(userId).map((n) => ({ ...n, read: true }));
  writeLocal(userId, local);
}

export function seedWelcomeNotifications(userId: string): AppNotification[] {
  const existing = readLocal(userId);
  if (existing.length > 0) return existing;

  const welcome: AppNotification[] = [
    {
      id: "welcome-1",
      title: "Bem-vindo ao Joga AI",
      body: "Cria a tua carta e organiza a primeira pelada!",
      read: false,
      createdAt: new Date().toISOString(),
      type: "system",
      link: "/perfil",
    },
  ];
  writeLocal(userId, welcome);
  return welcome;
}
