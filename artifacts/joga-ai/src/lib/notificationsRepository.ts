/**
 * notificationsRepository — notificações do utilizador
 */

import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  orderBy,
  limit,
  updateDoc,
  serverTimestamp,
  onSnapshot,
  collectionGroup,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { auth, db, isFirebaseConfigured } from "./firebase";
import { getVotes } from "./auditRepository";
import { loadMatchFromFirestore } from "./matchRepository";
import { loadUserMatchHistory } from "./matchHistoryRepository";
import { collectLinkedPlayerUserIds } from "./evolutionUtils";

export type NotificationPriority = "popup" | "center";

export type AppNotification = {
  id: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  type?: "match" | "community" | "system";
  link?: string;
  priority?: NotificationPriority;
};

const LOCAL_KEY = "joga-ai-notifications-v1";
const NOTIFICATIONS_LIMIT = 30;

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
  localStorage.setItem(localKey(userId), JSON.stringify(items.slice(0, NOTIFICATIONS_LIMIT)));
}

function hasNotificationId(items: AppNotification[], id: string): boolean {
  return items.some((n) => n.id === id);
}

function mapNotificationDoc(d: { id: string; data: () => Record<string, unknown> }): AppNotification {
  const data = d.data();
  return {
    id: d.id,
    title: String(data.title ?? ""),
    body: String(data.body ?? ""),
    read: Boolean(data.read),
    createdAt: (data.createdAt as { toDate?: () => Date })?.toDate?.()?.toISOString() ?? new Date().toISOString(),
    type: data.type as AppNotification["type"],
    link: typeof data.link === "string" ? data.link : undefined,
    priority: data.priority === "popup" || data.priority === "center" ? data.priority : undefined,
  };
}

export async function loadNotifications(userId: string): Promise<AppNotification[]> {
  const local = readLocal(userId);
  if (!isFirebaseConfigured() || !userId) return local;

  try {
    const snap = await getDocs(
      query(
        collection(db, "users", userId, "notifications"),
        orderBy("createdAt", "desc"),
        limit(NOTIFICATIONS_LIMIT),
      ),
    );
    if (snap.empty) return local;

    const remote = snap.docs.map(mapNotificationDoc);

    writeLocal(userId, remote);
    return remote;
  } catch (err) {
    console.warn("[notifications] load:", err);
    return local;
  }
}

export function subscribeToNotifications(
  userId: string,
  callback: (notifications: AppNotification[], unreadCount: number) => void,
): Unsubscribe {
  if (!isFirebaseConfigured() || !userId) {
    const local = readLocal(userId);
    callback(local, local.filter((n) => !n.read).length);
    return () => {};
  }

  const q = query(
    collection(db, "users", userId, "notifications"),
    orderBy("createdAt", "desc"),
    limit(NOTIFICATIONS_LIMIT),
  );

  return onSnapshot(
    q,
    (snap) => {
      const items: AppNotification[] = snap.docs.map(mapNotificationDoc);
      writeLocal(userId, items);
      callback(items, items.filter((n) => !n.read).length);
    },
    (err) => {
      console.warn("[notifications] subscribe:", err);
      const local = readLocal(userId);
      callback(local, local.filter((n) => !n.read).length);
    },
  );
}

