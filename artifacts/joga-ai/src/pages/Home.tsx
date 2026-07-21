import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { Plus, Search, ChevronRight, Flame } from "lucide-react";
import { NotificationsBell } from "@/components/NotificationsBell";
import { loadCommunities, loadMyCommunities, loadAvailableMatches, loadMyMatches, type Community, type MatchListing } from "@/lib/communityRepository";
import {
  computeMatchPriority,
  fetchLiveClockStatus,
  matchCardEmphasis,
  sortEnrichedMatches,
  type EnrichedMatchListing,
} from "@/lib/matchDisplayUtils";
import { hasUserVoted } from "@/lib/voteStatusRepository";
import { getMatchRoutePath } from "@/lib/matchRepository";
import { matchSummaryPath } from "@/lib/voteStatusRepository";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthGate } from "@/contexts/AuthGateContext";
import { useUserProfile } from "@/hooks/useUserProfile";
import { profileToPlayerCard } from "@/lib/userRepository";
import { toast } from "@/hooks/use-toast";
import { PlayerCard } from "@/components/PlayerCard";
import { JogaLogo } from "@/components/brand";
import { JogaCard, JogaPage, JogaButton } from "@/components/joga";
import { SponsorSlot } from "@/components/SponsorSlot";
import { InstallAppBanner } from "@/components/InstallAppBanner";

