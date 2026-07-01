/**
 * fcmUtils — push notifications via Firebase Cloud Messaging
 */

import { getMessaging, getToken, isSupported } from "firebase/messaging";
import { doc, updateDoc, arrayUnion, serverTimestamp } from "firebase/firestore";
import app, { db, isFirebaseConfigured } from "./firebase";

const FCM_SESSION_KEY = "joga-ai-fcm-registered";

export async function isFcmSupported(): Promise<boolean> {
  try {
    return await isSupported();
  } catch {
    return false;
  }
}

export async function requestFcmPermission(): Promise<NotificationPermission> {
  if (!("Notification" in window)) return "denied";
  return Notification.requestPermission();
}

export async function saveFcmToken(userId: string): Promise<string | null> {
  if (!userId || !isFirebaseConfigured()) return null;

  const supported = await isFcmSupported();
  if (!supported) return null;

  const permission = await requestFcmPermission();
  if (permission !== "granted") return null;

  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined;
  if (!vapidKey) {
    console.warn("[fcm] VITE_FIREBASE_VAPID_KEY em falta");
    return null;
  }

  try {
    const messaging = getMessaging(app);
    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: await navigator.serviceWorker.register("/firebase-messaging-sw.js"),
    });

    if (!token) return null;

    await updateDoc(doc(db, "users", userId), {
      fcmTokens: arrayUnion(token),
      updatedAt: serverTimestamp(),
    });

    return token;
  } catch (err) {
    console.warn("[fcm] saveFcmToken:", err);
    return null;
  }
}

/** Regista token na 2ª+ sessão (evita prompt no primeiro login) */
export async function maybeRegisterFcmOnReturnVisit(userId: string): Promise<void> {
  if (!userId) return;

  const visits = Number(sessionStorage.getItem(FCM_SESSION_KEY) ?? "0") + 1;
  sessionStorage.setItem(FCM_SESSION_KEY, String(visits));

  if (visits < 2) return;
  await saveFcmToken(userId);
}
