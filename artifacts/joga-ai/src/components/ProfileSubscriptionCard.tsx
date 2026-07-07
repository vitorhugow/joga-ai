import { Link } from "wouter";
import { Crown } from "lucide-react";
import { JogaButton } from "@/components/joga";
import { openBillingPortal } from "@/lib/billing";
import { isOrganizerPro, isProActive } from "@/lib/entitlements";
import type { UserProfile } from "@/lib/userRepository";
import { ProFeatureBadge } from "@/components/ProFeatureBadge";

type Props = {
  profile?: UserProfile | null;
};

export function ProfileSubscriptionCard({ profile }: Props) {
  const ent = profile?.entitlements;
  const pro = isProActive(ent);
  const org = isOrganizerPro(ent);
  const proUntil = ent?.proUntil;
  const daysLeft = proUntil
    ? Math.max(0, Math.ceil((new Date(proUntil).getTime() - Date.now()) / 86400000))
    : null;

  if (!pro) {
    return (
      <div
        className="rounded-2xl p-4"
        style={{ background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.22)" }}
        data-testid="profile-subscription-upsell"
      >
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-300/70">
          Subscrição
        </p>
        <p className="text-white/55 text-sm mt-1">
          Desbloqueia skins, evolução completa, export HD e ferramentas de organizador.
        </p>
        <Link href="/premium" className="block mt-3">
          <JogaButton variant="gold" size="sm" className="w-full gap-2">
            <Crown className="w-4 h-4" />
            Ver planos PRO
          </JogaButton>
        </Link>
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl p-4"
      style={{
        background: org ? "rgba(250,204,21,0.1)" : "rgba(251,191,36,0.08)",
        border: org ? "1.5px solid rgba(250,204,21,0.4)" : "1.5px solid rgba(251,191,36,0.3)",
      }}
      data-testid="profile-subscription-panel"
    >
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-300/70">
        A tua subscrição
      </p>
      <div className="flex flex-wrap gap-2 mt-2">
        <ProFeatureBadge tier="player" />
        {org && <ProFeatureBadge tier="organizer" />}
      </div>
      {daysLeft != null && proUntil && (
        <p className="text-white/50 text-sm mt-2">
          Renova a {new Date(proUntil).toLocaleDateString("pt-PT")} · {daysLeft}{" "}
          {daysLeft === 1 ? "dia" : "dias"} restantes
        </p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
        <Link href="/premium">
          <JogaButton variant="ghost" size="sm" className="w-full">
            Detalhes do plano
          </JogaButton>
        </Link>
        <JogaButton
          variant="ghost"
          size="sm"
          className="w-full"
          onClick={() => void openBillingPortal()}
        >
          Gerir assinatura
        </JogaButton>
      </div>
    </div>
  );
}
