import { useEffect, useRef } from "react";
import { toast } from "@/hooks/use-toast";

/** Trata ?stripe=ligado|recomecar após voltar do onboarding Stripe. */
export function useStripeConnectReturn(onReturned?: () => void) {
  const onReturnedRef = useRef(onReturned);
  onReturnedRef.current = onReturned;
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    const params = new URLSearchParams(window.location.search);
    const status = params.get("stripe");
    if (!status) return;

    handled.current = true;
    params.delete("stripe");
    const qs = params.toString();
    const cleanUrl = qs
      ? `${window.location.pathname}?${qs}`
      : window.location.pathname;
    window.history.replaceState({}, "", cleanUrl);

    if (status === "ligado") {
      toast({
        title: "Caixa ligada ✓",
        description: "Já podes receber pagamentos online nas peladas.",
      });
      onReturnedRef.current?.();
    } else if (status === "recomecar") {
      toast({
        title: "Configuração incompleta",
        description: "Podes continuar mais tarde no perfil ou na pelada.",
      });
    }
  }, []);
}
