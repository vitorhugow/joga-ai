/**
 * cardSkins — catálogo das skins de carta (Sprint 2).
 *
 * A skin muda APENAS o tratamento visual da moldura (gradiente + brilho),
 * nunca o layout — a estrutura da carta fica intocada.
 * Acesso: PRO ativo desbloqueia as skins premium; a "Embaixador" é
 * exclusiva do referral (unlockedSkins), mesmo para PRO.
 */

import type { UserProfile } from "./userRepository";
import { isProActive } from "./entitlements";

export type CardSkin = {
  id: string;
  name: string;
  description: string;
  /** "pro" = requer PRO · "referral" = requer unlockedSkins */
  access: "free" | "pro" | "referral";
  /** Cor de destaque usada no seletor */
  accent: string;
};

export const CARD_SKINS: CardSkin[] = [
  {
    id: "classica",
    name: "Clássica",
    description: "A dourada original",
    access: "free",
    accent: "#e6b64c",
  },
  {
    id: "fogo",
    name: "Fogo",
    description: "Para quem está em chamas",
    access: "pro",
    accent: "#f97316",
  },
  {
    id: "raio",
    name: "Raio",
    description: "Energia elétrica pura",
    access: "pro",
    accent: "#818cf8",
  },
  {
    id: "diamante",
    name: "Diamante",
    description: "Gelo e brilho de elite",
    access: "pro",
    accent: "#7dd3fc",
  },
  {
    id: "embaixador",
    name: "Embaixador",
    description: "Exclusiva — convida 3 amigos",
    access: "referral",
    accent: "#34d399",
  },
];

export function getSkin(id?: string | null): CardSkin {
  return CARD_SKINS.find((s) => s.id === id) ?? CARD_SKINS[0];
}

export function canUseSkin(skin: CardSkin, profile?: UserProfile | null): boolean {
  if (skin.access === "free") return true;
  if (skin.access === "referral") {
    return profile?.unlockedSkins?.includes(skin.id) ?? false;
  }
  return isProActive(profile?.entitlements);
}

/** Skin efetiva a renderizar — cai para a clássica se perdeu o acesso
 *  (ex.: PRO expirou), sem apagar a preferência guardada. */
export function effectiveSkinId(profile?: UserProfile | null): string {
  const skin = getSkin(profile?.cardSkin);
  return canUseSkin(skin, profile) ? skin.id : "classica";
}
