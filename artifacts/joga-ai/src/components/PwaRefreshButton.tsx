import { useState } from "react";
import { disableNetwork, enableNetwork } from "firebase/firestore";
import { RefreshCw } from "lucide-react";
import { db } from "@/lib/firebase";

/**
 * Botão manual de refresh — escape hatch global para quem sente a app
 * "presa" (dados/UI antigos), independente da deteção automática de
 * atualização.
 *
 * NÃO faz location.reload(): com navigateFallback: "index.html" (workbox),
 * um reload simples é servido pelo precache e devolve exatamente o mesmo
 * conteúdo antigo — não revalida nada. Em vez disso chama
 * registration.update() e deixa o fluxo normal do service worker (banner
 * "Nova versão disponível" em pwaUpdate.ts) decidir o reload quando houver
 * mesmo uma versão nova. Se não houver, força os listeners live do
 * Firestore a resincronizar (disableNetwork/enableNetwork) para trazer os
 * dados atuais do ecrã sem precisar de reload nenhum.
 */
export function PwaRefreshButton() {
  const [spinning, setSpinning] = useState(false);

  async function handleRefresh() {
    if (spinning) return;
    setSpinning(true);
    try {
      if ("serviceWorker" in navigator) {
        const registration = await navigator.serviceWorker.getRegistration();
        await registration?.update();
      }
    } catch {
      // ignora — tenta sempre resincronizar os dados a seguir
    }

    try {
      await disableNetwork(db);
      await enableNetwork(db);
    } catch {
      // sem rede ou Firestore não configurado — nada a fazer
    } finally {
      setSpinning(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleRefresh}
      aria-label="Atualizar a app"
      title="Atualizar a app"
      disabled={spinning}
      className="fixed z-[9999] flex items-center justify-center w-10 h-10 rounded-full border border-white/10 text-white/70 active:scale-90 transition-transform disabled:opacity-60"
      style={{
        bottom: "calc(68px + max(0.75rem, env(safe-area-inset-bottom)))",
        right: "0.75rem",
        background: "rgba(15,23,42,0.85)",
        backdropFilter: "blur(8px)",
      }}
    >
      <RefreshCw className={spinning ? "w-4 h-4 animate-spin" : "w-4 h-4"} />
    </button>
  );
}
