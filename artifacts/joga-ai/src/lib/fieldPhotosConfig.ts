/**
 * Fotos dos campos — URLs em appConfig/fieldPhotos (Firebase).
 * Geridas no painel /admin, sem deploy nem pastas locais.
 */

import { doc, getDoc } from "firebase/firestore";
import { db, isFirebaseConfigured } from "./firebase";

export type FieldPhotoKey = "futsal" | "f5" | "f7";

export type FieldPhotosConfig = Partial<Record<FieldPhotoKey, string>>;

let cached: FieldPhotosConfig | null = null;
let loadPromise: Promise<FieldPhotosConfig> | null = null;

export async function loadFieldPhotos(): Promise<FieldPhotosConfig> {
  if (cached) return cached;
  if (!loadPromise) {
    loadPromise = (async () => {
      if (!isFirebaseConfigured()) {
        cached = {};
        return cached;
      }
      try {
        const snap = await getDoc(doc(db, "appConfig", "fieldPhotos"));
        const data = snap.data();
        cached = {
          futsal: data?.futsal ? String(data.futsal) : undefined,
          f5: data?.f5 ? String(data.f5) : undefined,
          f7: data?.f7 ? String(data.f7) : undefined,
        };
      } catch {
        cached = {};
      }
      return cached;
    })();
  }
  return loadPromise;
}

export function resolveFieldPhotoUrl(
  fieldType: string | null | undefined,
  config: FieldPhotosConfig,
): string | undefined {
  const v = (fieldType ?? "").toLowerCase();
  if (v === "futsal") return config.futsal;
  if (v === "f5" || v === "fut5") return config.f5;
  if (v === "f7" || v === "fut7" || v === "f11" || v === "futebol11") return config.f7;
  return config.f5 ?? config.f7 ?? config.futsal;
}

export function invalidateFieldPhotosCache(): void {
  cached = null;
  loadPromise = null;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("field-photos-updated"));
  }
}

/** Quadrado fixo em todos os cartões. */
export const FIELD_PHOTO_SIZE = 88;

export const FIELD_PHOTO_LABELS: Record<FieldPhotoKey, string> = {
  futsal: "Futsal",
  f5: "Fut 5",
  f7: "Fut 7 / Fut 11",
};
