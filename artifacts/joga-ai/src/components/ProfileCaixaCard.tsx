import { Settings, Wallet } from "lucide-react";
import { JogaButton } from "@/components/joga";
import { openOrganizerCaixa, startConnectOnboarding } from "@/lib/peladaBilling";
import type { UserProfile } from "@/lib/userRepository";

type Props = {
  profile?: UserProfile | null;
};

/** Carteira do organizador — receber pagamentos de peladas (Stripe Connect). */
export function ProfileCaixaCard({ profile }: Props) {
  const returnPath = "/perfil";
  const hasCaixa = Boolean(profile?.stripeAccountId);

  return (
    <div
      className="rounded-2xl p-4"
      style={{
        background: hasCaixa ? "rgba(74,222,128,0.08)" : "rgba(255,255,255,0.04)",
        border: hasCaixa
          ? "1.5px solid rgba(74,222,128,0.3)"
          : "1px solid rgba(255,255,255,0.1)",
      }}
      data-testid="profile-caixa-card"
    >
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40 flex items-center gap-1.5">
        <Wallet className="w-3 h-3" />
        Caixa
      </p>

      {hasCaixa ? (
        <>
          <p className="text-white font-bold text-sm mt-2">Caixa ligada ✓</p>
          <p className="text-white/45 text-xs mt-1 leading-relaxed">
            Fica activa para todas as peladas com pagamento online. Os pagamentos dos jogadores só chegam à Caixa quando inicias a pelada (ao vivo) — assim ninguém levanta antes de um jogador poder sair.
          </p>
          <JogaButton
            variant="ghost"
            size="sm"
            className="w-full mt-3 gap-2"
            onClick={() => void openOrganizerCaixa(returnPath)}
          >
            <Settings className="w-4 h-4" />
            Gerir Caixa
          </JogaButton>
        </>
      ) : (
        <>
          <p className="text-white/55 text-sm mt-2 leading-relaxed">
            Liga a tua Caixa uma vez (~2 min, pessoa individual) e recebe em todas as peladas online.
          </p>
          <JogaButton
            variant="gold"
            size="sm"
            className="w-full mt-3 gap-2"
            onClick={() => void startConnectOnboarding(returnPath)}
          >
            <Wallet className="w-4 h-4" />
            Ligar Caixa
          </JogaButton>
        </>
      )}
    </div>
  );
}
