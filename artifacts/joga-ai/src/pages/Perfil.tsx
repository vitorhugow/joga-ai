import { useEffect, useState } from "react";
import { Share2, TrendingUp, ChevronRight, Shield, LogOut, Link2 } from "lucide-react";
import { JogaButton, JogaCard, JogaChip, JogaPage } from "@/components/joga";
import { Link } from "wouter";
import { PlayerCard } from "@/components/PlayerCard";
import { profileToPlayerCard } from "@/lib/userRepository";
import { loadMyCommunities, type Community } from "@/lib/communityRepository";
import { loadUserMatchHistory, type UserMatchHistoryEntry } from "@/lib/matchHistoryRepository";
import { calculateOverall } from "@/lib/cardUtils";
import { useUserId, useAuth } from "@/contexts/AuthContext";
import { useAuthGate } from "@/contexts/AuthGateContext";
import { useUserProfile } from "@/hooks/useUserProfile";
import { ProfileSetupDialog } from "@/components/profile/ProfileSetupDialog";
import { toast } from "@/hooks/use-toast";

/* ─── Pitch SVG texture ─── */
const PITCH_BG = `url("data:image/svg+xml,%3Csvg width='80' height='80' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 40 L80 40' stroke='rgba(255,255,255,0.05)' stroke-width='1'/%3E%3Ccircle cx='40' cy='40' r='20' stroke='rgba(255,255,255,0.04)' stroke-width='1' fill='none'/%3E%3C/svg%3E")`;

type BadgeItem = { id: string; name: string; icon: string; rarity: "gold" | "silver" | "bronze"; desc: string };
type PastCardItem = { season: string; overall: number; position: string; current: boolean };

/* ─── Stat tile ─── */
function StatTile({ icon, label, value, accent }: {
  icon: string; label: string; value: number | string; accent: string;
}) {
  return (
    <div
      className="rounded-2xl py-4 px-2 flex flex-col items-center gap-2 border"
      style={{ background: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.08)" }}
    >
      <div className="text-xl leading-none">{icon}</div>
      <div className="font-display font-black leading-none text-3xl" style={{ color: accent }}>{value}</div>
      <div className="text-[10px] font-bold uppercase tracking-wider text-white/40">{label}</div>
    </div>
  );
}

/* ─── Attribute bar ─── */
function AttrBar({ label, value }: { label: string; value: number }) {
  const pct = Math.min(100, value);
  const bar =
    value >= 80 ? "linear-gradient(90deg, #15803d, #4ade80)" :
    value >= 70 ? "linear-gradient(90deg, #1d4ed8, #60a5fa)" :
    value >= 60 ? "linear-gradient(90deg, #b45309, #fbbf24)" :
    value >= 50 ? "linear-gradient(90deg, #c2410c, #fb923c)" :
                  "linear-gradient(90deg, #dc2626, #f87171)";
  const text =
    value >= 80 ? "#4ade80" :
    value >= 70 ? "#60a5fa" :
    value >= 60 ? "#fbbf24" :
    value >= 50 ? "#fb923c" : "#f87171";

  return (
    <div className="flex items-center gap-3 py-0.5" data-testid={`attr-bar-${label.toLowerCase()}`}>
      <span className="text-white/45 font-semibold text-[11px] uppercase tracking-wider shrink-0 w-[88px]">{label}</span>
      <div className="flex-1 rounded-full overflow-hidden h-[9px]" style={{ background: "rgba(255,255,255,0.08)" }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: bar }} />
      </div>
      <span className="font-display font-black text-right shrink-0 w-7 text-base" style={{ color: text }}>{value}</span>
    </div>
  );
}

