/** Foto fixa por tipo de campo — public/fields/*.webp */

const BASE = import.meta.env.BASE_URL ?? "/";

function asset(path: string): string {
  const root = BASE.endsWith("/") ? BASE : `${BASE}/`;
  return `${root}${path.replace(/^\//, "")}`;
}

export function fieldPhotoSrc(fieldType?: string | null): string {
  const v = (fieldType ?? "").toLowerCase();
  if (v === "futsal") return asset("fields/field-futsal.webp");
  if (v === "f5" || v === "fut5") return asset("fields/field-f5.webp");
  if (v === "f7" || v === "fut7") return asset("fields/field-f7.webp");
  if (v === "f11" || v === "futebol11") return asset("fields/field-f7.webp");
  return asset("fields/field-f5.webp");
}

/** Quadrado fixo em todos os cartões. */
export const FIELD_PHOTO_SIZE = 88;
