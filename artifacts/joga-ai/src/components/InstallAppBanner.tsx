import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Smartphone, X } from "lucide-react";
import { JogaButton } from "@/components/joga";

const DISMISSED_KEY = "joga-ai-install-banner-dismissed-v1";

function isStandaloneDisplay(): boolean {
  if (typeof window === "undefined") return false;
  const standaloneMedia = window.matchMedia?.("(display-mode: standalone)").matches;
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return Boolean(standaloneMedia || iosStandalone);
}

/** Logo da Apple — monocromático, herda a cor via currentColor. Só identifica a
 * plataforma; nunca usar como badge oficial da App Store (não existe app iOS). */
function AppleLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.06 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.037-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
    </svg>
  );
}

/** Logo do robô Android — monocromático. Nunca usar como badge oficial da
 * Google Play; a app está em closed testing e o badge oficial não se aplica. */
function AndroidLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M17.523 15.3414c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.5511 0 .9993.4482.9993.9993.0001.5511-.4482.9997-.9993.9997m-11.046 0c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.5511 0 .9993.4482.9993.9993 0 .5511-.4482.9997-.9993.9997m11.4045-6.02l1.9973-3.4592a.416.416 0 00-.1521-.5676.416.416 0 00-.5676.1521l-2.0223 3.503C15.5902 8.2439 13.8533 7.8508 12 7.8508s-3.5902.3931-5.1367 1.0989L4.841 5.4467a.416.416 0 00-.5677-.1521.416.416 0 00-.1521.5676L6.1185 9.3212C2.6952 11.1273.3432 14.6021 0 18.761h24c-.3435-4.1591-2.6952-7.6337-6.1185-9.4396" />
    </svg>
  );
}

export function InstallAppBanner() {
  const [dismissed, setDismissed] = useState(true);
  const [standalone, setStandalone] = useState(true);

  useEffect(() => {
    setStandalone(isStandaloneDisplay());
    try {
      setDismissed(localStorage.getItem(DISMISSED_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  if (standalone || dismissed) return null;

  function dismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      /* localStorage indisponível — some da sessão, mas volta no próximo load */
    }
  }

  return (
    <div
      className="relative rounded-2xl p-4"
      style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
      data-testid="install-app-banner"
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label="Fechar"
        className="absolute top-3 right-3 w-7 h-7 rounded-lg flex items-center justify-center"
        style={{ background: "rgba(255,255,255,0.06)" }}
        data-testid="button-dismiss-install-banner"
      >
        <X className="w-3.5 h-3.5 text-white/50" />
      </button>

      <div className="flex items-center gap-2 pr-8">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: "rgba(74,222,128,0.15)" }}
        >
          <Smartphone className="w-4.5 h-4.5 text-emerald-400" />
        </div>
        <div>
          <p className="font-display font-black text-white text-base leading-tight">
            Adiciona o Joga AI ao ecrã principal
          </p>
          <p className="text-white/45 text-xs mt-0.5">Ícone próprio, ecrã inteiro, sem barra do browser.</p>
        </div>
      </div>

      <Link href="/instalar" className="block mt-3">
        <JogaButton variant="primary" size="lg" className="w-full" data-testid="button-install-app">
          Instalar no telemóvel
        </JogaButton>
      </Link>

      <div className="flex items-center justify-center gap-4 mt-3">
        <span className="inline-flex items-center gap-1.5 text-white/35 text-xs font-semibold">
          <AppleLogo className="w-3.5 h-3.5" />
          iPhone
        </span>
        <span className="w-px h-3" style={{ background: "rgba(255,255,255,0.12)" }} />
        <span className="inline-flex items-center gap-1.5 text-white/35 text-xs font-semibold">
          <AndroidLogo className="w-3.5 h-3.5" />
          Android
        </span>
      </div>
    </div>
  );
}
