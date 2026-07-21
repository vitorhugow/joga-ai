import { useEffect, useState } from "react";
import { JogaButton, JogaCard } from "@/components/joga";
import {
  loadMensalistaStatus,
  countActiveMensalistas,
  startMensalistaCheckout,
  openMensalistaPortal,
  type MensalistaStatus,
} from "@/lib/mensalistaRepository";
import type { Community } from "@/lib/communityRepository";
import { toast } from "@/hooks/use-toast";

type MensalistaCardProps = {
  community: Community;
  userId?: string;
};

export function MensalistaCard({ community, userId }: MensalistaCardProps) {
  const [status, setStatus] = useState<MensalistaStatus | null>(null);
  const [activeCount, setActiveCount] = useState(0);
  const [busy, setBusy] = useState(false);

  const config = community.mensalista;
  const enabled = config?.enabled === true;

  useEffect(() => {
    if (!community.id || !userId || !enabled) return;
    void loadMensalistaStatus(community.id, userId).then(setStatus);
    void countActiveMensalistas(community.id).then(setActiveCount);
  }, [community.id, userId, enabled]);

  if (!enabled || !config) return null;
  if (!community.isMember && community.adminId !== userId) return null;

  const priceLabel = (config.priceCents / 100).toFixed(2).replace(".", ",") + "€/mês";
  const maxSlots = config.maxSlots;
  const slotsLeft =
    maxSlots != null && maxSlots > 0 ? Math.max(0, maxSlots - activeCount) : null;

  async function handleSubscribe() {
    if (!userId) return;
    setBusy(true);
    try {
      const url = await startMensalistaCheckout(community.id);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast({
        title: "Não foi possível pagar a mensalidade",
        description: err instanceof Error ? err.message : "Tenta mais tarde.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleManage() {
    setBusy(true);
    try {
      const url = await openMensalistaPortal(community.id);
      window.location.href = url;
    } catch (err) {
      toast({
        title: "Portal indisponível",
        description: err instanceof Error ? err.message : "Tenta mais tarde.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  const isActive = status?.active === true;
  // Pagamentos avulsos (novo modelo) não têm subscriptionId — só quem ainda
  // tem uma subscrição Stripe de antes da mudança para MB WAY é que pode
  // "gerir" (cancelar) algo recorrente.
  const hasLegacySubscription = Boolean(status?.subscriptionId);
  const validUntilLabel = status?.currentPeriodEnd
    ? new Date(status.currentPeriodEnd).toLocaleDateString("pt-PT")
    : null;

  return (
    <JogaCard variant="arena" padding="md" data-testid="mensalista-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-white/35 text-[10px] font-black uppercase tracking-[0.2em]">Passe mensal</p>
          <h3 className="font-display font-black text-white text-lg mt-1">Mensalista</h3>
          <p className="text-white/55 text-sm mt-1">
            {priceLabel} — isento de pagar cada pelada neste clube.
          </p>
          {slotsLeft != null && !isActive && (
            <p className="text-amber-300/90 text-xs font-semibold mt-2">
              {slotsLeft > 0 ? `${slotsLeft} vagas restantes` : "Sem vagas disponíveis"}
            </p>
          )}
        </div>
        {isActive && (
          <span className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black uppercase bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
            Activo
          </span>
        )}
      </div>

      {isActive && validUntilLabel && (
        <p className="text-white/45 text-xs mt-3">
          {hasLegacySubscription
            ? status?.cancelAtPeriodEnd
              ? `Termina a ${validUntilLabel} — até lá continuas isento.`
              : `Renova a ${validUntilLabel}.`
            : `Válido até ${validUntilLabel}. No mês seguinte tens de pagar outra vez — não há renovação automática.`}
        </p>
      )}

      <div className="mt-4">
        {isActive && hasLegacySubscription ? (
          <JogaButton variant="ghost" size="sm" className="w-full" disabled={busy} onClick={() => void handleManage()}>
            Gerir subscrição
          </JogaButton>
        ) : isActive ? null : slotsLeft === 0 ? (
          <JogaButton variant="ghost" size="sm" className="w-full" disabled>
            Esgotado
          </JogaButton>
        ) : (
          <JogaButton variant="gold" size="sm" className="w-full" disabled={busy} onClick={() => void handleSubscribe()}>
            Pagar mensalidade
          </JogaButton>
        )}
      </div>
    </JogaCard>
  );
}
