/**
 * Configuração da página /instalar — número de WhatsApp para pedidos de
 * acesso ao closed testing do Android.
 * Configurável via appConfig/install no Firestore (campo whatsappNumber,
 * formato internacional sem espaços, ex: "+351912345678"). Sem esse doc,
 * cai no fallback abaixo.
 */

import { doc, getDoc } from "firebase/firestore";
import { db, isFirebaseConfigured } from "./firebase";

/** Número do Vitor — atualizar aqui ou via appConfig/install se mudar. */
export const WHATSAPP_SUPPORT_NUMBER_FALLBACK = "+351932219498";

let cached: string | null = null;
let loadPromise: Promise<string> | null = null;

export async function loadWhatsappSupportNumber(): Promise<string> {
  if (cached) return cached;
  if (!loadPromise) {
    loadPromise = (async () => {
      if (!isFirebaseConfigured()) {
        cached = WHATSAPP_SUPPORT_NUMBER_FALLBACK;
        return cached;
      }
      try {
        const snap = await getDoc(doc(db, "appConfig", "install"));
        const number = snap.data()?.whatsappNumber;
        cached =
          typeof number === "string" && number.trim()
            ? number.trim()
            : WHATSAPP_SUPPORT_NUMBER_FALLBACK;
      } catch {
        cached = WHATSAPP_SUPPORT_NUMBER_FALLBACK;
      }
      return cached;
    })();
  }
  return loadPromise;
}
