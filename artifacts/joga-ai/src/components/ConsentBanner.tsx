import { useEffect, useState } from "react";
import { Link } from "wouter";
import { JogaButton } from "@/components/joga";
import { getAnalyticsConsent, setAnalyticsConsent } from "@/lib/analytics";

/** Banner RGPD — analytics só após aceitar. */
export function ConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(getAnalyticsConsent() === null);
  }, []);

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[10000] px-4 pb-4 pt-2 pointer-events-none"
      style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
    >
      <div
        className="mx-auto max-w-lg rounded-2xl border border-white/10 p-4 pointer-events-auto shadow-2xl"
        style={{ background: "rgba(15,23,42,0.96)", backdropFilter: "blur(12px)" }}
      >
        <p className="text-white text-sm leading-relaxed">
          Usamos analytics anónimos para melhorar o Joga AI.{" "}
          <Link href="/privacidade" className="text-emerald-400 underline">
            Privacidade
          </Link>
        </p>
        <div className="flex gap-2 mt-3">
          <JogaButton
            variant="ghost"
            size="sm"
            className="flex-1"
            onClick={() => {
              setAnalyticsConsent("rejected");
              setVisible(false);
            }}
          >
            Recusar
          </JogaButton>
          <JogaButton
            variant="primary"
            size="sm"
            className="flex-1"
            onClick={() => {
              setAnalyticsConsent("accepted");
              setVisible(false);
            }}
          >
            Aceitar
          </JogaButton>
        </div>
      </div>
    </div>
  );
}
