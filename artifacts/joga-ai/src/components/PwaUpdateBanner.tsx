import { useEffect, useState } from "react";
import { JogaButton } from "@/components/joga";
import { subscribePwaNeedRefresh } from "@/lib/pwaUpdate";

/** Banner discreto — avisa quando há uma versão nova do service worker à espera. */
export function PwaUpdateBanner() {
  const [needRefresh, setNeedRefresh] = useState(false);

  useEffect(() => subscribePwaNeedRefresh(() => setNeedRefresh(true)), []);

  if (!needRefresh) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[10000] px-4 pt-2 pointer-events-none"
      style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}
    >
      <div
        className="mx-auto max-w-lg rounded-2xl border border-emerald-400/25 p-3 pointer-events-auto shadow-2xl flex items-center gap-3"
        style={{ background: "rgba(15,23,42,0.96)", backdropFilter: "blur(12px)" }}
      >
        <p className="text-white text-sm font-medium flex-1">
          Nova versão disponível
        </p>
        <JogaButton
          variant="gold"
          size="sm"
          onClick={() => window.location.reload()}
        >
          Atualizar
        </JogaButton>
      </div>
    </div>
  );
}
