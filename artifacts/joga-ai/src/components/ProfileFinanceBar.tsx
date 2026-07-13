import { Coins, Crown, Settings, Wallet } from "lucide-react";
import { Link } from "wouter";
import { JogaButton } from "@/components/joga";
import { openBillingPortal } from "@/lib/billing";
import { isProActive } from "@/lib/entitlements";
import { openOrganizerCaixa, startConnectOnboarding } from "@/lib/peladaBilling";
import { formatCentsEuro } from "@/lib/peladaWallet";
import type { UserProfile } from "@/lib/userRepository";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type Props = {
  profile?: UserProfile | null;
  className?: string;
};

/** Botões compactos de subscrição, caixa e saldo — topo do perfil. */
export function ProfileFinanceBar({ profile, className }: Props) {
  const returnPath = "/perfil";
  const pro = isProActive(profile?.entitlements);
  const hasCaixa = Boolean(profile?.stripeAccountId);
  const saldoCents = profile?.peladaBalanceCents ?? 0;

  function showSaldoInfo() {
    toast({
      title: `Saldo: ${formatCentsEuro(saldoCents)}`,
      description:
        saldoCents > 0
          ? "Usa em peladas com pagamento online. O organizador recebe na Caixa quando a pelada termina."
          : "Se saíres de uma pelada já paga, o preço fica aqui (a taxa de 0,50€ não). O dinheiro fica seguro até o jogo acabar.",
    });
  }

  return (
    <div
      className={cn("flex items-center gap-1.5 shrink-0", className)}
      data-testid="profile-finance-bar"
    >
      {pro ? (
        <JogaButton
          variant="ghost"
          size="sm"
          className="rounded-full px-2.5 gap-1 text-amber-300/90 border border-amber-400/20 bg-amber-400/8 whitespace-nowrap"
          onClick={() => void openBillingPortal()}
          data-testid="profile-finance-subscription"
        >
          <Crown className="w-3.5 h-3.5" />
          Gerir subscrição
        </JogaButton>
      ) : (
        <Link href="/premium">
          <JogaButton
            variant="ghost"
            size="sm"
            className="rounded-full px-2.5 gap-1 text-amber-300/90 border border-amber-400/20 bg-amber-400/8 whitespace-nowrap"
            data-testid="profile-finance-subscription"
          >
            <Crown className="w-3.5 h-3.5" />
            Gerir subscrição
          </JogaButton>
        </Link>
      )}

      {hasCaixa ? (
        <JogaButton
          variant="ghost"
          size="sm"
          className="rounded-full px-2.5 gap-1 text-emerald-300/90 border border-emerald-400/20 bg-emerald-400/8 whitespace-nowrap"
          onClick={() => void openOrganizerCaixa(returnPath)}
          data-testid="profile-finance-caixa"
        >
          <Settings className="w-3.5 h-3.5" />
          Gerir Caixa
        </JogaButton>
      ) : (
        <JogaButton
          variant="ghost"
          size="sm"
          className="rounded-full px-2.5 gap-1 text-emerald-300/90 border border-emerald-400/20 bg-emerald-400/8 whitespace-nowrap"
          onClick={() => void startConnectOnboarding(returnPath)}
          data-testid="profile-finance-caixa"
        >
          <Wallet className="w-3.5 h-3.5" />
          Gerir Caixa
        </JogaButton>
      )}

      <JogaButton
        variant="ghost"
        size="sm"
        className="rounded-full px-2.5 gap-1 text-white/70 border border-white/10 bg-white/5 whitespace-nowrap"
        onClick={showSaldoInfo}
        data-testid="profile-finance-saldo"
      >
        <Coins className="w-3.5 h-3.5" />
        Saldo peladas
        <span className="font-display font-black text-amber-300/90">{formatCentsEuro(saldoCents)}</span>
      </JogaButton>
    </div>
  );
}
