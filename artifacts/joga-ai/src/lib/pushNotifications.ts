/**
 * pushNotifications.ts — FCM web/TWA (sem iOS/APNs).
 */

import { doc, setDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import app, { db, isFirebaseConfigured } from "./firebase";
import { trackEvent } from "./analytics";

const DISMISS_KEY = "joga-ai-push-dismissed-at";
const DISMISS_DAYS = 30;

const shownPopupIds = new Set<string>();

export function isIOSDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

export function isPushSupportedPlatform(): boolean {
  return !isIOSDevice() && typeof window !== "undefined" && "Notification" in window;
}

export function markPopupNotificationShown(notifId: string): void {
  if (notifId) shownPopupIds.add(notifId);
}

export function wasPopupNotificationShown(notifId: string): boolean {
  return shownPopupIds.has(notifId);
}

function detectPlatform(): "web" | "twa" {
  if (typeof window === "undefined") return "web";
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return standalone ? "twa" : "web";
}

function wasDismissedRecently(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const dismissedAt = Number(raw);
    return Date.now() - dismissedAt < DISMISS_DAYS * 24 * 3600 * 1000;
  } catch {
    return false;
  }
}

export function recordPushPromptDismissed(): void {
  localStorage.setItem(DISMISS_KEY, String(Date.now()));
}

/** Pode mostrar soft-prompt? (nunca no load — só após ação significativa) */
export function canOfferPushPrompt(): boolean {
  if (!isFirebaseConfigured() || !isPushSupportedPlatform()) return false;
  if (Notification.permission !== "default") return false;
  return !wasDismissedRecently();
}

async function registerMessagingServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/firebase-messaging-sw.js");
  } catch (err) {
    console.warn("[push] SW register:", err);
    return null;
  }
}

export async function requestPushPermission(userId: string): Promise<boolean> {
  if (!userId || !isFirebaseConfigured() || !isPushSupportedPlatform()) return false;

  const permission = await Notification.requestPermission();
  trackEvent("push_permission", { granted: permission === "granted" });
  if (permission !== "granted") return false;

  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
  if (!vapidKey) {
    console.warn("[push] VITE_FIREBASE_VAPID_KEY em falta");
    return false;
  }

  try {
    const { isSupported, getMessaging, getToken } = await import("firebase/messaging");
    const supported = await isSupported();
    if (!supported) return false;

    const messaging = getMessaging(app);
    const swReg = await registerMessagingServiceWorker();
    const token = await getToken(messaging, {
      vapidKey,
      ...(swReg ? { serviceWorkerRegistration: swReg } : {}),
    });
    if (!token) return false;

    await setDoc(
      doc(db, "users", userId, "fcmTokens", token),
      {
        platform: detectPlatform(),
        userAgent: navigator.userAgent.slice(0, 200),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );

    return true;
  } catch (err) {
    console.warn("[push] getToken:", err);
    return false;
  }
}

export async function removePushToken(userId: string): Promise<void> {
  if (!userId || !isFirebaseConfigured()) return;
  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
  if (!vapidKey) return;

  try {
    const { isSupported, getMessaging, getToken, deleteToken } = await import("firebase/messaging");
    if (!(await isSupported())) return;
    const messaging = getMessaging(app);
    const swReg = await registerMessagingServiceWorker();
    const token = await getToken(messaging, {
      vapidKey,
      ...(swReg ? { serviceWorkerRegistration: swReg } : {}),
    });
    if (token) {
      await deleteToken(messaging);
      await deleteDoc(doc(db, "users", userId, "fcmTokens", token));
    }
  } catch {
    /* ignore */
  }
}

let foregroundListenerReady = false;

export async function setupForegroundPushListener(
  onToast: (payload: { title: string; body: string; notifId?: string }) => void,
): Promise<void> {
  if (foregroundListenerReady || !isFirebaseConfigured() || !isPushSupportedPlatform()) return;
  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
  if (!vapidKey) return;

  try {
    const { isSupported, getMessaging, onMessage } = await import("firebase/messaging");
    if (!(await isSupported())) return;
    const messaging = getMessaging(app);
    onMessage(messaging, (payload) => {
      const notifId = payload.data?.notifId;
      if (notifId && wasPopupNotificationShown(notifId)) return;
      const title = payload.notification?.title ?? "Joga AI";
      const body = payload.notification?.body ?? "";
      if (title || body) onToast({ title, body, notifId });
    });
    foregroundListenerReady = true;
  } catch (err) {
    console.warn("[push] foreground:", err);
  }
}
