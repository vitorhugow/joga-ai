/**
 * Quem pode aceder ao painel /admin.
 * Fontes (qualquer uma basta na UI): VITE_ADMIN_UIDS ou appConfig/admins no Firestore.
 * As firestore.rules validam o uid na lista de admins (doc + fallback fixo).
 */

export function getEnvAdminUids(): string[] {
  const raw = import.meta.env.VITE_ADMIN_UIDS as string | undefined;
  if (!raw?.trim()) return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
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
  return adminUids.includes(uid);
}
