/** Fotos dos campos — importadas no bundle (evita falha do PWA em /fields/). */

import fieldFutsal from "@/assets/fields/field-futsal.webp";
import fieldF5 from "@/assets/fields/field-f5.webp";
import fieldF7 from "@/assets/fields/field-f7.webp";

const PHOTOS = {
  futsal: fieldFutsal,
  f5: fieldF5,
  fut5: fieldF5,
  f7: fieldF7,
  fut7: fieldF7,
  f11: fieldF7,
  futebol11: fieldF7,
  default: fieldF5,
} as const;

export function fieldPhotoSrc(fieldType?: string | null): string {
  const v = (fieldType ?? "").toLowerCase();
  if (v === "futsal") return PHOTOS.futsal;
  if (v === "f5" || v === "fut5") return PHOTOS.f5;
  if (v === "f7" || v === "fut7") return PHOTOS.f7;
  if (v === "f11" || v === "futebol11") return PHOTOS.f11;
  return PHOTOS.default;
}

/** Quadrado fixo em todos os cartões. */
export const FIELD_PHOTO_SIZE = 88;
