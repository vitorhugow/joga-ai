/**
 * mensalistaRepository.ts — passe mensal do jogador na comunidade.
 */

import { doc, getDoc } from "firebase/firestore";
import { httpsCallable, getFunctions } from "firebase/functions";
import app, { db, isFirebaseConfigured } from "./firebase";

export type MensalistaStatus = {
  active: boolean;
  subscriptionId?: string;
  currentPeriodEnd?: string;
  priceCents?: number;
  cancelAtPeriodEnd?: boolean;
};

export type CommunityMensalistaConfig = {
  enabled: boolean;
  priceCents: number;
  maxSlots?: number | null;
};

export async function loadMensalistaStatus(
  communityId: string,
  userId: string,
): Promise<MensalistaStatus | null> {
  if (!isFirebaseConfigured() || !communityId || !userId) return null;
  try {
    const snap = await getDoc(doc(db, "communities", communityId, "mensalistas", userId));
    if (!snap.exists()) return null;
    const data = snap.data();
    const active = data.active === true;
    const currentPeriodEnd = data.currentPeriodEnd ? String(data.currentPeriodEnd) : undefined;
    const stillActive =
      active && (!currentPeriodEnd || Date.now() < new Date(currentPeriodEnd).getTime());
    return {
      active: stillActive,
      subscriptionId: data.subscriptionId ? String(data.subscriptionId) : undefined,
      currentPeriodEnd,
      priceCents: data.priceCents != null ? Number(data.priceCents) : undefined,
      cancelAtPeriodEnd: data.cancelAtPeriodEnd === true,
    };
  } catch (err) {
    console.warn("[mensalistaRepository] loadMensalistaStatus:", err);
    return null;
  }
}

export async function countActiveMensalistas(communityId: string): Promise<number> {
  if (!isFirebaseConfigured() || !communityId) return 0;
  try {
    const { collection, getDocs } = await import("firebase/firestore");
    const snap = await getDocs(collection(db, "communities", communityId, "mensalistas"));
    const now = Date.now();
    let count = 0;
    for (const d of snap.docs) {
      const data = d.data();
      if (data.active !== true) continue;
      const end = data.currentPeriodEnd ? new Date(String(data.currentPeriodEnd)).getTime() : null;
      if (end != null && now >= end) continue;
      count += 1;
    }
    return count;
  } catch (err) {
    console.warn("[mensalistaRepository] countActiveMensalistas:", err);
    return 0;
  }
}

export async function startMensalistaCheckout(communityId: string): Promise<string> {
  const fn = httpsCallable<{ communityId: string; origin: string }, { url: string }>(
    getFunctions(app, "europe-west1"),
    "createMensalistaCheckout",
  );
  const { data } = await fn({
    communityId,
    origin: window.location.origin,
  });
  if (!data.url) throw new Error("Stripe não devolveu URL.");
  return data.url;
}

export async function openMensalistaPortal(communityId: string): Promise<string> {
  const fn = httpsCallable<{ communityId: string; origin: string }, { url: string }>(
    getFunctions(app, "europe-west1"),
    "createMensalistaPortal",
  );
  const { data } = await fn({
    communityId,
    origin: window.location.origin,
  });
  if (!data.url) throw new Error("Portal não disponível.");
  return data.url;
}

export type ClubSettingsInput = {
  communityId: string;
  mensalista?: CommunityMensalistaConfig;
  openToExternal?: boolean;
  branding?: {
    primaryColor?: string;
    logoUrl?: string;
    bannerUrl?: string;
  };
};

export async function saveCommunityClubSettings(input: ClubSettingsInput): Promise<void> {
  const fn = httpsCallable<ClubSettingsInput, { ok: boolean }>(
    getFunctions(app, "europe-west1"),
    "updateCommunityClubSettings",
  );
  await fn(input);
}
