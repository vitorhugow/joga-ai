import { useEffect, useRef, useState } from "react";
import { ChevronDown, Coins, Crown, Settings, Wallet } from "lucide-react";
import { Link } from "wouter";
import { JogaButton } from "@/components/joga";
import { openBillingPortal } from "@/lib/billing";
import { isProActive } from "@/lib/entitlements";
import { openOrganizerCaixa, startConnectOnboarding } from "@/lib/peladaBilling";
import { formatCentsEuro } from "@/lib/peladaWallet";
import type { UserProfile } from "@/lib/userRepository";

type Props = {
  profile?: UserProfile | null;
};

/** Botão Caixa no topo; menu expansível com subscrição, caixa e saldo. */
export function ProfileFinanceMenu({ profile }: Props) {
  const returnPath = "/perfil";
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const pro = isProActive(profile?.entitlements);
  const hasCaixa = Boolean(profile?.stripeAccountId);
  const saldoCents = profile?.peladaBalanceCents ?? 0;

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  return (
    <div ref={rootRef} className="relative shrink-0" data-testid="profile-finance-menu">
      <JogaButton
        variant="ghost"
        size="sm"
        className="gap-1.5 text-emerald-300/90 whitespace-nowrap rounded-full px-3 border border-emerald-400/20 bg-emerald-400/8"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        data-testid="profile-finance-toggle"
      >
        <Wallet className="w-3.5 h-3.5" />
        Caixa
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </JogaButton>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 z-30 w-56 rounded-2xl border border-white/10 overflow-hidden shadow-xl"
          style={{ background: "rgba(10,15,26,0.98)" }}
          data-testid="profile-finance-dropdown"
        >
          {hasCaixa ? (
            <button
              type="button"
              className="w-full flex items-center gap-2 px-4 py-3 text-sm font-semibold text-emerald-300/90 hover:bg-white/5 text-left"
              onClick={() => {
                setOpen(false);
                void openOrganizerCaixa(returnPath);
              }}
              data-testid="profile-finance-caixa"
            >
              <Settings className="w-4 h-4 shrink-0" />
              Gerir Caixa
            </button>
          ) : (
            <button
              type="button"
              className="w-full flex items-center gap-2 px-4 py-3 text-sm font-semibold text-emerald-300/90 hover:bg-white/5 text-left"
              onClick={() => {
                setOpen(false);
                void startConnectOnboarding(returnPath);
              }}
              data-testid="profile-finance-caixa"
            >
              <Wallet className="w-4 h-4 shrink-0" />
              Gerir Caixa
            </button>
          )}

          {pro ? (
            <button
              type="button"
              className="w-full flex items-center gap-2 px-4 py-3 text-sm font-semibold text-amber-300/90 hover:bg-white/5 text-left border-t border-white/8"
              onClick={() => {
                setOpen(false);
                void openBillingPortal();
              }}
              data-testid="profile-finance-subscription"
            >
              <Crown className="w-4 h-4 shrink-0" />
              Gerir subscrição
            </button>
          ) : (
            <Link
              href="/premium"
              className="w-full flex items-center gap-2 px-4 py-3 text-sm font-semibold text-amber-300/90 hover:bg-white/5 border-t border-white/8"
              onClick={() => setOpen(false)}
              data-testid="profile-finance-subscription"
            >
              <Crown className="w-4 h-4 shrink-0" />
              Gerir subscrição
            </Link>
          )}

          <div
            className="px-4 py-3 border-t border-white/8"
            data-testid="profile-finance-saldo"
          >
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/35 flex items-center gap-1.5">
              <Coins className="w-3 h-3" />
              Saldo peladas
            </p>
            <p className="font-display font-black text-xl text-amber-300/90 mt-1">
              {formatCentsEuro(saldoCents)}
            </p>
            <p className="text-white/40 text-[11px] mt-1 leading-relaxed">
              {saldoCents > 0
                ? "Usa em peladas com pagamento online."
                : "Crédito ao sair de peladas já pagas."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
