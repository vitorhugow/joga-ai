import { Coins } from "lucide-react";
import type { UserProfile } from "@/lib/userRepository";
import { formatCentsEuro } from "@/lib/peladaWallet";

type Props = {
  profile?: UserProfile | null;
};

/** Saldo interno para pagar peladas futuras (crédito ao sair de jogos pagos). */
export function ProfilePeladaSaldoCard({ profile }: Props) {
  const cents = profile?.peladaBalanceCents ?? 0;
  const hasSaldo = cents > 0;

  return (
    <div
      className="rounded-2xl p-4"
      style={{
        background: hasSaldo ? "rgba(251,191,36,0.08)" : "rgba(255,255,255,0.04)",
        border: hasSaldo
          ? "1.5px solid rgba(251,191,36,0.35)"
          : "1px solid rgba(255,255,255,0.1)",
      }}
      data-testid="profile-pelada-saldo-card"
    >
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40 flex items-center gap-1.5">
        <Coins className="w-3 h-3" />
        Saldo peladas
      </p>

      <p className="text-white font-bold text-2xl mt-2 font-display">
        {formatCentsEuro(cents)}
      </p>

      <p className="text-white/45 text-xs mt-2 leading-relaxed">
        {hasSaldo
          ? "Usa este saldo ao confirmar presença em peladas com pagamento online — sem cartão."
          : "Se saíres de uma pelada já paga, o valor fica aqui para jogos futuros (sem reembolso em dinheiro)."}
      </p>
    </div>
  );
}
