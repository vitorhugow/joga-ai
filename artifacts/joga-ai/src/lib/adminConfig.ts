/**
 * Quem pode aceder ao painel /admin.
 * Fontes (qualquer uma basta): built-in, VITE_ADMIN_* ou appConfig/admins no Firestore.
 * As firestore.rules validam uid/email na lista de admins.
 */

/** Sempre activos — não dependem do build nem do Firestore */
export const BUILT_IN_ADMIN_UIDS = ["KrnnjgKclcPJm4In4W9ORp3iX6j2"] as const;
export const BUILT_IN_ADMIN_EMAILS = ["vh.santos.nunes@gmail.com"] as const;

export function getEnvAdminUids(): string[] {
  const raw = import.meta.env.VITE_ADMIN_UIDS as string | undefined;
  if (!raw?.trim()) return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

export function getEnvAdminEmails(): string[] {
  const raw = import.meta.env.VITE_ADMIN_EMAILS as string | undefined;
  if (!raw?.trim()) return [];
  return raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

export async function loadFirestoreAdminUids(): Promise<string[]> {
  const { doc, getDoc } = await import("firebase/firestore");
  const { db, isFirebaseConfigured } = await import("./firebase");
  if (!isFirebaseConfigured()) return [];

  try {
    const snap = await getDoc(doc(db, "appConfig", "admins"));
    const uids = snap.data()?.uids;
    return Array.isArray(uids) ? uids.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function isUidAppAdmin(uid: string | undefined, adminUids: string[]): boolean {
  if (!uid) return false;
  if (BUILT_IN_ADMIN_UIDS.includes(uid as (typeof BUILT_IN_ADMIN_UIDS)[number])) return true;
  return adminUids.includes(uid);
}

export function isEmailAppAdmin(email: string | undefined | null, extraEmails: string[] = []): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  if (BUILT_IN_ADMIN_EMAILS.includes(normalized as (typeof BUILT_IN_ADMIN_EMAILS)[number])) return true;
  return extraEmails.includes(normalized);
}

export function resolveIsAppAdmin(
  uid: string | undefined,
  email: string | undefined | null,
  firestoreUids: string[],
): boolean {
  const adminUids = [...new Set([...getEnvAdminUids(), ...firestoreUids])];
  const adminEmails = getEnvAdminEmails();
  return isUidAppAdmin(uid, adminUids) || isEmailAppAdmin(email, adminEmails);
}
