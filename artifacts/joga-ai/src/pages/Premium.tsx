import { Crown, Sparkles, Share2, BarChart3, Star, History, TrendingUp, Check } from "lucide-react";
import { startCheckout, openBillingPortal, type BillingInterval } from "@/lib/billing";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useAuth } from "@/contexts/AuthContext";
import { isProActive } from "@/lib/entitlements";
import { loadMyCommunities, type Community } from "@/lib/communityRepository";
import { useEffect, useRef, useState } from "react";
import { JogaButton, JogaPage } from "@/components/joga";
import { JogaLogo } from "@/components/brand";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { trackEvent } from "@/lib/analytics";
import { monthlyEquivalentFromAnnual, PRICING } from "@/lib/entitlements";
import type { EntitlementPlan } from "@/lib/entitlements";
import { ProCheckoutSuccessDialog } from "@/components/ProCheckoutSuccessDialog";
import { toast } from "@/hooks/use-toast";

const benefits = [
  { icon: Star,      label: "Skins exclusivas",        desc: "Fogo, Raio e Diamante para a tua carta" },
  { icon: BarChart3, label: "Stats avançadas",         desc: "Compara-te com a média da pelada pós-jogo" },
  { icon: History,   label: "Histórico completo",      desc: "Todas as partidas com filtros por comunidade" },
  { icon: TrendingUp,label: "Evolução ilimitada",      desc: "Sem limite de 90 dias no gráfico de evolução" },
  { icon: Sparkles,  label: "Título e Instagram",      desc: "Alcunha na carta e link do Instagram no perfil" },
  { icon: Share2,    label: "Carta em HD",             desc: "Download da carta em alta resolução (4x)" },
];

const premiumSkins = [
  { label: "Ouro",     bg: "linear-gradient(135deg, #78350f, #d97706, #fbbf24, #fef08a)", glow: "rgba(251,191,36,0.5)",  text: "#fef9c3" },
  { label: "Platina",  bg: "linear-gradient(135deg, #334155, #94a3b8, #e2e8f0, #f8fafc)", glow: "rgba(148,163,184,0.4)", text: "#f1f5f9" },
  { label: "Diamante", bg: "linear-gradient(135deg, #1e3a5f, #2563eb, #7dd3fc, #bae6fd)", glow: "rgba(96,165,250,0.5)",  text: "#e0f2fe" },
  { label: "Élite",    bg: "linear-gradient(135deg, #4c1d95, #7c3aed, #c084fc, #f0abfc)", glow: "rgba(192,132,252,0.5)", text: "#fae8ff" },
];

const planFeatures = {
  organizador: [
    "Inclui tudo do PRO Jogador ✦",
    "Painel do clube: pagamentos, presenças e estatísticas da época",
    "Branding do clube (cor, logo e banner)",
    "Mensalistas: define o teu preço mensal e gere quem está em dia",
    "Prioridade no Encontrar Jogos + selo ✦ Clube PRO",
    "Peladas abertas a jogadores externos",
  ],
  jogador: [
    "Skins de carta exclusivas: Fogo, Raio e Diamante",
    "Estatísticas avançadas pós-jogo",
    "Histórico completo de partidas com filtros",
    "Evolução sem limite de 90 dias",
    "Título/alcunha e campo Instagram na carta",
    "Download da carta em HD (4x)",
  ],
};

function formatEuro(value: number): string {
  return value.toFixed(2).replace(".", ",") + "€";
}

type PlanPricingProps = {
  monthlyPrice: number;
  annualPrice: number;
  checkoutBusy: string | null;
  busyKey: string;
  onCheckout: (interval: BillingInterval) => void;
  disabled?: boolean;
  disabledLabel?: string;
  variant?: "gold" | "primary";
};

