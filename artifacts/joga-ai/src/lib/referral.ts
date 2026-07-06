/**
 * referral — "Convida 3 amigos que joguem uma pelada → desbloqueia skin premium".
 *
 * Fluxo:
 * 1. Utilizador partilha o link pessoal (…/?ref=<uid>).
 * 2. Quem abre o link fica com o ref guardado no localStorage
 *    (captureReferralFromUrl, chamado no arranque da app).
 * 3. Quando essa pessoa cria conta, o perfil dela grava `referredBy`
 *    (consumePendingReferral é lido no momento da criação do perfil).
 * 4. Um convidado "qualifica" quando joga a 1.ª pelada (seasonStats.matches > 0).
 * 5. Com REFERRAL_GOAL qualificados, o utilizador desbloqueia a skin
 *    REFERRAL_SKIN_ID (gravada em unlockedSkins no próprio perfil).
 */

import { collection, getDocs, query, where } from "firebase/firestore";
import { db, isFirebaseConfigured } from "./firebase";

const PENDING_REF_KEY = "joga-ai-pending-ref";

export const REFERRAL_GOAL = 3;
/** Skin exclusiva de referral — entra no catálogo de skins do Sprint 2 */
export const REFERRAL_SKIN_ID = "embaixador";

/** Chamar uma vez no arranque: guarda ?ref=<uid> para usar no signup */
export function captureReferralFromUrl(): void {
  try {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (ref && ref.length >= 10 && ref.length <= 128) {
      localStorage.setItem(PENDING_REF_KEY, ref);
    }
  } catch {
    /* noop — referral nunca pode partir o arranque */
  }
}

/** Lido no momento de criação do perfil; nunca devolve o próprio uid */
export function consumePendingReferral(ownUid: string): string | null {
  try {
    const ref = localStorage.getItem(PENDING_REF_KEY);
    if (!ref || ref === ownUid) return null;
    return ref;
  } catch {
    return null;
  }
}

export function clearPendingReferral(): void {
  try {
    localStorage.removeItem(PENDING_REF_KEY);
  } catch {
    /* noop */
  }
}

export function getReferralLink(uid: string): string {
  return `https://jogaai.geniai.pt/?ref=${encodeURIComponent(uid)}`;
}

export function getReferralWhatsAppLink(uid: string): string {
  const text =
    "Bora criar a tua carta de jogador tipo FIFA? Eu uso o Joga AI para " +
    "organizar as peladas — confirma presença, vê o placar ao vivo e evolui " +
    `a tua carta a cada jogo. Entra aqui: ${getReferralLink(uid)}`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export type ReferralProgress = {
  invited: number;
  qualified: number;
  goal: number;
  unlocked: boolean;
};

/**
 * Conta convidados e qualificados (jogaram ≥1 pelada).
 * Leitura permitida pelas rules (perfis são legíveis por signed-in users).
 */
export async function loadReferralProgress(uid: string): Promise<ReferralProgress> {
  const empty: ReferralProgress = {
    invited: 0,
    qualified: 0,
    goal: REFERRAL_GOAL,
    unlocked: false,
  };
  if (!isFirebaseConfigured() || !uid) return empty;

  try {
    const snap = await getDocs(
      query(collection(db, "users"), where("referredBy", "==", uid)),
    );
    let qualified = 0;
    snap.forEach((docSnap) => {
      const matches = Number(docSnap.data()?.seasonStats?.matches ?? 0);
      if (matches > 0) qualified += 1;
    });
    return {
      invited: snap.size,
      qualified,
      goal: REFERRAL_GOAL,
      unlocked: qualified >= REFERRAL_GOAL,
    };
  } catch (err) {
    console.warn("[referral] loadReferralProgress:", err);
    return empty;
  }
}
