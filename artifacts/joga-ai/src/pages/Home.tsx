import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Plus, Search, ChevronRight, Trophy, Flame } from "lucide-react";
import { calculateOverall } from "@/lib/cardUtils";
import { loadCommunities, loadAvailableMatches, type Community, type MatchListing } from "@/lib/communityRepository";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthGate } from "@/contexts/AuthGateContext";
import { useUserProfile } from "@/hooks/useUserProfile";
import { profileToPlayerCard } from "@/lib/userRepository";
import { toast } from "@/hooks/use-toast";
import { PlayerCard } from "@/components/PlayerCard";
import { JogaLogo } from "@/components/brand";
import { NotificationsBell } from "@/components/NotificationsBell";
import { JogaCard, JogaChip, JogaPage, JogaButton } from "@/components/joga";

const PITCH_SVG = `url("data:image/svg+xml,%3Csvg width='80' height='80' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 40 L80 40' stroke='rgba(255,255,255,0.05)' stroke-width='1'/%3E%3Cpath d='M40 0 L40 80' stroke='rgba(255,255,255,0.03)' stroke-width='1'/%3E%3Ccircle cx='40' cy='40' r='18' stroke='rgba(255,255,255,0.04)' stroke-width='1' fill='none'/%3E%3C/svg%3E")`;

const STADIUM_SVG = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 800 320' preserveAspectRatio='xMidYMax meet'%3E%3Cg fill='rgba(0,0,0,0.18)'%3E%3Crect x='0' y='180' width='60' height='140'/%3E%3Crect x='55' y='160' width='50' height='160'/%3E%3Crect x='100' y='145' width='45' height='175'/%3E%3Crect x='140' y='135' width='40' height='185'/%3E%3Crect x='175' y='128' width='35' height='192'/%3E%3Crect x='168' y='60' width='8' height='75'/%3E%3Ccircle cx='172' cy='56' r='12'/%3E%3Crect x='590' y='128' width='35' height='192'/%3E%3Crect x='620' y='135' width='40' height='185'/%3E%3Crect x='655' y='145' width='45' height='175'/%3E%3Crect x='695' y='160' width='50' height='160'/%3E%3Crect x='740' y='180' width='60' height='140'/%3E%3Crect x='624' y='60' width='8' height='75'/%3E%3Ccircle cx='628' cy='56' r='12'/%3E%3Crect x='205' y='240' width='390' height='80'/%3E%3Cellipse cx='400' cy='240' rx='195' ry='30' /%3E%3C/g%3E%3C/svg%3E")`;

function HeroCard({ player }: {
  player: ReturnType<typeof profileToPlayerCard>;
}) {
  return (
    <Link href="/perfil" data-testid="hero-player-card">
      <div
        className="active:scale-95 transition-transform cursor-pointer"
        style={{ width: 108, flexShrink: 0 }}
      >
        <PlayerCard
          name={player.name}
          position={player.position}
          attributes={player.attributes}
          shirtNumber={player.shirtNumber}
          title={player.title}
          photoUrl={player.photoUrl}
          size="small"
          className="w-full! max-w-full!"
        />
      </div>
    </Link>
  );
}

function CommunityPill({ c }: { c: { id: string; name: string; memberCount: number; city: string } }) {
  const abbr = c.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const colors = [
    "linear-gradient(135deg, #16a34a, #047857)",
    "linear-gradient(135deg, #2563eb, #1d4ed8)",
    "linear-gradient(135deg, #7c3aed, #6d28d9)",
    "linear-gradient(135deg, #dc2626, #b91c1c)",
    "linear-gradient(135deg, #d97706, #b45309)",
  ];
  const bg = colors[parseInt(c.id) % colors.length];
  return (
    <Link href={`/comunidades/${c.id}`}>
      <div className="shrink-0 flex flex-col items-center gap-2 joga-tap" data-testid={`community-pill-${c.id}`}>
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg" style={{ background: bg, boxShadow: "0 4px 12px rgba(0,0,0,0.35)" }}>
          <span className="font-display font-black text-white text-xl">{abbr}</span>
        </div>
        <p className="text-[11px] font-bold max-w-[60px] text-center leading-tight" style={{ color: "rgba(255,255,255,0.7)" }}>{c.name.split(" ")[0]}</p>
        <p className="text-[10px] font-medium -mt-1" style={{ color: "rgba(255,255,255,0.3)" }}>{c.memberCount}</p>
      </div>
    </Link>
  );
}