function PlanPricing({
  monthlyPrice,
  annualPrice,
  checkoutBusy,
  busyKey,
  onCheckout,
  disabled,
  disabledLabel,
  variant = "primary",
}: PlanPricingProps) {
  const monthlyEq = monthlyEquivalentFromAnnual(annualPrice);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div
        className="rounded-2xl p-4"
        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
      >
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/35">Mensal</p>
        <div className="flex items-baseline gap-1 mt-2 mb-4">
          <span className="font-display font-black text-3xl text-white leading-none">{formatEuro(monthlyPrice)}</span>
          <span className="text-white/40 text-sm">/mês</span>
        </div>
        <JogaButton
          variant={variant}
          size="md"
          className="w-full"
          disabled={disabled || checkoutBusy !== null}
          onClick={() => onCheckout("month")}
        >
          {checkoutBusy === `${busyKey}-month`
            ? "A abrir o checkout…"
            : disabled
              ? (disabledLabel ?? "Indisponível")
              : `Escolher mensal — ${formatEuro(monthlyPrice)}/mês`}
        </JogaButton>
      </div>

      <div
        className="rounded-2xl p-4"
        style={{ background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.22)" }}
      >
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-300/70">Anual</p>
        <div className="flex items-baseline gap-1 mt-2">
          <span className="font-display font-black text-3xl text-white leading-none">{monthlyEq}€</span>
          <span className="text-white/40 text-sm">/mês</span>
        </div>
        <p className="text-emerald-400 text-xs font-bold mt-1">
          poupas {formatEuro(monthlyPrice * 12 - annualPrice)} por ano
        </p>
        <p className="text-white/35 text-[11px] mt-0.5">{formatEuro(annualPrice)} cobrados anualmente</p>
        <JogaButton
          variant={variant}
          size="md"
          className="w-full mt-3"
          disabled={disabled || checkoutBusy !== null}
          onClick={() => onCheckout("year")}
        >
          {checkoutBusy === `${busyKey}-year`
            ? "A abrir o checkout…"
            : disabled
              ? (disabledLabel ?? "Indisponível")
              : `Escolher anual — ${formatEuro(annualPrice)}/ano`}
        </JogaButton>
      </div>
    </div>
  );
}

