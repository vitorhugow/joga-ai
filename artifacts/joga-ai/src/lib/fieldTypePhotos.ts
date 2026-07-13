/** Foto fixa por tipo de campo — public/fields/*.webp */

export function fieldPhotoSrc(fieldType?: string | null): string {
  const v = (fieldType ?? "").toLowerCase();
  if (v === "futsal") return "/fields/field-futsal.webp";
  if (v === "f5" || v === "fut5") return "/fields/field-f5.webp";
  if (v === "f7" || v === "fut7") return "/fields/field-f7.webp";
  if (v === "f11" || v === "futebol11") return "/fields/field-f7.webp";
  return "/fields/field-f5.webp";
}
