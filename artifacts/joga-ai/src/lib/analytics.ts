/**
 * analytics.ts — GA4 via Firebase Analytics (só com consentimento RGPD).
 */

import type { Analytics } from "firebase/analytics";

const CONSENT_KEY = "joga-ai-consent-v1";

let analyticsInstance: Analytics | null = null;
let initStarted = false;

export type ConsentChoice = "accepted" | "rejected";

export function getAnalyticsConsent(): ConsentChoice | null {
  try {
    const v = localStorage.getItem(CONSENT_KEY);
    return v === "accepted" || v === "rejected" ? v : null;
  } catch {
    return null;
  }
}

export function setAnalyticsConsent(choice: ConsentChoice): void {
  localStorage.setItem(CONSENT_KEY, choice);
  if (choice === "accepted") {
    void initAnalytics();
  }
}

export async function initAnalytics(): Promise<void> {
  if (initStarted || getAnalyticsConsent() !== "accepted") return;
  initStarted = true;

  try {
    const { isFirebaseConfigured } = await import("./firebase");
    if (!isFirebaseConfigured()) return;

    const { isSupported, getAnalytics } = await import("firebase/analytics");
    const app = (await import("./firebase")).default;
    if (!(await isSupported())) return;
    analyticsInstance = getAnalytics(app);
  } catch (err) {
    console.warn("[analytics] init:", err);
  }
}

export function trackEvent(
  name: string,
  params?: Record<string, string | number | boolean>,
): void {
  if (getAnalyticsConsent() !== "accepted" || !analyticsInstance) return;
  void import("firebase/analytics")
    .then(({ logEvent }) => {
      if (analyticsInstance) logEvent(analyticsInstance, name, params);
    })
    .catch(() => {});
}
