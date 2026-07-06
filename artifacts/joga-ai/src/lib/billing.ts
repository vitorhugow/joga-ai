/**
 * billing — cliente do checkout Stripe.
 *
 * Chama a Cloud Function `createCheckoutSession` (Sprint 2B), que cria a
 * sessão de Stripe Checkout no servidor (a secret key NUNCA vive no cliente)
 * e devolve a URL para onde redirecionamos o utilizador.
 * O webhook do Stripe (também na Function) é quem grava `entitlements`
 * no perfil via admin SDK — o cliente nunca escreve PRO.
 */

import { getFunctions, httpsCallable } from "firebase/functions";
import app, { isFirebaseConfigured } from "./firebase";
import { toast } from "@/hooks/use-toast";
import type { EntitlementPlan } from "./entitlements";

export type BillingInterval = "month" | "year";

export async function startCheckout(
  plan: EntitlementPlan,
  interval: BillingInterval = "month",
): Promise<void> {
  if (!isFirebaseConfigured()) {
    toast({
      title: "Pagamentos indisponíveis",
      description: "Tenta novamente mais tarde.",
      variant: "destructive",
    });
    return;
  }

  try {
    const functions = getFunctions(app, "europe-west1");
    const createSession = httpsCallable<
      { plan: EntitlementPlan; interval: BillingInterval; origin: string },
      { url: string }
    >(functions, "createCheckoutSession");

    const result = await createSession({ plan, interval, origin: window.location.origin });
    const url = result.data?.url;
    if (!url) throw new Error("sessão sem URL");
    window.location.assign(url);
  } catch (err) {
    console.warn("[billing] startCheckout:", err);
    toast({
      title: "Pagamentos em ativação",
      description:
        "O checkout ainda está a ser ligado. Tenta novamente em breve — ou fala connosco.",
    });
  }
}
