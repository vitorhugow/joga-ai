export const BRAND_ASSETS = {
  full: "/brand/JOGAAI_espacado.webp",
  badge: "/brand/logo-badge.png",
  icon: "/brand/logo-icon.png",
} as const;

export type BrandAssetKey = keyof typeof BRAND_ASSETS;
