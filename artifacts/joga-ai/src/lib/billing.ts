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
import { callableErrorMessage } from "./callableError";
import { trackEvent } from "./analytics";

export type BillingInterval = "month" | "year";

/** Abre páginas Stripe (checkout, portal, Connect) noutro separador. */
export function openStripeUrl(url: string): boolean {
  const opened = window.open(url, "_blank", "noopener,noreferrer");
  if (!opened) {
    toast({
      title: "Popup bloqueado",
      description: "Permite popups para jogaai.pt e tenta outra vez.",
      variant: "destructive",
    });
    return false;
  }
  return true;
}

export async function startCheckout(
  plan: EntitlementPlan,
  interval: BillingInterval = "month",
  communityId?: string,
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
    trackEvent("pro_checkout_started", { plan, interval });
    const functions = getFunctions(app, "europe-west1");
    const createSession = httpsCallable<
      { plan: EntitlementPlan; interval: BillingInterval; origin: string; communityId?: string },
      { url: string }
    >(functions, "createCheckoutSession");

    const result = await createSession({
      plan,
      interval,
      origin: window.location.origin,
      ...(communityId ? { communityId } : {}),
    });
    const url = result.data?.url;
    if (!url) throw new Error("sessão sem URL");
    openStripeUrl(url);
    toast({
      title: "Checkout aberto",
      description: "Completa o pagamento no separador Stripe e volta aqui.",
    });
  } catch (err) {
    console.warn("[billing] startCheckout:", err);
    toast({
      title: "Não foi possível abrir o checkout",
      description: callableErrorMessage(err, "Tenta novamente em breve."),
      variant: "destructive",
    });
  }
}

/**
 * Abre o Stripe Customer Portal — trocar cartão, ver faturas, cancelar.
 * Depende da Cloud Function `createPortalSession` (Sprint 2B).
 */
export async function openBillingPortal(): Promise<void> {
  if (!isFirebaseConfigured()) return;
  try {
    const functions = getFunctions(app, "europe-west1");
    const createPortal = httpsCallable<{ origin: string }, { url: string }>(
      functions,
      "createPortalSession",
    );
    const result = await createPortal({ origin: window.location.origin });
    const url = result.data?.url;
    if (!url) throw new Error("portal sem URL");
    window.open(url, "_blank", "noopener,noreferrer");
  } catch (err) {
    console.warn("[billing] openBillingPortal:", err);
    toast({
      title: "Não foi possível abrir a gestão",
      description: callableErrorMessage(err, "Tenta novamente em breve."),
      variant: "destructive",
    });
  }
}
