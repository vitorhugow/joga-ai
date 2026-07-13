/**
 * adminRepository — gestão manual de PRO e skins (painel /admin).
 * Só funciona para uids listados em appConfig/admins (validado pelas rules).
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  limit as fsLimit,
  arrayUnion,
} from "firebase/firestore";
import { db, isFirebaseConfigured } from "./firebase";
import type { EntitlementPlan, Entitlements } from "./entitlements";
import type { UserProfile } from "./userRepository";
import type { FieldPhotoKey } from "./fieldPhotosConfig";

export type AdminUserRow = {
  uid: string;
  displayName: string;
  email?: string;
  entitlements?: Entitlements;
  unlockedSkins?: string[];
  cardSkin?: string;
};

function mapUserDoc(uid: string, data: Record<string, unknown>): AdminUserRow {
  return {
    uid,
    displayName: String(data.displayName ?? "Sem nome"),
    email: data.email ? String(data.email) : undefined,
    entitlements: data.entitlements as Entitlements | undefined,
    unlockedSkins: Array.isArray(data.unlockedSkins) ? (data.unlockedSkins as string[]) : undefined,
    cardSkin: data.cardSkin ? String(data.cardSkin) : undefined,
  };
}

export async function adminLoadUser(uid: string): Promise<AdminUserRow | null> {
  if (!isFirebaseConfigured() || !uid.trim()) return null;
  const snap = await getDoc(doc(db, "users", uid.trim()));
  if (!snap.exists()) return null;
  return mapUserDoc(snap.id, snap.data() as Record<string, unknown>);
}

/** Procura por uid, email ou nome exacto */
export async function adminFindUsers(search: string): Promise<AdminUserRow[]> {
  if (!isFirebaseConfigured()) return [];
  const q = search.trim();
  if (!q) return [];

  if (q.length >= 20 && !q.includes(" ") && !q.includes("@")) {
    const one = await adminLoadUser(q);
    return one ? [one] : [];
  }

  if (q.includes("@")) {
    const snap = await getDocs(
      query(collection(db, "users"), where("email", "==", q.toLowerCase()), fsLimit(10)),
    );
    return snap.docs.map((d) => mapUserDoc(d.id, d.data() as Record<string, unknown>));
  }

  const snap = await getDocs(
    query(collection(db, "users"), where("displayName", "==", q), fsLimit(10)),
  );
  return snap.docs.map((d) => mapUserDoc(d.id, d.data() as Record<string, unknown>));
}

export async function adminGrantPro(
  uid: string,
  plan: EntitlementPlan,
  proUntilIso: string,
): Promise<void> {
  if (!isFirebaseConfigured()) throw new Error("Firebase não configurado");
  await updateDoc(doc(db, "users", uid), {
    entitlements: {
      pro: true,
      plan,
      proUntil: proUntilIso,
    },
    updatedAt: serverTimestamp(),
  });
}

export async function adminRevokePro(uid: string): Promise<void> {
  if (!isFirebaseConfigured()) throw new Error("Firebase não configurado");
  await updateDoc(doc(db, "users", uid), {
    entitlements: { pro: false },
    updatedAt: serverTimestamp(),
  });
}

export async function adminUnlockSkin(uid: string, skinId: string): Promise<void> {
  if (!isFirebaseConfigured()) throw new Error("Firebase não configurado");
  await updateDoc(doc(db, "users", uid), {
    unlockedSkins: arrayUnion(skinId),
    updatedAt: serverTimestamp(),
  });
}

/** Grava email no perfil (para pesquisa no admin) — só o próprio utilizador */
export async function syncProfileEmail(uid: string, email: string): Promise<void> {
  if (!isFirebaseConfigured() || !email.trim()) return;
  try {
    await updateDoc(doc(db, "users", uid), {
      email: email.trim().toLowerCase(),
      updatedAt: serverTimestamp(),
    });
  } catch {
    // perfil pode ainda não existir
  }
}

export type { UserProfile };

export type AdminReport = {
  id: string;
  reporterId: string;
  targetType: "user" | "community";
  targetId: string;
  reason: string;
  details: string;
  status: string;
  createdAt?: string;
};

export async function adminLoadOpenReports(): Promise<AdminReport[]> {
  if (!isFirebaseConfigured()) return [];
  const snap = await getDocs(
    query(collection(db, "reports"), where("status", "==", "open"), fsLimit(50)),
  );
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      reporterId: String(data.reporterId ?? ""),
      targetType: data.targetType === "community" ? "community" : "user",
      targetId: String(data.targetId ?? ""),
      reason: String(data.reason ?? ""),
      details: String(data.details ?? ""),
      status: String(data.status ?? "open"),
      createdAt: data.createdAt?.toDate?.()?.toISOString(),
    };
  });
}

export async function adminUpdateReportStatus(
  reportId: string,
  status: "resolved" | "dismissed",
): Promise<void> {
  if (!isFirebaseConfigured()) throw new Error("Firebase não configurado");
  await updateDoc(doc(db, "reports", reportId), {
    status,
    updatedAt: serverTimestamp(),
  });
}

export async function adminSaveFieldPhoto(key: FieldPhotoKey, url: string): Promise<void> {
  if (!isFirebaseConfigured()) throw new Error("Firebase não configurado");
  await setDoc(
    doc(db, "appConfig", "fieldPhotos"),
    { [key]: url, updatedAt: serverTimestamp() },
    { merge: true },
  );
}