const PITCH_SVG = `url("data:image/svg+xml,%3Csvg width='80' height='80' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 40 L80 40' stroke='rgba(255,255,255,0.05)' stroke-width='1'/%3E%3Cpath d='M40 0 L40 80' stroke='rgba(255,255,255,0.03)' stroke-width='1'/%3E%3Ccircle cx='40' cy='40' r='18' stroke='rgba(255,255,255,0.04)' stroke-width='1' fill='none'/%3E%3C/svg%3E")`;

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

  const [communities, setCommunities] = useState<Community[]>([]);
  const [discoverPool, setDiscoverPool] = useState<MatchListing[]>([]);
  const [myMatches, setMyMatches] = useState<EnrichedMatchListing[]>([]);

  const available = useMemo(() => {
    const myIds = new Set(myMatches.map((m) => m.id));
    return discoverPool
      .filter((m) => !myIds.has(m.id))
      .filter((m) => m.spotsRemaining !== "Lotado");
  }, [discoverPool, myMatches]);

  // Hidrata comunidades e partidas do Firestore em background
  useEffect(() => {
    if (!userId) {
      loadCommunities().then(setCommunities);
      setMyMatches([]);
    } else {
      Promise.all([loadCommunities(userId), loadMyCommunities(userId)]).then(([all, mine]) => {
        const mineIds = new Set(mine.map((c) => c.id));
        const merged = [
          ...mine,
          ...all.filter((c) => !mineIds.has(c.id) && c.isMember),
        ];
        setCommunities(merged.length > 0 ? merged : all.filter((c) => c.isMember).slice(0, 6));
      });

      void loadMyMatches(userId).then(async (matches) => {
        const enriched = await Promise.all(
          matches.map(async (match) => {
            const liveClockStatus =
              match.status === "ao_vivo" ? await fetchLiveClockStatus(match.id) : null;
            const voted =
              match.status === "aguardando_auditoria"
                ? await hasUserVoted(match.id, userId)
                : false;
            const { priority, label } = computeMatchPriority(match, {
              liveClockStatus,
              pendingVote: match.status === "aguardando_auditoria" && !voted,
            });
            return {
              ...match,
              priority,
              priorityLabel: label,
              liveClockStatus,
              pendingVote: match.status === "aguardando_auditoria" && !voted,
              voted,
            } satisfies EnrichedMatchListing;
          }),
        );
        setMyMatches(sortEnrichedMatches(enriched));
      });
    }
    loadAvailableMatches(20, userId ?? undefined).then(setDiscoverPool);
  }, [userId]);

  function matchHref(match: EnrichedMatchListing) {
    if (match.voted && match.status === "aguardando_auditoria") {
      return matchSummaryPath(match.id, { view: "summary" });
    }
    if (match.pendingVote && match.status === "aguardando_auditoria") {
      return matchSummaryPath(match.id);
    }
    return getMatchRoutePath(match.id, match.status);
  }

  return (
    <JogaPage theme="dark" padded={false} bottomSpace>

      {/* HERO */}
      <div
        className="relative overflow-hidden"
        style={{
          background: "linear-gradient(155deg, #011206 0%, #04140A 55%, #07090D 100%)",
          paddingBottom: 28,
        }}
      >
        {/* Foto real (se falhar, fica o gradiente acima) */}
        <img
          src="/home/hero-ball.webp"
          alt=""
          aria-hidden="true"
          loading="eager"
          decoding="async"
          className="absolute inset-0 w-full h-full object-cover"
          style={{ objectPosition: "center 50%" }}
          onError={(e) => { e.currentTarget.style.display = "none"; }}
        />
        {/* Textura subtil por cima da foto */}
        <div className="absolute inset-0" style={{ backgroundImage: PITCH_SVG, backgroundSize: "80px 80px", opacity: 0.22 }} />
        {/* Véu — garante leitura sobre QUALQUER foto */}
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(180deg, rgba(7,9,13,0.55) 0%, rgba(7,9,13,0.05) 30%, rgba(7,9,13,0.10) 50%, rgba(7,9,13,0.82) 86%, #07090D 100%)" }}
        />

        {/* Topbar — igual ao original */}
        <div className="relative z-10 flex items-center justify-between px-5 pt-5 pb-4">
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

        {/* Carta à esquerda + nome/posição/stats ao lado — como no Perfil */}
        <div className="relative z-10 flex items-center gap-4 px-5 pt-1 pb-1">
          <HeroCard player={player} />
          <div className="flex-1 min-w-0">
            <p className="text-emerald-400 text-[10px] font-bold uppercase tracking-[0.24em] mb-1">Em destaque</p>
            <h1 className="font-display font-black text-white uppercase leading-none tracking-tight" style={{ fontSize: "1.35rem" }}>
              {player.name.split(" ")[0]}
            </h1>
            <h1 className="font-display font-black text-white uppercase leading-none tracking-tight -mt-0.5" style={{ fontSize: "1.35rem" }}>
              {player.name.split(" ").slice(1).join(" ")}
            </h1>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider" style={{ background: "rgba(74,222,128,0.2)", color: "#4ade80", border: "1px solid rgba(74,222,128,0.3)" }}>{player.position}</span>
              <span className="text-white/40 text-[10px]">·</span>
              <span className="text-white/60 text-[11px] font-medium">{player.title}</span>
            </div>
            <div className="flex items-center gap-4 mt-4">
              {[{ v: player.seasonStats.goals, l: "Golos" }, { v: player.seasonStats.assists, l: "Assist." }, { v: player.seasonStats.matches, l: "Jogos" }].map((s, i) => (
                <div key={s.l} className="flex items-center gap-4">
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
              <JogaButton
                variant="primary"
                size="sm"
                className="shrink-0 px-4"
                onClick={() => openAuth({
                  mode: "register",
                  title: "Cria conta para guardar a carta",
                  description: "Podes ver a carta no Perfil. Para sincronizar na nuvem, regista-te.",
                })}
              >
                Montar carta
              </JogaButton>
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

        {/* AS MINHAS PARTIDAS */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display font-black text-white text-lg">As minhas partidas</h2>
            <Link href="/jogos"><span className="joga-link text-emerald-400 text-sm font-semibold flex items-center gap-0.5">Ver todas <ChevronRight className="w-3.5 h-3.5" /></span></Link>
          </div>
          {!isLinked ? (
            <JogaCard variant="arena" padding="md" className="text-center">
              <p className="text-white/50 text-sm">Cria conta para veres as tuas partidas.</p>
            </JogaCard>
          ) : myMatches.length === 0 ? (
            <JogaCard variant="arena" padding="md" className="text-center">
              <p className="text-white/50 text-sm">Sem jogos agendados.</p>
              <Link href="/jogos" className="inline-block mt-2 text-emerald-400 text-sm font-semibold">Explorar jogos</Link>
            </JogaCard>
          ) : (
            <div className="space-y-3">
              {myMatches.slice(0, 2).map((match) => {
                const emphasis = matchCardEmphasis(match.priority);
                return (
                  <Link key={match.id} href={matchHref(match)}>
                    <div
                      className={`rounded-2xl overflow-hidden joga-tap relative ${emphasis.scale}`}
                      style={{
                        background: "rgba(255,255,255,0.05)",
                        border: emphasis.border,
                        boxShadow: "0 2px 16px rgba(0,0,0,0.3)",
                      }}
                    >
                      {emphasis.pulse && (
                        <span className="absolute top-3 right-3 w-2.5 h-2.5 rounded-full bg-red-400 animate-pulse" />
                      )}
                      <img
                        src="/home/band-cage.webp"
                        alt=""
                        aria-hidden="true"
                        loading="lazy"
                        decoding="async"
                        className="absolute inset-0 w-full h-full object-cover"
                        style={{ opacity: 0.5 }}
                        onError={(e) => { e.currentTarget.remove(); }}
                      />
                      <div className="absolute inset-0" style={{ background: "linear-gradient(90deg, rgba(7,9,13,0.9) 0%, rgba(7,9,13,0.55) 60%, rgba(7,9,13,0.35) 100%)" }} />
                      <div
                        className="h-1 relative z-10"
                        style={{
                          background:
                            match.priority === 1
                              ? "linear-gradient(90deg, #ef4444, #f87171)"
                              : match.priority === 2
                                ? "linear-gradient(90deg, #ca8a04, #facc15)"
                                : "linear-gradient(90deg, #16a34a, #059669)",
                        }}
                      />
                      <div className="px-4 pt-3.5 pb-3 relative z-10">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40">
                              {match.priorityLabel}
                            </p>
                            <p className="font-display font-black text-white text-lg leading-tight mt-0.5">
                              {match.title}
                            </p>
                            <p className="text-sm mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>
                              📍 {match.location || match.city}
                            </p>
                          </div>
                          <div className="text-right shrink-0 ml-3">
                            <p className="font-display font-bold text-white text-sm leading-none">{match.date}</p>
                            {match.scheduledTime && (
                              <p className="text-emerald-300 text-xs font-bold mt-1">{match.scheduledTime.slice(0, 5)}</p>
                            )}
                          </div>
                        </div>
                        {match.pendingVote && (
                          <p className="text-amber-300 text-xs font-bold mt-2">🗳️ Votar agora</p>
                        )}
                        {match.voted && match.status === "aguardando_auditoria" && (
                          <p className="text-emerald-300/80 text-xs font-semibold mt-2">✓ Voto registado</p>
                        )}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* PRÓXIMO JOGO (descobrir) */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display font-black text-white text-lg">Descobrir perto</h2>
            <Link href="/jogos"><span className="joga-link text-emerald-400 text-sm font-semibold flex items-center gap-0.5">Ver todos <ChevronRight className="w-3.5 h-3.5" /></span></Link>
          </div>
          {available.length === 0 ? (
            <JogaCard variant="arena" padding="md" className="text-center">
              <p className="text-white/50 text-sm">Sem jogos abertos por perto.</p>
            </JogaCard>
          ) : (
          <Link href={`/partida/${available[0].id}/pre-jogo`}>
          <div className="relative rounded-2xl overflow-hidden joga-tap" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 2px 16px rgba(0,0,0,0.3)" }}>
            <img
              src="/home/band-cage.webp"
              alt=""
              aria-hidden="true"
              loading="lazy"
              decoding="async"
              className="absolute inset-0 w-full h-full object-cover"
              style={{ opacity: 0.42, objectPosition: "center 60%" }}
              onError={(e) => { e.currentTarget.remove(); }}
            />
            <div className="absolute inset-0" style={{ background: "linear-gradient(90deg, rgba(7,9,13,0.9) 0%, rgba(7,9,13,0.55) 60%, rgba(7,9,13,0.35) 100%)" }} />
            <div className="h-1 relative z-10" style={{ background: "linear-gradient(90deg, #16a34a, #059669, #2563eb)" }} />
            <div className="px-4 pt-3.5 pb-3 relative z-10">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-display font-black text-white text-lg leading-tight">{available[0].title}</p>
                  <p className="text-sm mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>📍 {available[0].location || available[0].city}</p>
                </div>
                <div className="text-right shrink-0 ml-3">
                  <p className="font-display font-bold text-white text-sm leading-none">{available[0].date}</p>
                </div>
              </div>
            </div>
          </div>
          </Link>
          )}
        </div>

        {/* EVOLUÇÃO (teaser para o perfil) */}
        <Link href="/perfil">
          <div className="relative rounded-2xl overflow-hidden joga-tap" style={{ minHeight: 120, border: "1px solid rgba(255,255,255,0.08)" }}>
            <img
              src="/home/band-player.webp"
              alt=""
              aria-hidden="true"
              loading="lazy"
              decoding="async"
              className="absolute inset-0 w-full h-full object-cover"
              style={{ objectPosition: "center 28%" }}
              onError={(e) => { e.currentTarget.remove(); }}
            />
            <div className="absolute inset-0" style={{ background: "linear-gradient(90deg, rgba(7,9,13,0.92) 0%, rgba(7,9,13,0.5) 60%, rgba(7,9,13,0.15) 100%)" }} />
            <div className="relative z-10 p-4">
              <p className="text-emerald-400 text-[9.5px] font-bold uppercase tracking-[0.2em]">A tua evolução</p>
              <h3 className="font-display font-black text-white text-lg mt-1">Vê o teu histórico</h3>
              <p className="text-white/70 text-xs mt-0.5 max-w-[220px]">Como a tua carta evoluiu ao longo das peladas.</p>
              <span className="inline-flex items-center gap-1 text-emerald-400 text-xs font-semibold mt-2">Ver o meu perfil <ChevronRight className="w-3.5 h-3.5" /></span>
            </div>
          </div>
        </Link>

        {/* COMUNIDADES */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display font-black text-white text-lg">Clubes</h2>
            <Link href="/comunidades"><span className="joga-link text-emerald-400 text-sm font-semibold flex items-center gap-0.5">Ver todas <ChevronRight className="w-3.5 h-3.5" /></span></Link>
          </div>
          <div className="relative rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
            <img
              src="/home/band-stands.webp"
              alt=""
              aria-hidden="true"
              loading="lazy"
              decoding="async"
              className="absolute inset-0 w-full h-full object-cover"
              style={{ opacity: 0.35, objectPosition: "center 40%" }}
              onError={(e) => { e.currentTarget.remove(); }}
            />
            <div className="absolute inset-0" style={{ background: "linear-gradient(0deg, rgba(7,9,13,0.9) 0%, rgba(7,9,13,0.6) 100%)" }} />
            <div className="relative z-10 flex gap-6 overflow-x-auto px-4 pt-4 pb-4">
              {communities.map((c) => <CommunityPill key={c.id} c={c} />)}
              <Link href="/comunidades">
                <div className="shrink-0 flex flex-col items-center gap-2 active:scale-95 transition-transform">
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center border-2 border-dashed" style={{ background: "rgba(255,255,255,0.06)", borderColor: "rgba(255,255,255,0.18)" }}>
                    <Plus className="w-5 h-5" style={{ color: "rgba(255,255,255,0.5)" }} />
                  </div>
                  <p className="text-[11px] font-medium" style={{ color: "rgba(255,255,255,0.6)" }}>Explorar</p>
                </div>
              </Link>
            </div>
          </div>
        </div>

        <SponsorSlot />

        <InstallAppBanner />

      </div>
    </JogaPage>
  );
}