export default function Premium() {
  const { userId } = useAuth();
  const { profile, refresh } = useUserProfile();
  const pro = isProActive(profile?.entitlements);
  const proUntil = profile?.entitlements?.proUntil;
  const proCommunityId = profile?.entitlements?.proCommunityId;
  const [myCommunities, setMyCommunities] = useState<Community[]>([]);
  const [organizerCommunityId, setOrganizerCommunityId] = useState("");
  const daysLeft = proUntil
    ? Math.max(0, Math.ceil((new Date(proUntil).getTime() - Date.now()) / 86400000))
    : null;
  const planLabel = profile?.entitlements?.plan === "organizer_pro" ? "Clube PRO" : "PRO Jogador";
  const [checkoutBusy, setCheckoutBusy] = useState<string | null>(null);
  const [successOpen, setSuccessOpen] = useState(false);
  const [successPlan, setSuccessPlan] = useState<EntitlementPlan | null>(null);
  const [activatingPlan, setActivatingPlan] = useState<EntitlementPlan | null>(null);
  const checkoutHandled = useRef(false);
  useDocumentTitle("Premium");

  useEffect(() => {
    if (!userId) return;
    void loadMyCommunities(userId).then((list) => {
      setMyCommunities(list);
      if (!organizerCommunityId && list[0]?.id) {
        setOrganizerCommunityId(list[0].id);
      }
    });
  }, [userId, organizerCommunityId]);

  const showSubscription = pro || activatingPlan !== null;
  const activePlanLabel = pro
    ? planLabel
    : activatingPlan === "organizer_pro"
      ? "Clube PRO"
      : "PRO Jogador";

  function onCheckoutSuccess(plan: EntitlementPlan) {
    setSuccessPlan(plan);
    setSuccessOpen(true);
    setActivatingPlan(plan);
    void refresh();
  }

  useEffect(() => {
    if (checkoutHandled.current) return;
    const params = new URLSearchParams(window.location.search);
    const status = params.get("checkout");
    const planParam = params.get("plan");
    if (!status) return;

    checkoutHandled.current = true;
    window.history.replaceState({}, "", "/premium");

    if (status === "sucesso") {
      const plan: EntitlementPlan =
        planParam === "organizer_pro" ? "organizer_pro" : "player_pro";
      trackEvent("pro_checkout_success", { plan, interval: "month" });
      onCheckoutSuccess(plan);
    }
    if (status === "cancelado") {
      toast({ title: "Checkout cancelado", description: "Não foste cobrado." });
      setActivatingPlan(null);
    }
  }, [refresh]);

  // Poll até webhook activar PRO (checkout em nova aba ou redirect)
  useEffect(() => {
    if (!activatingPlan) return;

    const tick = () => {
      void refresh().then((p) => {
        if (!isProActive(p?.entitlements)) return;
        if (!successOpen) {
          setSuccessPlan(activatingPlan);
          setSuccessOpen(true);
        }
        setActivatingPlan(null);
      });
    };

    tick();
    const interval = window.setInterval(tick, 1500);
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", onVisible);
    const timeout = window.setTimeout(() => setActivatingPlan(null), 10 * 60 * 1000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [activatingPlan, successOpen, refresh]);

  function runCheckout(plan: EntitlementPlan, interval: BillingInterval, key: string) {
    if (plan === "organizer_pro" && !organizerCommunityId) {
      toast({
        title: "Escolhe o clube",
        description: "O Clube PRO é activado por comunidade — selecciona qual queres tornar PRO.",
        variant: "destructive",
      });
      return;
    }
    setCheckoutBusy(`${key}-${interval === "month" ? "month" : "year"}`);
    setActivatingPlan(plan);
    void startCheckout(
      plan,
      interval,
      plan === "organizer_pro" ? organizerCommunityId : undefined,
    ).finally(() => setCheckoutBusy(null));
  }
  return (
    <JogaPage theme="dark" padded={false}>
      <ProCheckoutSuccessDialog
        open={successOpen}
        onOpenChange={setSuccessOpen}
        plan={successPlan}
      />

      {/* ═══════════════════════════════
          HERO — arena dark
      ═══════════════════════════════ */}
      <div
        className="relative overflow-hidden"
        style={{ background: "linear-gradient(160deg, #050810 0%, #0a1020 40%, #0d1530 100%)" }}
      >
        {/* Gold spotlight */}
        <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 50% -5%, rgba(251,191,36,0.18) 0%, transparent 55%)" }} />
        {/* Diagonal pattern */}
        <div className="absolute inset-0" style={{ backgroundImage: "repeating-linear-gradient(55deg, transparent, transparent 18px, rgba(255,255,255,0.012) 18px, rgba(255,255,255,0.012) 19px)" }} />

        <div className="relative px-5 pt-12 pb-8 text-center">
          <div
            className="w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-5 p-3"
            style={{ background: "linear-gradient(135deg, rgba(251,191,36,0.15), rgba(245,158,11,0.08))", border: "2px solid rgba(251,191,36,0.3)", boxShadow: "0 0 40px rgba(251,191,36,0.15)" }}
          >
            <JogaLogo variant="badge" size="lg" className="h-full w-full" />
          </div>
          <p className="text-amber-400/60 text-[10px] font-black uppercase tracking-[0.3em] mb-2">Desbloqueias tudo</p>
          <h1 className="font-display font-black text-white text-3xl tracking-tight mb-3">Joga AI Premium</h1>
          <p className="text-white/45 text-sm leading-relaxed max-w-xs mx-auto">
            Visual, estatístico e de status. Não podes pagar para evoluir — a carta é tua.
          </p>
        </div>
      </div>

      <div className="px-4 space-y-8 pt-6">

        {/* ═══════════════════════════════
            SKIN PREVIEW
        ═══════════════════════════════ */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-black text-white text-lg">Cartas Premium</h2>
            <span className="text-white/30 text-xs font-bold">4 skins</span>
          </div>
          <div className="flex gap-3 overflow-x-auto -mx-4 px-4 pb-1">
            {premiumSkins.map((skin) => (
              <div
                key={skin.label}
                className="shrink-0 relative overflow-hidden rounded-2xl flex flex-col items-center justify-center"
                style={{ width: 100, height: 140, background: skin.bg, boxShadow: `0 8px 24px ${skin.glow}` }}
                data-testid={`skin-preview-${skin.label.toLowerCase()}`}
              >
                {/* Holographic sheen */}
                <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.12) 0%, transparent 50%, rgba(255,255,255,0.06) 100%)" }} />
                {/* Diagonal hatching */}
                <div className="absolute inset-0" style={{ backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 6px, rgba(255,255,255,0.04) 6px, rgba(255,255,255,0.04) 7px)" }} />
                <span className="relative font-display font-black text-4xl drop-shadow-lg" style={{ color: skin.text }}>{76}</span>
                <span className="relative font-display font-bold text-xs uppercase tracking-widest mt-0.5" style={{ color: `${skin.text}99` }}>AVA</span>
                <div className="relative mt-2 px-3 py-0.5 rounded-full" style={{ background: "rgba(0,0,0,0.25)" }}>
                  <span className="font-black text-[9px] uppercase tracking-wider" style={{ color: skin.text }}>{skin.label}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ═══════════════════════════════
            BENEFITS GRID
        ═══════════════════════════════ */}
        <div>
          <h2 className="font-display font-black text-white text-lg mb-4">O que inclui</h2>
          <div className="grid grid-cols-2 gap-3">
            {benefits.map((b) => {
              const Icon = b.icon;
              return (
                <div
                  key={b.label}
                  className="rounded-2xl p-4 flex flex-col gap-2.5"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
                  data-testid={`benefit-${b.label.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.2)" }}>
                    <Icon className="w-4.5 h-4.5 text-amber-400" style={{ width: 18, height: 18 }} />
                  </div>
                  <p className="font-display font-bold text-white text-sm leading-tight">{b.label}</p>
                  <p className="text-white/35 text-[11px] leading-snug">{b.desc}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* ═══════════════════════════════
            PLANS
        ═══════════════════════════════ */}
        {showSubscription && (
          <div
            className="rounded-3xl p-5 mb-4"
            style={{ background: "rgba(251,191,36,0.08)", border: "1.5px solid rgba(251,191,36,0.35)" }}
            data-testid="subscription-panel"
          >
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-300/70">
              A tua assinatura
            </p>
            <h3 className="font-display font-black text-white text-xl mt-1">{activePlanLabel} ativo ✓</h3>
            {pro && daysLeft != null && proUntil ? (
              <p className="text-white/50 text-sm mt-1">
                Renova a {new Date(proUntil).toLocaleDateString("pt-PT")} · {daysLeft} {daysLeft === 1 ? "dia" : "dias"} restantes
                {proCommunityId && myCommunities.find((c) => c.id === proCommunityId)
                  ? ` · Clube: ${myCommunities.find((c) => c.id === proCommunityId)?.name}`
                  : ""}
              </p>
            ) : (
              <p className="text-amber-200/60 text-sm mt-1">A confirmar pagamento…</p>
            )}
            <button
              type="button"
              onClick={() => void openBillingPortal()}
              disabled={!pro}
              className="mt-3 w-full rounded-2xl py-3 font-black text-sm text-white/85 disabled:opacity-40"
              style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.14)" }}
              data-testid="button-manage-subscription"
            >
              Gerir assinatura — cartão, faturas, cancelar
            </button>
          </div>
        )}

        <div>
          <h2 className="font-display font-black text-white text-lg mb-4">Escolhe o Teu Plano</h2>

          {/* Annual — highlighted */}
          <div
            className="relative rounded-3xl overflow-hidden mb-3"
            style={{ background: "linear-gradient(145deg, #1a1000, #2a1900, #1f1500)", border: "1.5px solid rgba(251,191,36,0.4)", boxShadow: "0 8px 32px rgba(251,191,36,0.15)" }}
            data-testid="premium-card"
          >
            {/* Gold top bar */}
            <div style={{ background: "linear-gradient(90deg, #b45309, #d97706, #fbbf24, #f59e0b)", padding: "6px 16px", textAlign: "center" }}>
              <span className="font-display font-black text-amber-900 text-[11px] uppercase tracking-[0.2em]">✦ O teu clube, a sério ✦</span>
            </div>
            <div className="px-5 py-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Crown className="w-5 h-5 text-amber-400" />
                  <h3 className="font-display font-bold text-white text-lg">Clube PRO</h3>
                </div>
                <div
                  className="px-2.5 py-1 rounded-full text-[11px] font-bold"
                  style={{ background: "rgba(251,191,36,0.15)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.3)" }}
                >
                  9,99€/mês
                </div>
              </div>
              <div className="space-y-2.5 mb-5">
                {planFeatures.organizador.map((f, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ background: "rgba(251,191,36,0.2)" }}>
                      <Check className="w-3 h-3 text-amber-400" strokeWidth={3} />
                    </div>
                    <span
                      className={`text-sm leading-snug ${i === 0 ? "text-amber-300 font-semibold" : "text-white/75"}`}
                    >
                      {f}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-white/45 text-xs mb-3 leading-relaxed">
                Cada assinatura activa o PRO num clube.
              </p>
              <select
                value={organizerCommunityId}
                onChange={(e) => setOrganizerCommunityId(e.target.value)}
                className="w-full rounded-2xl px-4 py-3 text-sm text-white bg-[#0f172a] border border-amber-400/25 outline-none mb-4 [color-scheme:dark]"
                data-testid="select-pro-community"
              >
                <option value="" className="bg-[#0f172a] text-white">Escolhe o clube/comunidade</option>
                {myCommunities.map((c) => (
                  <option key={c.id} value={c.id} className="bg-[#0f172a] text-white">
                    {c.name}
                  </option>
                ))}
              </select>
              <PlanPricing
                monthlyPrice={PRICING.organizerProMonthly}
                annualPrice={PRICING.organizerProAnnual}
                checkoutBusy={checkoutBusy}
                busyKey="organizer"
                variant="gold"
                disabled={!organizerCommunityId}
                disabledLabel="Escolhe o clube"
                onCheckout={(interval) => runCheckout("organizer_pro", interval, "organizer")}
              />
            </div>
          </div>

          {/* PRO Jogador */}
          <div
            className="rounded-3xl overflow-hidden"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
            data-testid="premium-card-jogador"
          >
            <div className="px-5 py-5">
              <div className="flex items-center gap-2 mb-4">
                <Crown className="w-5 h-5 text-white/50" />
                <h3 className="font-display font-bold text-white/80 text-lg">PRO Jogador</h3>
              </div>
              <div className="space-y-2.5 mb-5">
                {planFeatures.jogador.map((f, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ background: "rgba(255,255,255,0.08)" }}>
                      <Check className="w-3 h-3 text-white/50" strokeWidth={3} />
                    </div>
                    <span className="text-white/50 text-sm leading-snug">{f}</span>
                  </div>
                ))}
              </div>
              <PlanPricing
                monthlyPrice={PRICING.playerProMonthly}
                annualPrice={PRICING.playerProAnnual}
                checkoutBusy={checkoutBusy}
                busyKey="player"
                variant="gold"
                onCheckout={(interval) => runCheckout("player_pro", interval, "player")}
              />
            </div>
          </div>
        </div>

        {/* Disclaimer */}
        <div className="text-center pb-4 px-4">
          <div className="w-8 h-0.5 mx-auto mb-4" style={{ background: "rgba(255,255,255,0.08)" }} />
          <p className="text-white/25 text-xs leading-relaxed">
            O Premium não é pay-to-win. Não compras evolução — a tua carta evolui pelo teu desempenho real nos jogos.
          </p>
        </div>

      </div>
    </JogaPage>
  );
}
