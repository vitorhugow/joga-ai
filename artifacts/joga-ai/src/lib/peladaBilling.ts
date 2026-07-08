/**
 * peladaBilling — Caixa do organizador e pagamentos de pelada (Stripe Connect).
 */

import { getFunctions, httpsCallable } from "firebase/functions";
import app, { isFirebaseConfigured } from "./firebase";
import { toast } from "@/hooks/use-toast";
import { callableErrorMessage } from "./callableError";
import { openStripeUrl } from "./billing";

type ConnectIntent = "onboard" | "manage";

type ConnectLinkInput = {
  origin: string;
  returnPath?: string;
  intent?: ConnectIntent;
};

function currentReturnPath(): string {
  return `${window.location.pathname}${window.location.search}`;
}

async function openConnectLink(options: {
  returnPath?: string;
  intent?: ConnectIntent;
  toastOnOpen?: boolean;
}): Promise<void> {
  if (!isFirebaseConfigured()) return;

  const returnPath = options.returnPath ?? currentReturnPath();
  const intent = options.intent ?? "onboard";

  try {
    const fn = httpsCallable<ConnectLinkInput, { url: string }>(
      getFunctions(app, "europe-west1"),
      "createConnectOnboarding",
    );
    const result = await fn({
      origin: window.location.origin,
      returnPath,
      intent,
    });
    if (!result.data?.url) throw new Error("sem URL");

    if (options.toastOnOpen !== false && intent === "onboard") {
      toast({
        title: "Ligar Caixa",
        description:
          "Abre noutro separador. Escolhe «Pessoa individual» — configuras agora ou mais tarde.",
      });
    }

    openStripeUrl(result.data.url);
  } catch (err) {
    console.warn("[peladaBilling] connect:", err);
    toast({
      title: intent === "manage" ? "Não foi possível abrir a Caixa" : "Caixa indisponível",
      description: callableErrorMessage(err, "Tenta novamente em breve."),
      variant: "destructive",
    });
  }
}

/** Organizador: primeira ligação da Caixa */
export function startConnectOnboarding(returnPath?: string): Promise<void> {
  return openConnectLink({ returnPath, intent: "onboard" });
}

/** Organizador: painel Stripe — IBAN, dados, histórico */
export function openOrganizerCaixa(returnPath?: string): Promise<void> {
  return openConnectLink({ returnPath, intent: "manage", toastOnOpen: false });
}

/** @deprecated use openOrganizerCaixa */
export const openOrganizerPayouts = openOrganizerCaixa;

/** Jogador: paga a pelada */
export async function payPelada(matchId: string): Promise<void> {
  if (!isFirebaseConfigured()) return;
  try {
    const fn = httpsCallable<
      { matchId: string; origin: string },
      { url: string }
    >(getFunctions(app, "europe-west1"), "createPeladaCheckout");
    const result = await fn({ matchId, origin: window.location.origin });
    if (!result.data?.url) throw new Error("sem URL");
    openStripeUrl(result.data.url);
  } catch (err: unknown) {
    console.warn("[peladaBilling] payPelada:", err);
    toast({
      title: "Não foi possível abrir o pagamento",
      description: callableErrorMessage(
        err,
        "Tenta novamente ou combina com o organizador.",
      ),
      variant: "destructive",
    });
  }
}