export async function addNotification(
  userId: string,
  notif: Omit<AppNotification, "id" | "read" | "createdAt"> & { id?: string },
): Promise<void> {
  const id = notif.id ?? `n-${Date.now()}`;
  const entry: AppNotification = {
    title: notif.title,
    body: notif.body,
    type: notif.type,
    link: notif.link,
    priority: notif.priority,
    id,
    read: false,
    createdAt: new Date().toISOString(),
  };

  const local = readLocal(userId);
  if (!hasNotificationId(local, id)) {
    writeLocal(userId, [entry, ...local]);
  }

  if (!isFirebaseConfigured()) return;

  try {
    await setDoc(
      doc(db, "users", userId, "notifications", id),
      {
        title: entry.title,
        body: entry.body,
        type: entry.type,
        link: entry.link,
        ...(entry.priority ? { priority: entry.priority } : {}),
        read: false,
        createdAt: serverTimestamp(),
      },
      { merge: true },
    );
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
  const items = await loadNotifications(userId);
  const unread = items.filter((n) => !n.read);
  if (!unread.length) return;

  writeLocal(userId, items.map((n) => ({ ...n, read: true })));

  if (!isFirebaseConfigured()) return;

  await Promise.all(
    unread.map((n) =>
      updateDoc(doc(db, "users", userId, "notifications", n.id), { read: true }).catch(() => {}),
    ),
  );
}

export async function notifyMatchPlayersToVote(
  matchId: string,
  players: Array<{ id: string; userId?: string }>,
  title: string,
  organizerId?: string,
): Promise<void> {
  const userIds = collectLinkedPlayerUserIds(players, organizerId);
  await Promise.all(
    userIds.map((userId) =>
      addNotification(userId, {
        id: `vote-${matchId}`,
        title: "A tua pelada terminou — hora de votar!",
        body: `Confere o resumo de «${title}» e dá a tua nota aos colegas.`,
        type: "match",
        link: `/partida/${matchId}/pos-jogo`,
      }),
    ),
  );
}

export async function seedWelcomeNotifications(userId: string): Promise<void> {
  const existing = readLocal(userId);
  if (existing.some((n) => n.id === "welcome-1")) return;

  await addNotification(userId, {
    id: "welcome-1",
    title: "Bem-vindo ao Joga AI",
    body: "Cria a tua carta e organiza a primeira pelada!",
    type: "system",
    link: "/perfil",
  });
}

/** Deriva notificações a partir do estado (sem escritas cross-user). */
export async function processPendingNotifications(userId: string): Promise<void> {
  if (!userId) return;

  await seedWelcomeNotifications(userId);

  const local = readLocal(userId);

  // Pedidos de comunidade aprovados/recusados
  if (isFirebaseConfigured()) {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid || uid !== userId) return;

      const joinSnap = await getDocs(
        query(collectionGroup(db, "joinRequests"), where("userId", "==", uid)),
      );

      for (const requestDoc of joinSnap.docs) {
        const data = requestDoc.data();
        const status = String(data.status ?? "");
        const communityRef = requestDoc.ref.parent.parent;
        if (!communityRef || (status !== "approved" && status !== "rejected")) continue;

        const communityId = communityRef.id;
        const notifId = `join-${communityId}-${status}`;
        if (hasNotificationId(local, notifId)) continue;

        let communityName = "Comunidade";
        try {
          const communitySnap = await getDoc(doc(db, "communities", communityId));
          if (communitySnap.exists()) {
            communityName = String(communitySnap.data().name ?? communityName);
          }
        } catch {
          /* use default */
        }

        await addNotification(userId, {
          id: notifId,
          title: status === "approved" ? "Entrada aprovada!" : "Pedido recusado",
          body:
            status === "approved"
              ? `Foste aceite em «${communityName}».`
              : `O teu pedido para «${communityName}» foi recusado.`,
          type: "community",
          link: status === "approved" ? `/comunidades/${communityId}` : "/comunidades",
        });
      }
    } catch (err) {
      console.warn("[notifications] join requests:", err);
    }
  }

  // Peladas à espera de voto
  const history = await loadUserMatchHistory(userId);
  for (const entry of history) {
    const voteNotifId = `vote-${entry.matchId}`;
    if (hasNotificationId(readLocal(userId), voteNotifId)) continue;

    const match = await loadMatchFromFirestore(entry.matchId);
    if (!match) continue;
    if (match.status !== "aguardando_auditoria" && match.status !== "auditada") continue;

    const inRoster = match.players?.some((p) => p.userId === userId || p.id === userId);
    if (!inRoster) continue;

    const votes = await getVotes(entry.matchId);
    const hasVoted = votes.some((v) => v.userId === userId);
    if (hasVoted) continue;

    await addNotification(userId, {
      id: voteNotifId,
      title: "A tua pelada terminou — hora de votar!",
      body: `Confere o resumo de «${entry.title}» e dá a tua nota aos colegas.`,
      type: "match",
      link: `/partida/${entry.matchId}/pos-jogo`,
    });
  }

  // Evolução disponível após notas publicadas
  for (const entry of history) {
    if (!entry.ratingReleased || entry.rating <= 0) continue;
    const evoNotifId = `evo-${entry.matchId}`;
    if (hasNotificationId(readLocal(userId), evoNotifId)) continue;

    await addNotification(userId, {
      id: evoNotifId,
      title: "Confere a tua evolução",
      body: `A tua nota em «${entry.title}» já está disponível.`,
      type: "match",
      link: "/perfil/evolucao",
    });
  }
}