export default function Home() {
  const { isLinked, loading: authLoading, userId } = useAuth();
  const { openAuth, requireLinked } = useAuthGate();
  const { profile, needsSetup } = useUserProfile();
  const player = profileToPlayerCard(profile);
  const overall = calculateOverall(player.attributes);

  const [communities, setCommunities] = useState<Community[]>([]);
  const [available, setAvailable] = useState<MatchListing[]>([]);

  // Hidrata comunidades e partidas do Firestore em background
  useEffect(() => {
    loadCommunities(userId).then(setCommunities);
    loadAvailableMatches().then((matches) => {
      setAvailable(matches.filter((m) => m.spotsRemaining !== "Lotado"));
    });
  }, [userId]);

  const [rankingTab, setRankingTab] = useState<"overall" | "notas" | "golos">("overall");

  const rankingTabs = [
    { key: "overall", label: "Overall" },
    { key: "notas", label: "Notas" },
    { key: "golos", label: "Golos" },
  ] as const;

  const rankingSets = {
    overall: profile.profileComplete
      ? [{ rank: 1, name: player.name, position: player.position, value: overall, isMe: true }]
      : [],
    notas: profile.profileComplete && profile.seasonStats.matches > 0
      ? [{ rank: 1, name: player.name, position: player.position, value: "—", isMe: true }]
      : [],
    golos: profile.profileComplete && profile.seasonStats.goals > 0
      ? [{ rank: 1, name: player.name, position: player.position, value: player.seasonStats.goals, isMe: true }]
      : [],
  };

  const ranking = rankingSets[rankingTab];

  return (
    <JogaPage theme="dark" padded={false} bottomSpace>

      {/* HERO */}
      <div
        className="relative overflow-hidden"
        style={{
          background: "linear-gradient(155deg, #011206 0%, #021a09 20%, #041f0b 40%, #072b12 60%, #0a3d1a 80%, #0c4a1f 100%)",
          paddingBottom: 44,
        }}
      >
        <div className="absolute bottom-0 left-0 right-0" style={{ height: "100%", backgroundImage: STADIUM_SVG, backgroundSize: "cover", backgroundPosition: "bottom center", backgroundRepeat: "no-repeat", opacity: 0.9 }} />
        <div className="absolute inset-0" style={{ backgroundImage: PITCH_SVG, backgroundSize: "80px 80px", opacity: 0.6 }} />
        <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 50% -5%, rgba(255,255,200,0.09) 0%, transparent 45%)" }} />
        <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 50% 120%, rgba(22,163,74,0.25) 0%, transparent 55%)" }} />
        <div className="absolute inset-0" style={{ background: "linear-gradient(90deg, rgba(0,0,0,0.35) 0%, transparent 25%, transparent 75%, rgba(0,0,0,0.35) 100%)" }} />
        <div className="absolute bottom-0 left-0 right-0 h-14" style={{ background: "linear-gradient(to top, #0a0f1a, transparent)" }} />

        <div className="relative flex items-center justify-between px-5 pt-5 pb-4">
          <JogaLogo variant="full" size="md" className="max-w-[180px]" />
          <div className="flex items-center gap-2">
            <NotificationsBell userId={userId} isLinked={isLinked} />
            <Link href="/premium">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full" style={{ background: "rgba(251,191,36,0.15)", border: "1px solid rgba(251,191,36,0.5)" }} data-testid="button-premium-header">
                <Flame className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-amber-400 text-xs font-bold">Premium</span>
              </div>
            </Link>
          </div>
        </div>

        <div className="home-feature-card relative flex items-center justify-between gap-3 px-4">
          <HeroCard player={player} />
          <div className="flex-1 min-w-0">
            <p className="text-white/40 text-[10px] font-bold uppercase tracking-[0.2em] mb-1">Em Destaque</p>
            <h1 className="font-display font-black text-white uppercase leading-none tracking-tight" style={{ fontSize: "1.25rem" }}>{player.name.split(" ")[0]}</h1>
            <h1 className="font-display font-black text-white uppercase leading-none tracking-tight -mt-0.5" style={{ fontSize: "1.25rem" }}>{player.name.split(" ").slice(1).join(" ")}</h1>
            <div className="flex items-center gap-2 mt-2">
              <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider" style={{ background: "rgba(74,222,128,0.2)", color: "#4ade80", border: "1px solid rgba(74,222,128,0.3)" }}>{player.position}</span>
              <span className="text-white/40 text-[10px]">·</span>
              <span className="text-white/60 text-[11px] font-medium">{player.title}</span>
            </div>
            <div className="flex items-center gap-4 mt-4">
              {[{ v: player.seasonStats.goals, l: "Golos" }, { v: player.seasonStats.assists, l: "Assist." }, { v: player.seasonStats.matches, l: "Jogos" }].map((s, i) => (
                <div key={s.l} className="flex items-center gap-3">
                  {i > 0 && <div className="w-px h-6" style={{ background: "rgba(255,255,255,0.15)" }} />}
                  <div>
                    <p className="font-display font-black text-white text-xl leading-none">{s.v}</p>
                    <p className="text-white/35 text-[10px] font-medium mt-0.5">{s.l}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 space-y-4 pt-4">

        {!authLoading && !isLinked && !profile.profileComplete && (
          <JogaCard
            variant="arena"
            padding="md"
            className="border-emerald-400/25 bg-emerald-400/8"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-emerald-300 text-[10px] font-bold uppercase tracking-[0.18em]">
                  Experimenta a tua carta
                </p>
                <p className="text-white text-sm font-semibold mt-1">
                  Vai ao Perfil para montar carta e foto — sem conta
                </p>
              </div>
              <Link href="/perfil">
                <JogaButton variant="primary" size="sm" className="shrink-0 px-4">
                  Montar carta
                </JogaButton>
              </Link>
            </div>
          </JogaCard>
        )}

        {!authLoading && !isLinked && profile.profileComplete && (
          <JogaCard
            variant="arena"
            padding="md"
            className="border-amber-400/25 bg-amber-400/8 joga-tap"
            onClick={() => openAuth({
              mode: "register",
              title: "Guardar na nuvem",
              description: "A tua carta está neste dispositivo. Cria conta para sincronizar e jogar com a malta.",
            })}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-amber-300 text-[10px] font-bold uppercase tracking-[0.18em]">
                  Carta local
                </p>
                <p className="text-white text-sm font-semibold mt-1">
                  Cria conta para guardar na nuvem e entrar em partidas
                </p>
              </div>
              <JogaButton variant="gold" size="sm" className="shrink-0 px-4">
                Criar conta
              </JogaButton>
            </div>
          </JogaCard>
        )}

        {isLinked && needsSetup && (
          <JogaCard variant="arena" padding="md" className="border-emerald-400/25 bg-emerald-400/8">
            <p className="text-emerald-300 text-[10px] font-bold uppercase tracking-[0.18em]">
              Carta incompleta
            </p>
            <p className="text-white text-sm font-semibold mt-1">
              Monta a tua carta para apareceres nos jogos e no ranking.
            </p>
          </JogaCard>
        )}

        {/* QUICK ACTIONS */}
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            data-testid="button-create-match"
            className="rounded-2xl p-4 flex items-center gap-3.5 joga-tap text-left w-full"
            style={{ background: "linear-gradient(135deg, #15803d, #16a34a)", boxShadow: "0 4px 16px rgba(21,128,61,0.35)" }}
            onClick={() => {
              if (requireLinked({
                mode: "register",
                title: "Cria conta para organizar partidas",
                description: "Visitantes podem ver jogos. Para criar peladas, regista-te grátis.",
              })) {
                window.location.href = "/criar-partida";
              }
            }}
          >
              <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(255,255,255,0.15)" }}>
                <Plus className="w-6 h-6 text-white" strokeWidth={2.5} />
              </div>
              <div>
                <p className="font-display font-black text-white text-base leading-tight">Criar</p>
                <p className="text-white/60 text-xs font-medium">Partida nova</p>
              </div>
          </button>
          <Link href="/jogos" data-testid="button-find-match">
            <div className="rounded-2xl p-4 flex items-center gap-3.5 joga-tap" style={{ background: "linear-gradient(135deg, #1d4ed8, #2563eb)", boxShadow: "0 4px 16px rgba(29,78,216,0.35)" }}>
              <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(255,255,255,0.15)" }}>
                <Search className="w-6 h-6 text-white" strokeWidth={2} />
              </div>
              <div>
                <p className="font-display font-black text-white text-base leading-tight">Encontrar</p>
                <p className="text-white/60 text-xs font-medium">Jogos perto</p>
              </div>
            </div>
          </Link>
        </div>

        {/* PRÓXIMO JOGO */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display font-black text-white text-lg">Próximo Jogo</h2>
            <Link href="/jogos"><span className="joga-link text-emerald-400 text-sm font-semibold flex items-center gap-0.5">Ver todos <ChevronRight className="w-3.5 h-3.5" /></span></Link>
          </div>
          <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 2px 16px rgba(0,0,0,0.3)" }}>
            <div className="h-1" style={{ background: "linear-gradient(90deg, #16a34a, #059669, #2563eb)" }} />
            <div className="px-4 pt-3.5 pb-2">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-display font-black text-white text-lg leading-tight">Peladinha de Sexta</p>
                  <p className="text-sm mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>📍 Parque das Nações</p>
                </div>
                <div className="text-right shrink-0 ml-3">
                  <span className="font-display font-black text-emerald-400 text-sm">Sexta</span>
                  <p className="font-display font-bold text-white text-xl leading-none">20:00</p>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-3">
                <span className="text-[11px] font-semibold px-2.5 py-1 rounded-lg" style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.5)" }}>⚽ Fut 7</span>
                <span className="text-[11px] font-semibold px-2.5 py-1 rounded-lg" style={{ background: "rgba(74,222,128,0.1)", color: "#4ade80" }}>Recreativo</span>
                <span className="text-[11px] font-semibold px-2.5 py-1 rounded-lg ml-auto" style={{ background: "rgba(96,165,250,0.1)", color: "#60a5fa" }}>3 vagas</span>
              </div>
            </div>
            <div className="px-4 py-3 flex items-center gap-2" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
              <div className="flex -space-x-2 shrink-0">
                {["B","P","M","J","R"].map((l, i) => (
                  <div key={i} className="w-7 h-7 rounded-full border-2 flex items-center justify-center" style={{ background: `hsl(${140 + i * 20}, 65%, 38%)`, borderColor: "#0a0f1a", fontSize: 10, fontWeight: 800, color: "white" }}>{l}</div>
                ))}
                <div className="w-7 h-7 rounded-full border-2 flex items-center justify-center" style={{ background: "rgba(255,255,255,0.08)", borderColor: "#0a0f1a" }}>
                  <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 9, fontWeight: 700 }}>+3</span>
                </div>
              </div>
              <p className="text-xs font-medium" style={{ color: "rgba(255,255,255,0.35)" }}>8 inscritos · 3 vagas restantes</p>
            </div>
          </div>
        </div>

        {/* COMUNIDADES */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display font-black text-white text-lg">
              Comunidades
              <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-white/30 align-middle">
                Demo
              </span>
            </h2>
            <Link href="/comunidades"><span className="joga-link text-emerald-400 text-sm font-semibold flex items-center gap-0.5">Ver todas <ChevronRight className="w-3.5 h-3.5" /></span></Link>
          </div>
          <div className="flex gap-6 overflow-x-auto pb-1 -mx-4 px-4">
            {communities.map((c) => <CommunityPill key={c.id} c={c} />)}
            <Link href="/comunidades">
              <div className="shrink-0 flex flex-col items-center gap-2 active:scale-95 transition-transform">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center border-2 border-dashed" style={{ background: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.12)" }}>
                  <Plus className="w-5 h-5" style={{ color: "rgba(255,255,255,0.3)" }} />
                </div>
                <p className="text-[11px] font-medium" style={{ color: "rgba(255,255,255,0.3)" }}>Explorar</p>
              </div>
            </Link>
          </div>
        </div>

        {/* JOGOS DISPONÍVEIS */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display font-black text-white text-lg">Jogos Disponíveis</h2>
            <Link href="/jogos"><span className="joga-link text-emerald-400 text-sm font-semibold flex items-center gap-0.5">Ver todos <ChevronRight className="w-3.5 h-3.5" /></span></Link>
          </div>
          <div className="space-y-2.5">
            {available.length === 0 ? (
              <JogaCard variant="arena" padding="md" className="text-center">
                <p className="text-white/50 text-sm">Ainda não há jogos abertos.</p>
                <JogaButton
                  variant="primary"
                  size="sm"
                  className="mt-3"
                  onClick={() => requireLinked({
                    mode: "register",
                    title: "Cria conta para organizar partidas",
                  })}
                >
                  Criar primeira partida
                </JogaButton>
              </JogaCard>
            ) : (
            available.map((m) => (
              <Link key={m.id} href={`/partida/${m.id}/pre-jogo`}>
              <div className="rounded-2xl px-4 py-3.5 flex items-center gap-3.5 joga-tap" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.07)", boxShadow: "0 2px 10px rgba(0,0,0,0.2)" }} data-testid={`home-match-${m.id}`}>
                <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 text-xl" style={{ background: "rgba(22,163,74,0.1)" }}>⚽</div>
                <div className="flex-1 min-w-0">
                  <p className="font-display font-bold text-white text-sm leading-tight truncate">{m.title}</p>
                  <p className="text-[11px] mt-0.5 truncate" style={{ color: "rgba(255,255,255,0.35)" }}>📍 {m.location}, {m.city}</p>
                  <p className="text-[11px] mt-0.5 font-medium" style={{ color: "rgba(255,255,255,0.4)" }}>{m.date} · {m.gameType} · {m.level}</p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg" style={{ background: "rgba(74,222,128,0.12)", color: "#4ade80" }}>{m.spotsRemaining}</span>
                  <span className="text-[10px] font-medium" style={{ color: "rgba(255,255,255,0.25)" }}>{m.price}</span>
                </div>
              </div>
              </Link>
            ))
            )}
          </div>
        </div>

        {/* RANKING SEMANAL */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display font-black text-white text-lg">
              Ranking Semanal
              <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-amber-400/70 align-middle">
                Demo
              </span>
            </h2>
            <Link href="/ranking"><span className="joga-link text-emerald-400 text-sm font-semibold flex items-center gap-0.5">Ver tudo <ChevronRight className="w-3.5 h-3.5" /></span></Link>
          </div>
          <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 2px 16px rgba(0,0,0,0.3)" }}>
            <div className="px-4 py-3 flex items-center gap-2" style={{ background: "linear-gradient(135deg, rgba(180,130,20,0.3), rgba(251,191,36,0.2))", borderBottom: "1px solid rgba(251,191,36,0.15)" }}>
              <Trophy className="w-4 h-4 text-amber-400" />
              <span className="font-display font-bold text-amber-300 text-sm uppercase tracking-wider">Top Jogadores</span>
              <span className="ml-auto text-amber-400/50 text-xs font-medium">Esta semana</span>
            </div>
            <div className="px-3 py-2 flex gap-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
              {rankingTabs.map((tab) => (
                <JogaChip
                  key={tab.key}
                  label={tab.label}
                  active={rankingTab === tab.key}
                  onClick={() => setRankingTab(tab.key)}
                  testId={`home-ranking-tab-${tab.key}`}
                  className="flex-1 text-center text-[11px] uppercase tracking-wide"
                />
              ))}
            </div>
            <div>
              {ranking.length === 0 ? (
                <p className="px-4 py-6 text-center text-white/40 text-sm">
                  Ainda não há ranking — joga peladas para apareceres aqui.
                </p>
              ) : ranking.map((r, idx) => (
                <div
                  key={r.rank}
                  className="px-4 py-3 flex items-center gap-3"
                  style={{
                    background: r.isMe ? "rgba(22,163,74,0.07)" : "transparent",
                    borderTop: idx > 0 ? "1px solid rgba(255,255,255,0.04)" : undefined,
                  }}
                  data-testid={`home-rank-${r.rank}`}
                >
                  <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-base font-display font-black">
                    {r.rank === 1 ? "🥇" : r.rank === 2 ? "🥈" : r.rank === 3 ? "🥉" : <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 14 }}>{r.rank}º</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate" style={{ color: r.isMe ? "#4ade80" : "rgba(255,255,255,0.85)" }}>{r.name}{r.isMe ? " (Tu)" : ""}</p>
                    <p className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>{r.position}</p>
                  </div>
                  <span className="font-display font-black text-xl" style={{ color: r.rank === 1 ? "#fbbf24" : r.isMe ? "#4ade80" : "rgba(255,255,255,0.7)" }}>{r.value}</span>
                </div>
              ))}
            </div>
            <Link href="/ranking">
              <div className="px-4 py-3 flex items-center justify-center gap-1 active:opacity-70 transition-opacity" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                <span className="text-emerald-400 text-sm font-semibold">Ver ranking completo</span>
                <ChevronRight className="w-4 h-4 text-emerald-400" />
              </div>
            </Link>
          </div>
        </div>

      </div>
    </JogaPage>
  );
}
