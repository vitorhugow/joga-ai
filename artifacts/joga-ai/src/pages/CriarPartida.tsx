import { useEffect, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { ChevronLeft, MapPin, Users, Euro, FileText, Globe, Lock, Repeat } from "lucide-react";
import { JogaButton, JogaPage } from "@/components/joga";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthGate } from "@/contexts/AuthGateContext";
import { useUserProfile } from "@/hooks/useUserProfile";
import { isOrganizerPro } from "@/lib/entitlements";
import { startConnectOnboarding } from "@/lib/peladaBilling";
import { CreditCard } from "lucide-react";
import { ProFeatureBadge } from "@/components/ProFeatureBadge";
import { ProUpgradeDialog } from "@/components/ProUpgradeDialog";
import { createMatch } from "@/lib/matchRepository";
import { calculateOverall } from "@/lib/cardUtils";
import { ProfileSetupDialog } from "@/components/profile/ProfileSetupDialog";
import { toast } from "@/hooks/use-toast";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

const PITCH_BG = `url("data:image/svg+xml,%3Csvg width='80' height='80' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 40 L80 40' stroke='rgba(255,255,255,0.04)' stroke-width='1'/%3E%3Ccircle cx='40' cy='40' r='20' stroke='rgba(255,255,255,0.03)' stroke-width='1' fill='none'/%3E%3C/svg%3E")`;

const MAX_PRICE_EURO = 5;

function parsePriceEuro(price: string): number | null {
  const trimmed = price.trim();
  if (!trimmed || /^gr[aá]tis$/i.test(trimmed)) return null;
  const value = parseFloat(trimmed.replace(",", ".").replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

const gameTypes = [
  { value: "futsal", label: "Futsal", emoji: "🏟️" },
  { value: "fut5", label: "Fut 5", emoji: "⚽" },
  { value: "fut7", label: "Fut 7", emoji: "⚽" },
  { value: "futebol11", label: "Fut 11", emoji: "🏆" },
];

const levels = [
  { value: "recreativo", label: "Recreativo", color: "#4ade80", desc: "Para se divertir" },
  { value: "misto", label: "Misto", color: "#60a5fa", desc: "Todos os níveis" },
  { value: "competitivo", label: "Competitivo", color: "#f87171", desc: "Nível elevado" },
];

function Field({
  label,
  icon,
  proBadge,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  proBadge?: "player" | "organizer";
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.18em] mb-2" style={{ color: "rgba(255,255,255,0.35)" }}>
        {icon}
        {label}
        {proBadge && <ProFeatureBadge tier={proBadge} />}
      </label>
      {children}
    </div>
  );
}

const baseInputStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.06)",
  border: "1.5px solid rgba(255,255,255,0.1)",
  color: "white",
  caretColor: "#4ade80",
};

const focusInputStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.08)",
  border: "1.5px solid rgba(74,222,128,0.4)",
  boxShadow: "0 0 0 3px rgba(74,222,128,0.07)",
  color: "white",
  caretColor: "#4ade80",
};

const inputClass = "w-full px-4 py-3.5 rounded-2xl text-sm font-medium focus:outline-hidden transition-all";

function StyledInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      {...props}
      className={inputClass}
      style={{ ...baseInputStyle, ...(focused ? focusInputStyle : {}) }}
      onFocus={(e) => { setFocused(true); props.onFocus?.(e); }}
      onBlur={(e) => { setFocused(false); props.onBlur?.(e); }}
    />
  );
}

function StyledTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const [focused, setFocused] = useState(false);
  return (
    <textarea
      {...props}
      className={`${inputClass} resize-none`}
      style={{ ...baseInputStyle, ...(focused ? focusInputStyle : {}) }}
      onFocus={(e) => { setFocused(true); props.onFocus?.(e); }}
      onBlur={(e) => { setFocused(false); props.onBlur?.(e); }}
    />
  );
}