/* ─── Badge hex ─── */
function BadgeTile({ b }: { b: BadgeItem }) {
  const { grad, glow, label } =
    b.rarity === "gold"
      ? { grad: "linear-gradient(135deg, #fef3c7, #fbbf24, #d97706)", glow: "rgba(251,191,36,0.3)", label: "Ouro" }
      : b.rarity === "silver"
      ? { grad: "linear-gradient(135deg, #f1f5f9, #cbd5e1, #94a3b8)", glow: "rgba(148,163,184,0.3)", label: "Prata" }
      : { grad: "linear-gradient(135deg, #ffedd5, #fb923c, #ea580c)", glow: "rgba(251,146,60,0.3)", label: "Bronze" };

  return (
    <div
      className="flex flex-col items-center gap-1.5 p-2.5 rounded-2xl border"
      style={{ background: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.08)", boxShadow: `0 3px 12px ${glow}` }}
      data-testid={`badge-${b.id}`}
    >
      {/* Hexagonal icon */}
      <div
        className="flex items-center justify-center text-xl"
        style={{
          width: 44, height: 44,
          background: grad,
          clipPath: "polygon(50% 0%, 95% 25%, 95% 75%, 50% 100%, 5% 75%, 5% 25%)",
        }}
      >
        {b.icon}
      </div>
      <p className="font-bold text-white/85 text-[10px] text-center leading-tight">{b.name}</p>
      <div className="h-1 w-8 rounded-full" style={{ background: grad }} />
    </div>
  );
}

/* ─── Past card mini ─── */
function MiniEpoca({ card }: { card: PastCardItem }) {
  const accent = card.position === "DEF" ? "#60a5fa" : card.position === "MEI" ? "#c084fc" : card.position === "GR" ? "#fbbf24" : "#4ade80";
  return (
    <div className="flex flex-col items-center gap-2" data-testid={`past-card-${card.season}`}>
      <div
        className="relative rounded-xl overflow-hidden"
        style={{
          width: 68, height: 94,
          background: "linear-gradient(160deg, #031408, #052010, #0a5a1e)",
          border: card.current ? `2px solid ${accent}` : "1.5px solid rgba(255,255,255,0.08)",
          boxShadow: card.current ? `0 0 16px ${accent}55` : "0 2px 8px rgba(0,0,0,0.25)",
        }}
      >
        <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse at 90% 20%, rgba(80,160,255,0.35), transparent 55%)` }} />
        <div className="absolute inset-0" style={{ background: "linear-gradient(120deg, rgba(255,140,0,0.3) 0%, transparent 45%)" }} />
        <div className="relative flex flex-col h-full p-2">
          <span className="font-display font-black leading-none" style={{ fontSize: 24, color: accent }}>{card.overall}</span>
          <span className="font-display text-[9px] font-bold" style={{ color: "rgba(255,255,255,0.45)", letterSpacing: "0.12em" }}>{card.position}</span>
          {card.current && (
            <div className="mt-auto">
              <span className="text-[7px] font-black px-1.5 py-0.5 rounded font-display" style={{ background: `${accent}25`, color: accent }}>ATUAL</span>
            </div>
          )}
        </div>
      </div>
      <p className="text-white/35 text-[10px] font-medium">{card.season}</p>
    </div>
  );
}

export default function Perfil() {
  const { isLinked, displayName, loading: authLoading, logout } = useAuth();
  const { openAuth } = useAuthGate();
  const userId = useUserId();
  const { profile, refresh, needsSetup } = useUserProfile();
  const [showSetup, setShowSetup] = useState(false);
  const [setupFinished, setSetupFinished] = useState(false);
  const [activeTab, setActiveTab] = useState<"atributos" | "estatisticas">("atributos");
  const [isCardExpanded, setIsCardExpanded] = useState(false);
  const [myCommunities, setMyCommunities] = useState<Community[]>([]);
  const [matchHistory, setMatchHistory] = useState<UserMatchHistoryEntry[]>([]);

  useEffect(() => {
    setSetupFinished(profile.profileComplete);
  }, [userId, profile.profileComplete]);

  useEffect(() => {
    if (!userId) return;
    loadMyCommunities(userId).then(setMyCommunities);
    loadUserMatchHistory(userId).then(setMatchHistory);
  }, [userId]);

  const player = profileToPlayerCard(profile);

  const overall = calculateOverall(player.attributes);

  const badges: BadgeItem[] = [];
  const pastCards: PastCardItem[] = profile.profileComplete
    ? [{ season: "Atual", overall, position: player.position, current: true }]
    : [];

  const attrs = [
    { label: "Ritmo",       value: player.attributes.ritmo },
    { label: "Finalização", value: player.attributes.finalizacao },
    { label: "Drible",      value: player.attributes.drible },
    { label: "Passe",       value: player.attributes.passe },
    { label: "Físico",      value: player.attributes.fisico },
    { label: "Defesa",      value: player.attributes.defesa },
  ];

  async function shareCard() {
    const url = `${window.location.origin}/perfil`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: `Carta ${player.name} — Joga AI`,
          text: `Vê a minha carta no Joga AI (OVR ${overall})`,
          url,
        });
      } else {
        await navigator.clipboard.writeText(url);
        toast({ title: "Link copiado!", description: "Cola e partilha com a malta." });
      }
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;
      toast({
        title: "Não foi possível partilhar",
        description: "Tenta copiar o link manualmente.",
        variant: "destructive",
      });
    }
  }

  return (
    <JogaPage theme="dark" padded={false} className="pb-28">
      <ProfileSetupDialog
        open={showSetup || (isLinked && !setupFinished && needsSetup)}
        onOpenChange={(next) => {
          setShowSetup(next);
          if (!next && profile.profileComplete) setSetupFinished(true);
        }}
        dismissible={profile.profileComplete}
        profile={profile}
        onComplete={() => {
          setSetupFinished(true);
          setShowSetup(false);
          void refresh();
        }}
      />

      {!authLoading && !isLinked && !profile.profileComplete && (
        <div className="px-4 pt-4">
          <JogaCard
            variant="arena"
            padding="md"
            className="border-emerald-400/25 bg-emerald-400/8"
          >
            <div className="flex items-start gap-3">
              <Link2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-emerald-300 text-[10px] font-bold uppercase tracking-[0.18em]">
                  Monta a tua carta
                </p>
                <p className="text-white/70 text-sm mt-1 leading-relaxed">
                  Cria conta ou entra para montar a tua carta e guardar na nuvem.
                </p>
                <JogaButton
                  variant="primary"
                  size="sm"
                  className="mt-3 gap-1.5"
                  onClick={() =>
                    openAuth({
                      mode: "register",
                      title: "Cria conta para montar a carta",
                      description: "Entra com Google ou email. Se já tens conta, faz login — entras na mesma.",
                    })
                  }
                >
                  Começar
                  <ChevronRight className="w-4 h-4" />
                </JogaButton>
              </div>
            </div>
          </JogaCard>
        </div>
      )}

      {!authLoading && !isLinked && profile.profileComplete && (
        <div className="px-4 pt-4">
          <JogaCard
            variant="arena"
            padding="md"
            className="border-amber-400/25 bg-amber-400/8 joga-tap"
            onClick={() => openAuth({
              mode: "register",
              title: "Guardar na nuvem",
              description: "Cria conta para sincronizar a carta e entrar em peladas com a malta.",
            })}
          >
            <div className="flex items-start gap-3">
              <Link2 className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-amber-300 text-[10px] font-bold uppercase tracking-[0.18em]">
                  Carta neste dispositivo
                </p>
                <p className="text-white/70 text-sm mt-1 leading-relaxed">
                  Cria conta quando quiseres guardar na nuvem e jogar online.
                </p>
                <JogaButton variant="gold" size="sm" className="mt-3 gap-1.5">
                  Criar conta / Entrar
                  <ChevronRight className="w-4 h-4" />
                </JogaButton>
              </div>
            </div>
          </JogaCard>
        </div>
      )}

      {!authLoading && isLinked && (
        <div className="px-4 pt-4 flex items-center justify-between gap-3">
          <p className="text-white/45 text-sm truncate">
            Sessão: <span className="text-white/70 font-medium">{displayName || "Conta ligada"}</span>
          </p>
          <JogaButton
            variant="ghost"
            size="sm"
            className="shrink-0 gap-1.5 text-white/50"
            onClick={() => logout()}
          >
            <LogOut className="w-3.5 h-3.5" />
            Sair
          </JogaButton>
        </div>
      )}

      {/* HERO — arena escura */}
      <div className="relative overflow-hidden joga-hero-arena">
        <div className="absolute inset-0" style={{ backgroundImage: PITCH_BG, backgroundSize: "80px 80px", opacity: 0.55 }} />
        <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(74,222,128,0.12) 0%, transparent 50%)" }} />
        <div className="absolute bottom-0 left-0 right-0 h-8" style={{ background: "linear-gradient(to top, #0a0f1a, transparent)" }} />

        <div className="relative mx-auto w-full" style={{ maxWidth: 760 }}>
          <div className="relative flex items-center justify-between px-4 pt-4 pb-0 sm:px-5 sm:pt-5">
            <h1 className="font-display font-black text-xl tracking-tight text-white" data-testid="header-title">
              O Meu Perfil
            </h1>
            <div className="flex items-center gap-2">
              <JogaButton
                variant="ghost"
                size="sm"
                className="rounded-full px-3"
                onClick={() => {
                  if (!isLinked) {
                    openAuth({
                      mode: "register",
                      title: "Cria conta para editar a carta",
                      description: "Regista-te para guardar alterações na nuvem.",
                    });
                    return;
                  }
                  setShowSetup(true);
                }}
                data-testid="button-edit-card"
              >
                Editar carta
              </JogaButton>
              <JogaButton
                variant="ghost"
                size="sm"
                className="rounded-full px-4"
                data-testid="button-share-card"
                onClick={() => void shareCard()}
              >
                <Share2 className="w-3.5 h-3.5" />
                Partilhar
              </JogaButton>
            </div>
          </div>

          <div className="relative flex items-start justify-center gap-3 px-3 pt-2 pb-6 sm:gap-6 sm:px-4 sm:pt-3 sm:pb-7">
            <button
              type="button"
              onClick={() => setIsCardExpanded(true)}
              className="joga-tap relative shrink-0 w-[158px] h-[219px] sm:w-[194px] sm:h-[268px]"
              style={{ border: 0, background: "transparent", padding: 0 }}
              aria-label="Abrir carta do jogador"
            >
              <div className="absolute top-0 left-1/2 w-[340px] origin-top -translate-x-1/2 scale-[0.465] sm:scale-[0.571] [&_.joga-new-player-card-wrap--profile]:w-full!">
                <PlayerCard
                  name={player.name}
                  position={player.position}
                  attributes={player.attributes}
                  shirtNumber={player.shirtNumber}
                  title={player.title}
                  photoUrl={player.photoUrl}
                  size="profile"
                />
              </div>
            </button>

            <JogaCard variant="arena" className="relative z-10 flex-1 min-w-0 max-w-[240px] bg-white/6! border-white/10! backdrop-blur-md">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] mb-1 text-emerald-300/80">O Meu Perfil</p>
              <h2 className="font-display font-black uppercase leading-none tracking-tight text-xl text-white">
                {player.name.split(" ")[0]}
              </h2>
              <h2 className="font-display font-black uppercase leading-none tracking-tight text-xl text-white">
                {player.name.split(" ").slice(1).join(" ")}
              </h2>

              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-400/25">
                  {player.position}
                </span>
                <span className="text-[11px] font-semibold text-amber-300/90">{player.title}</span>
              </div>

              <div className="grid grid-cols-2 gap-2 mt-2.5">
                {[
                  { v: overall, l: "Overall", c: "#fbbf24" },
                  { v: player.seasonStats.matches, l: "Jogos", c: "#60a5fa" },
                  { v: player.seasonStats.goals, l: "Golos", c: "#4ade80" },
                  { v: player.seasonStats.assists, l: "Assist.", c: "#fb923c" },
                ].map((s) => (
                  <div key={s.l} className="rounded-xl px-2 py-1.5 sm:rounded-2xl sm:py-2 border border-white/8" style={{ background: "rgba(255,255,255,0.04)" }}>
                    <p className="font-display font-black text-2xl leading-none" style={{ color: s.c }}>{s.v}</p>
                    <p className="text-[10px] font-bold mt-0.5 uppercase text-white/40">{s.l}</p>
                  </div>
                ))}
              </div>
            </JogaCard>
          </div>
        </div>
      </div>

      <div className="px-4 space-y-4 pt-4">

        <JogaCard variant="arena" className="flex items-center gap-4">
          <div
            className="w-16 h-16 rounded-2xl flex flex-col items-center justify-center shrink-0"
            style={{ background: "linear-gradient(135deg, #042e10, #16a34a)", boxShadow: "0 4px 16px rgba(22,163,74,0.35)" }}
          >
            <span className="font-display font-black text-white text-3xl leading-none">{overall}</span>
            <span className="font-display font-bold text-white/60 text-[0.6rem] tracking-widest">OVR</span>
          </div>

          <div className="flex-1 min-w-0">
            <p className="font-display font-black text-white text-xl leading-tight truncate">{player.name}</p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-400/20">
                {player.position}
              </span>
              <span className="text-[12px] font-semibold text-white/55">{player.title}</span>
            </div>
            <p className="text-white/35 text-[11px] mt-1 font-medium">Época 2024/25</p>
          </div>

          <div className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, rgba(251,191,36,0.25), rgba(245,158,11,0.15))", border: "1px solid rgba(251,191,36,0.3)" }}>
            <span className="text-lg">🌟</span>
          </div>
        </JogaCard>

        <div className="grid grid-cols-4 gap-2.5">
          <StatTile icon="📅" label="Jogos"   value={player.seasonStats.matches} accent="#94a3b8" />
          <StatTile icon="⚽" label="Golos"   value={player.seasonStats.goals}   accent="#4ade80" />
          <StatTile icon="🎯" label="Assist." value={player.seasonStats.assists} accent="#60a5fa" />
          <StatTile icon="🏆" label="MVP"     value={player.seasonStats.mvp}     accent="#fbbf24" />
        </div>

        <JogaCard variant="arena" padding="none" className="overflow-hidden">
          <div className="flex gap-2 p-3 border-b border-white/8">
            {(["atributos", "estatisticas"] as const).map((t) => (
              <JogaChip
                key={t}
                label={t === "atributos" ? "Atributos" : "Estatísticas"}
                active={activeTab === t}
                onClick={() => setActiveTab(t)}
                testId={`tab-${t}`}
                className="flex-1 text-center"
              />
            ))}
          </div>

          {activeTab === "atributos" && (
            <div className="px-4 py-5">
              <div className="flex items-center justify-between mb-5 pb-4 border-b border-white/8">
                <div>
                  <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest">Overall</p>
                  <p className="font-display font-black text-white text-5xl leading-none">{overall}</p>
                </div>
                <div className="flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm bg-emerald-500/12 text-emerald-300 border border-emerald-400/20">
                  <TrendingUp className="w-4 h-4" />
                  +3 esta época
                </div>
              </div>
              <div className="space-y-3">
                {attrs.map((a) => <AttrBar key={a.label} label={a.label} value={a.value} />)}
              </div>
              <div className="flex items-center justify-between mt-5 pt-4 text-[11px] border-t border-white/8">
                <span className="text-white/40 font-medium">Próxima evolução</span>
                <span className="text-emerald-400 font-semibold">Joga mais 2 partidas →</span>
              </div>
            </div>
          )}

          {activeTab === "estatisticas" && (
            <div className="px-4 py-4">
              {player.seasonStats.matches === 0 ? (
                <p className="text-white/40 text-sm text-center py-6">Sem estatísticas ainda. Joga a tua primeira pelada!</p>
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { icon: "⚽", label: "Golos", v: String(player.seasonStats.goals) },
                    { icon: "🎯", label: "Assist.", v: String(player.seasonStats.assists) },
                    { icon: "📅", label: "Jogos", v: String(player.seasonStats.matches) },
                    { icon: "🏆", label: "MVPs", v: String(player.seasonStats.mvp) },
                  ].map((s) => (
                    <div key={s.label} className="rounded-xl p-3 flex flex-col items-center gap-1.5 text-center border border-white/8" style={{ background: "rgba(255,255,255,0.04)" }}>
                      <span className="text-xl">{s.icon}</span>
                      <p className="font-display font-black text-white text-xl leading-none">{s.v}</p>
                      <p className="text-white/35 text-[9px] font-semibold uppercase tracking-wide leading-tight">{s.label}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </JogaCard>

        {badges.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display font-black text-white text-lg">Distintivos</h2>
            <span className="text-xs font-semibold text-white/45 bg-white/6 px-2.5 py-1 rounded-full border border-white/8">{badges.length} desbloqueados</span>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {badges.map((b) => <BadgeTile key={b.id} b={b} />)}
          </div>
        </div>
        )}

        {pastCards.length > 0 && (
        <div>
          <h2 className="font-display font-black text-white text-lg mb-3">Épocas</h2>
          <div className="flex gap-4 overflow-x-auto pb-1">
            {pastCards.map((card) => <MiniEpoca key={card.season} card={card} />)}
          </div>
        </div>
        )}

        <div>
          <h2 className="font-display font-black text-white text-lg mb-3">Peladas anteriores</h2>
          {matchHistory.length === 0 ? (
            <p className="text-white/40 text-sm">Ainda não jogaste peladas registadas.</p>
          ) : (
            <div className="space-y-2">
              {matchHistory.slice(0, 5).map((m) => (
                <JogaCard key={m.matchId} variant="arena" className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-white font-semibold text-sm truncate">{m.title}</p>
                    <p className="text-white/40 text-xs mt-0.5">
                      {new Date(m.date).toLocaleDateString("pt-PT")} · {m.goals}G · {m.assists}A
                    </p>
                  </div>
                  <span className="font-display font-black text-emerald-400 text-lg shrink-0">
                    {m.rating > 0 ? m.rating.toFixed(1) : "—"}
                  </span>
                </JogaCard>
              ))}
            </div>
          )}
        </div>

        <div>
          <h2 className="font-display font-black text-white text-lg mb-3">Comunidades</h2>
          {myCommunities.length === 0 ? (
            <p className="text-white/40 text-sm">Ainda não pertences a nenhuma comunidade.</p>
          ) : (
          <div className="flex gap-2.5 overflow-x-auto pb-1">
            {myCommunities.slice(0, 6).map((c) => (
              <Link key={c.id} href={`/comunidades/${c.id}`} className="joga-tap shrink-0">
                <JogaCard variant="arena" className="flex items-center gap-2.5 py-3!" data-testid={`community-tag-${c.id}`}>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 joga-btn-primary">
                    <span className="font-display font-black text-white text-sm">{c.name[0]}</span>
                  </div>
                  <div>
                    <p className="text-white text-xs font-semibold truncate max-w-[90px]">{c.name}</p>
                    <p className="text-white/40 text-[10px] font-medium">{c.memberCount} membros</p>
                  </div>
                </JogaCard>
              </Link>
            ))}
          </div>
          )}
        </div>

        {/* ════════════════════════════════════
            CTA — Ver Evolução
        ════════════════════════════════════ */}
        <Link href="/perfil/evolucao" className="block">
          <JogaButton
            variant="primary"
            size="lg"
            className="gap-3"
            data-testid="button-go-evolution"
          >
            <Shield className="w-5 h-5 text-white/70" />
            Ver Evolução
            <ChevronRight className="w-5 h-5 text-white/50" />
          </JogaButton>
        </Link>

      </div>

      {isCardExpanded && (
        <div
          className="fixed inset-0 z-9999 flex items-center justify-center px-4 py-6 cursor-pointer"
          style={{ background: "rgba(2,6,23,0.82)", backdropFilter: "blur(10px)" }}
          onClick={() => setIsCardExpanded(false)}
          role="button"
          aria-label="Fechar carta"
        >
          <div className="relative" onClick={(event) => event.stopPropagation()}>
            <JogaButton
              variant="ghost"
              size="sm"
              className="absolute -top-12 right-0"
              onClick={() => setIsCardExpanded(false)}
            >
              Fechar
            </JogaButton>

            <PlayerCard
              name={player.name}
              position={player.position}
              attributes={player.attributes}
              shirtNumber={player.shirtNumber}
              title={player.title}
              photoUrl={player.photoUrl}
              size="profile"
            />
          </div>
        </div>
      )}
    </JogaPage>
  );
}
