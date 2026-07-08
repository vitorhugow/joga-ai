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

function isInsufficientBalance(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { details?: { reason?: string } | string };
  if (typeof e.details === "object" && e.details?.reason === "INSUFFICIENT_BALANCE") {
    return true;
  }
  return false;
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

/** Cancela pelada com reembolsos automáticos */
export async function cancelPeladaWithRefunds(matchId: string): Promise<number> {
  if (!isFirebaseConfigured()) return 0;
  const fn = httpsCallable<{ matchId: string }, { refunded: number }>(
    getFunctions(app, "europe-west1"),
    "cancelPeladaWithRefunds",
  );
  const result = await fn({ matchId });
  return result.data?.refunded ?? 0;
}

/** Sai da pelada e credita pagamento ao saldo interno */
export async function leavePeladaMatch(matchId: string): Promise<{ creditedCents: number }> {
  if (!isFirebaseConfigured()) return { creditedCents: 0 };
  const fn = httpsCallable<{ matchId: string }, { creditedCents: number }>(
    getFunctions(app, "europe-west1"),
    "leavePeladaWithBalanceCredit",
  );
  const result = await fn({ matchId });
  return { creditedCents: result.data?.creditedCents ?? 0 };
}

export type PayPeladaResult = "balance" | "stripe" | "error";

/** Jogador: paga a pelada (saldo primeiro, depois Stripe) */
export async function payPelada(matchId: string): Promise<PayPeladaResult> {
  if (!isFirebaseConfigured()) return "error";

  try {
    const balanceFn = httpsCallable<{ matchId: string }, { paid: boolean }>(
      getFunctions(app, "europe-west1"),
      "payPeladaWithBalance",
    );
    const balanceResult = await balanceFn({ matchId });
    if (balanceResult.data?.paid) {
      toast({
        title: "Pago com saldo ✓",
        description: "Presença confirmada nesta pelada.",
      });
      return "balance";
    }
  } catch (err: unknown) {
    if (!isInsufficientBalance(err)) {
      console.warn("[peladaBilling] payPeladaWithBalance:", err);
      toast({
        title: "Não foi possível usar o saldo",
        description: callableErrorMessage(err, "Tenta novamente."),
        variant: "destructive",
      });
      return "error";
    }
  }

  try {
    const fn = httpsCallable<
      { matchId: string; origin: string },
      { url: string }
    >(getFunctions(app, "europe-west1"), "createPeladaCheckout");
    const result = await fn({ matchId, origin: window.location.origin });
    if (!result.data?.url) throw new Error("sem URL");
    openStripeUrl(result.data.url);
    return "stripe";
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
    return "error";
  }
}