export default function CriarPartida() {
  useDocumentTitle("Criar Partida");
  const [, setLocation] = useLocation();
  const search = useSearch();
  const communityId = new URLSearchParams(search).get("communityId") ?? undefined;
  const { userId } = useAuth();
  const { requireLinked } = useAuthGate();
  const { profile, needsSetup, refresh } = useUserProfile();
  const orgPro = isOrganizerPro(profile?.entitlements);
  const [repeatWeeks, setRepeatWeeks] = useState(1);
  const [paymentsEnabled, setPaymentsEnabled] = useState(false);
  const hasStripeAccount = Boolean(profile?.stripeAccountId);
  const [showProRepeatDialog, setShowProRepeatDialog] = useState(false);
  const [showProOpenDialog, setShowProOpenDialog] = useState(false);

  function addDaysIso(dateIso: string, days: number): string {
    const d = new Date(`${dateIso}T12:00:00`);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }
  const [showSetup, setShowSetup] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    title: "",
    city: "",
    location: "",
    gameType: "fut7",
    level: "recreativo",
    date: "",
    time: "",
    maxPlayers: "14",
    price: "",
    openToExternal: communityId ? false : true,
    notes: "",
  });

  useEffect(() => {
    if (communityId) {
      // Clube PRO pode abrir peladas da comunidade ao público
      if (!orgPro) setForm((prev) => ({ ...prev, openToExternal: false }));
    }
  }, [communityId, orgPro]);

  function set(key: string, value: string | boolean) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!requireLinked({
      mode: "register",
      title: "Cria conta para organizar partidas",
      description: "Precisas de uma conta para criar e gerir peladas.",
    })) {
      return;
    }
    if (needsSetup || !profile.profileComplete) {
      setShowSetup(true);
      return;
    }
    if (repeatWeeks > 1 && !orgPro) {
      setShowProRepeatDialog(true);
      return;
    }

    const priceEuro = parsePriceEuro(form.price);
    if (priceEuro !== null && priceEuro > MAX_PRICE_EURO) {
      toast({
        title: "Preço máximo 5€",
        description: "O pagamento por jogador não pode passar de 5€.",
        variant: "destructive",
      });
      return;
    }
    if (paymentsEnabled && hasStripeAccount) {
      if (priceEuro === null) {
        toast({
          title: "Preço obrigatório",
          description: "Define um preço entre 0,50€ e 5€ para activar pagamentos na app.",
          variant: "destructive",
        });
        return;
      }
      if (priceEuro < 0.5) {
        toast({
          title: "Preço mínimo 0,50€",
          description: "Para pagamentos na app, o preço mínimo é 0,50€ por jogador.",
          variant: "destructive",
        });
        return;
      }
    }

    setSubmitting(true);
    try {
      const matchId = await createMatch({
        title: form.title,
        city: form.city,
        location: form.location,
        gameType: form.gameType,
        level: form.level,
        date: form.date,
        time: form.time,
        maxPlayers: Number(form.maxPlayers) || 14,
        price: form.price,
        paymentsEnabled: paymentsEnabled && hasStripeAccount,
        proBadge: orgPro,
        openToExternal: form.openToExternal,
        notes: form.notes,
        organizerId: userId,
        organizerName: profile.displayName,
        organizerPosition: profile.position,
        organizerOverall: calculateOverall(profile.attributes),
        communityId,
      });
      // Clube PRO: cria as ocorrências seguintes (semanais)
      if (orgPro && repeatWeeks > 1) {
        for (let week = 1; week < repeatWeeks; week++) {
          try {
            await createMatch({
              title: form.title,
              city: form.city,
              location: form.location,
              gameType: form.gameType,
              level: form.level,
              date: addDaysIso(form.date, week * 7),
              time: form.time,
              maxPlayers: Number(form.maxPlayers) || 14,
              price: form.price,
        paymentsEnabled: paymentsEnabled && hasStripeAccount,
        proBadge: orgPro,
              openToExternal: form.openToExternal,
              notes: form.notes,
              organizerId: userId,
              organizerName: profile.displayName,
              organizerPosition: profile.position,
              organizerOverall: calculateOverall(profile.attributes),
              communityId,
            });
          } catch (err) {
            console.warn("[CriarPartida] ocorrência semanal", week, err);
          }
        }
        toast({ title: `${repeatWeeks} peladas criadas 🔁`, description: "Uma por semana, mesmas definições." });
      }
      setLocation(`/partida/${matchId}/pre-jogo`);
    } catch (err) {
      console.error(err);
      toast({ title: "Não foi possível criar a partida. Tenta outra vez.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <JogaPage theme="dark" padded={false}>
      <ProfileSetupDialog
        open={showSetup}
        onOpenChange={setShowSetup}
        dismissible
        onComplete={() => void refresh()}
      />

      <div className="relative overflow-hidden" style={{ background: "linear-gradient(155deg, #031408 0%, #052010 28%, #0a5a1e 65%, #0d6826 100%)" }}>
        <div className="absolute inset-0" style={{ backgroundImage: PITCH_BG, backgroundSize: "80px 80px" }} />
        <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 50% 110%, rgba(22,163,74,0.2) 0%, transparent 60%)" }} />

        <div className="relative flex items-center justify-between px-4 pt-6 pb-10">
          <button type="button" onClick={() => setLocation("/jogos")} className="w-10 h-10 rounded-2xl flex items-center justify-center active:scale-95 transition-transform" style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)" }} data-testid="button-back">
            <ChevronLeft className="w-5 h-5 text-white" />
          </button>
          <div className="text-center py-1">
            <p className="text-white/35 text-[10px] font-black uppercase tracking-[0.22em]">Nova</p>
            <h1 className="font-display font-black text-white text-xl tracking-tight leading-tight">Criar Partida</h1>
          </div>
          <div className="w-10" />
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-9" style={{ background: "#0a0f1a", borderRadius: "20px 20px 0 0" }} />
      </div>

      <form onSubmit={handleSubmit} className="px-4 pt-5 space-y-5 pb-8">
        <Field label="Nome da Partida">
          <StyledInput type="text" placeholder="Ex: Peladinha de Sexta" value={form.title} onChange={(e) => set("title", e.target.value)} data-testid="input-match-title" required />
        </Field>

        <Field label="Tipo de Futebol">
          <div className="grid grid-cols-4 gap-2">
            {gameTypes.map((t) => {
              const active = form.gameType === t.value;
              return (
                <button key={t.value} type="button" onClick={() => set("gameType", t.value)} className="py-3 rounded-2xl flex flex-col items-center gap-1 transition-all active:scale-95"
                  style={active ? { background: "linear-gradient(135deg, #15803d, #16a34a)", boxShadow: "0 4px 12px rgba(22,163,74,0.35)" } : { background: "rgba(255,255,255,0.05)", border: "1.5px solid rgba(255,255,255,0.09)" }}
                  data-testid={`game-type-${t.value}`}
                >
                  <span className="text-base">{t.emoji}</span>
                  <span className="text-[11px] font-black" style={{ color: active ? "white" : "rgba(255,255,255,0.45)" }}>{t.label}</span>
                </button>
              );
            })}
          </div>
        </Field>

        <Field label="Nível do Jogo">
          <div className="grid grid-cols-3 gap-2">
            {levels.map((l) => {
              const active = form.level === l.value;
              return (
                <button key={l.value} type="button" onClick={() => set("level", l.value)} className="py-3.5 px-2 rounded-2xl flex flex-col items-center gap-0.5 transition-all active:scale-95"
                  style={active ? { background: `${l.color}14`, border: `2px solid ${l.color}44` } : { background: "rgba(255,255,255,0.05)", border: "1.5px solid rgba(255,255,255,0.09)" }}
                  data-testid={`level-${l.value}`}
                >
                  <span className="font-display font-black text-sm" style={{ color: active ? l.color : "rgba(255,255,255,0.6)" }}>{l.label}</span>
                  <span className="text-[10px]" style={{ color: active ? `${l.color}88` : "rgba(255,255,255,0.25)" }}>{l.desc}</span>
                </button>
              );
            })}
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Cidade" icon={<MapPin className="w-3 h-3" />}>
            <StyledInput type="text" placeholder="Lisboa" value={form.city} onChange={(e) => set("city", e.target.value)} data-testid="input-city" />
          </Field>
          <Field label="Campo">
            <StyledInput type="text" placeholder="Nome do campo" value={form.location} onChange={(e) => set("location", e.target.value)} data-testid="input-location" />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Data">
            <StyledInput type="date" value={form.date} onChange={(e) => set("date", e.target.value)} data-testid="input-date" />
          </Field>
          <Field label="Hora">
            <StyledInput type="time" value={form.time} onChange={(e) => set("time", e.target.value)} data-testid="input-time" />
          </Field>
        </div>

        <Field label="Repetir semanalmente" icon={<Repeat className="w-3 h-3" />} proBadge="organizer">
          <select
            value={repeatWeeks}
            onChange={(e) => setRepeatWeeks(Number(e.target.value))}
            className="w-full rounded-2xl px-4 py-3.5 text-sm text-white bg-[#0f172a] border border-white/20 outline-none focus:border-emerald-500/60 [color-scheme:dark]"
            data-testid="select-repeat-weeks"
          >
            <option value={1} className="bg-[#0f172a] text-white">1 semana (só esta pelada)</option>
            <option value={2} className="bg-[#0f172a] text-white">2 semanas (2 peladas)</option>
            <option value={3} className="bg-[#0f172a] text-white">3 semanas (3 peladas)</option>
            <option value={4} className="bg-[#0f172a] text-white">4 semanas (4 peladas)</option>
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Nº Jogadores" icon={<Users className="w-3 h-3" />}>
            <StyledInput type="number" min="4" max="22" value={form.maxPlayers} onChange={(e) => set("maxPlayers", e.target.value)} data-testid="input-max-players" />
          </Field>
          <Field label="Preço/Jogador" icon={<Euro className="w-3 h-3" />}>
            <StyledInput type="text" placeholder="Grátis ou até 5€" value={form.price} onChange={(e) => set("price", e.target.value)} data-testid="input-price" />
            <p className="text-[10px] mt-1.5" style={{ color: "rgba(255,255,255,0.3)" }}>Máximo 5€ por jogador</p>
          </Field>
        </div>

        {/* ── Pagamentos na app (opt-in por pelada) ── */}
        <div className="rounded-2xl p-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <p className="text-white/50 text-[10px] font-black uppercase tracking-[0.18em] flex items-center gap-1.5">
            <CreditCard className="w-3 h-3" /> Pagamentos na app
          </p>
          {hasStripeAccount ? (
            <button
              type="button"
              onClick={() => setPaymentsEnabled((v) => !v)}
              className="mt-2 w-full rounded-xl py-2.5 text-xs font-black"
              style={{
                background: paymentsEnabled ? "rgba(74,222,128,0.16)" : "rgba(255,255,255,0.05)",
                border: `1px solid ${paymentsEnabled ? "rgba(74,222,128,0.5)" : "rgba(255,255,255,0.12)"}`,
                color: paymentsEnabled ? "#4ade80" : "rgba(255,255,255,0.6)",
              }}
              data-testid="button-toggle-payments"
            >
              {paymentsEnabled
                ? "✓ Jogadores podem pagar pela app (recebes direto na tua conta)"
                : "Ativar pagamentos nesta pelada"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void startConnectOnboarding()}
              className="mt-2 w-full rounded-xl py-2.5 text-xs font-black text-white/70"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px dashed rgba(255,255,255,0.16)" }}
              data-testid="button-connect-stripe"
            >
              Ligar conta de pagamentos (2 min) para receber pela app
            </button>
          )}
          <p className="text-white/30 text-[11px] mt-2">
            Preço vai 100% para ti. O jogador paga +0,50€ de taxa de serviço em cada pagamento na app. Podes sempre marcar pagamentos manuais.
          </p>
        </div>

        <div className="flex items-center justify-between px-4 py-4 rounded-2xl" style={{ background: "rgba(255,255,255,0.05)", border: "1.5px solid rgba(255,255,255,0.08)" }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: form.openToExternal ? "rgba(74,222,128,0.12)" : "rgba(255,255,255,0.06)" }}>
              {form.openToExternal ? <Globe className="w-5 h-5 text-emerald-400" /> : <Lock className="w-5 h-5" style={{ color: "rgba(255,255,255,0.35)" }} />}
            </div>
            <div>
              <p className="text-sm font-bold text-white">Aberto a externos</p>
              <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
                {communityId && !orgPro
                  ? "Exclusivo Clube PRO"
                  : form.openToExternal
                    ? "Qualquer jogador pode entrar"
                    : "Apenas da comunidade"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              if (communityId && !orgPro) {
                setShowProOpenDialog(true);
                return;
              }
              set("openToExternal", !form.openToExternal);
            }}
            className="relative rounded-full transition-colors shrink-0"
            style={{
              background: form.openToExternal ? "#16a34a" : "rgba(255,255,255,0.12)",
              width: 48,
              height: 28,
              opacity: communityId && !orgPro ? 0.5 : 1,
            }}
            data-testid="toggle-open-external"
          >
            <div className="absolute top-0.5 w-6 h-6 rounded-full bg-white shadow-md transition-all" style={{ left: form.openToExternal ? "calc(100% - 26px)" : "2px" }} />
          </button>
        </div>

        <Field label="Observações" icon={<FileText className="w-3 h-3" />}>
          <StyledTextarea placeholder="Informações adicionais sobre a partida..." value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={3} data-testid="input-notes" />
        </Field>

        <JogaButton type="submit" variant="primary" size="lg" className="gap-3" data-testid="button-submit-match" disabled={submitting}>
          {submitting ? "A criar…" : "⚽ Criar Partida"}
        </JogaButton>
      </form>

      <ProUpgradeDialog
        open={showProRepeatDialog}
        onOpenChange={setShowProRepeatDialog}
        tier="organizer"
        featureTitle="Peladas recorrentes"
        featureDescription="Cria até 4 semanas de peladas de uma vez, com a mesma hora e definições — exclusivo Clube PRO."
      />
      <ProUpgradeDialog
        open={showProOpenDialog}
        onOpenChange={setShowProOpenDialog}
        tier="organizer"
        featureTitle="Pelada aberta ao público"
        featureDescription="Com Clube PRO, podes publicar peladas da tua comunidade no Encontrar Jogos para qualquer jogador entrar."
      />
    </JogaPage>
  );
}
