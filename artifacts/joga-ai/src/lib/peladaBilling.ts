/**
 * peladaBilling — cliente dos pagamentos de pelada (Stripe Connect).
 * Ambas as funções redirecionam para páginas do Stripe; erros mostram toast.
 */

import { getFunctions, httpsCallable } from "firebase/functions";
import app, { isFirebaseConfigured } from "./firebase";
import { toast } from "@/hooks/use-toast";
import { callableErrorMessage } from "./callableError";

/** Organizador: liga (ou retoma) a conta Stripe Express */
export async function startConnectOnboarding(): Promise<void> {
  if (!isFirebaseConfigured()) return;
  try {
    const fn = httpsCallable<{ origin: string }, { url: string }>(
      getFunctions(app, "europe-west1"),
      "createConnectOnboarding",
    );
    const result = await fn({ origin: window.location.origin });
    if (!result.data?.url) throw new Error("sem URL");
    window.location.assign(result.data.url);
  } catch (err) {
    console.warn("[peladaBilling] onboarding:", err);
    toast({
      title: "Ligação de pagamentos indisponível",
      description: callableErrorMessage(
        err,
        "Completa a activação do Stripe Connect no Dashboard (modo Test) e tenta outra vez.",
      ),
      variant: "destructive",
    });
  }
}

/** Jogador: paga a pelada (preço → organizador; taxa → app, se aplicável) */
export async function payPelada(matchId: string): Promise<void> {
  if (!isFirebaseConfigured()) return;
  try {
    const fn = httpsCallable<
      { matchId: string; origin: string },
      { url: string }
    >(getFunctions(app, "europe-west1"), "createPeladaCheckout");
    const result = await fn({ matchId, origin: window.location.origin });
    if (!result.data?.url) throw new Error("sem URL");
    window.location.assign(result.data.url);
  } catch (err: unknown) {
    console.warn("[peladaBilling] payPelada:", err);
    const message =
      (err as { message?: string })?.message ??
      "Tenta novamente ou combina com o organizador.";
    toast({ title: "Não foi possível abrir o pagamento", description: message });
  }
}
