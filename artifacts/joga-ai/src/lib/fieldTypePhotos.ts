/** Fotos dos campos — servidas de /fields/ (public/fields/). */

const PHOTOS = {
  futsal: "/fields/field-futsal.webp",
  f5: "/fields/field-f5.webp",
  fut5: "/fields/field-f5.webp",
  f7: "/fields/field-f7.webp",
  fut7: "/fields/field-f7.webp",
  f11: "/fields/field-f7.webp",
  futebol11: "/fields/field-f7.webp",
  default: "/fields/field-f5.webp",
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
