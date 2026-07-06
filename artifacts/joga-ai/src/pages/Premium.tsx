import { Crown, Sparkles, Share2, BarChart3, Star, Shield, Check } from "lucide-react";
import { startCheckout, type BillingInterval } from "@/lib/billing";
import { useState } from "react";
import { JogaButton, JogaPage } from "@/components/joga";
import { JogaLogo } from "@/components/brand";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { monthlyEquivalentFromAnnual, PRICING } from "@/lib/entitlements";
import type { EntitlementPlan } from "@/lib/entitlements";

const benefits = [
  { icon: Star,     label: "Cartas Premium",       desc: "Skins exclusivas ouro, prata, diamante e élite" },
  { icon: Share2,   label: "Exportar para Story",   desc: "Partilha a tua carta no Instagram com estilo" },
  { icon: BarChart3,label: "Estatísticas Avançadas",desc: "Análise detalhada do teu desempenho" },
  { icon: Crown,    label: "Perfil em Destaque",    desc: "Apareces em primeiro nos rankings e buscas" },
  { icon: Shield,   label: "Prioridade em Jogos",   desc: "Garantia de vaga nos jogos públicos" },
  { icon: Sparkles, label: "Título Personalizado",  desc: '"Matador", "Maestro", "Muralha" e mais' },
];

const premiumSkins = [
  { label: "Ouro",     bg: "linear-gradient(135deg, #78350f, #d97706, #fbbf24, #fef08a)", glow: "rgba(251,191,36,0.5)",  text: "#fef9c3" },
  { label: "Platina",  bg: "linear-gradient(135deg, #334155, #94a3b8, #e2e8f0, #f8fafc)", glow: "rgba(148,163,184,0.4)", text: "#f1f5f9" },
  { label: "Diamante", bg: "linear-gradient(135deg, #1e3a5f, #2563eb, #7dd3fc, #bae6fd)", glow: "rgba(96,165,250,0.5)",  text: "#e0f2fe" },
  { label: "Élite",    bg: "linear-gradient(135deg, #4c1d95, #7c3aed, #c084fc, #f0abfc)", glow: "rgba(192,132,252,0.5)", text: "#fae8ff" },
];

const planFeatures = {
  organizador: [
    "Peladas sem taxa para os teus jogadores (até 50 pagamentos/mês)",
    "Peladas recorrentes automáticas (semanais ou do mês inteiro)",
    "Lembretes de pagamento automáticos aos pendentes",
    "Histórico ilimitado da comunidade",
    "Inclui tudo do PRO Jogador",
  ],
  jogador: [
    "Skins premium da carta: Fogo, Raio e Diamante",
    "Histórico de evolução completo (grátis: últimos 3 meses)",
    "Instagram visível no teu perfil",
    "Download da carta em alta resolução (4x)",
    "Estatísticas avançadas — mais por vir",
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
          <span className="font-display font-black text-3xl text-white leading-none">{formatEuro(annualPrice)}</span>
          <span className="text-white/40 text-sm">/ano</span>
        </div>
        <p className="text-emerald-400 text-xs font-bold mt-1">
          equivalente a {monthlyEq}€/mês
        </p>
        <p className="text-white/35 text-[11px] mt-0.5">Pagamento anual</p>
        <JogaButton
          variant={variant === "gold" ? "gold" : "primary"}
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
  const [checkoutBusy, setCheckoutBusy] = useState<string | null>(null);
  useDocumentTitle("Premium");

  function runCheckout(plan: EntitlementPlan, interval: BillingInterval, key: string) {
    setCheckoutBusy(`${key}-${interval === "month" ? "month" : "year"}`);
    void startCheckout(plan, interval).finally(() => setCheckoutBusy(null));
  }
  return (
    <JogaPage theme="dark" padded={false}>

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
              <span className="font-display font-black text-amber-900 text-[11px] uppercase tracking-[0.2em]">✦ Para quem organiza ✦</span>
            </div>
            <div className="px-5 py-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Crown className="w-5 h-5 text-amber-400" />
                  <h3 className="font-display font-bold text-white text-lg">PRO Organizador</h3>
                </div>
                <div
                  className="px-2.5 py-1 rounded-full text-[11px] font-bold"
                  style={{ background: "rgba(74,222,128,0.15)", color: "#4ade80", border: "1px solid rgba(74,222,128,0.3)" }}
                >
                  Brevemente
                </div>
              </div>
              <div className="space-y-2.5 mb-5">
                {planFeatures.organizador.map((f, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ background: "rgba(251,191,36,0.2)" }}>
                      <Check className="w-3 h-3 text-amber-400" strokeWidth={3} />
                    </div>
                    <span className="text-white/75 text-sm leading-snug">{f}</span>
                  </div>
                ))}
              </div>
              <PlanPricing
                monthlyPrice={PRICING.organizerProMonthly}
                annualPrice={PRICING.organizerProAnnual}
                checkoutBusy={checkoutBusy}
                busyKey="organizer"
                variant="gold"
                disabled
                disabledLabel="Chega com os pagamentos de pelada"
                onCheckout={() => {}}
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
