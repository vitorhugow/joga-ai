import { useEffect, useMemo, useState } from "react";
import { useRoute } from "wouter";
import { Users, MapPin, ChevronLeft, Lock, Calendar } from "lucide-react";
import { Link } from "wouter";
import { MatchCard } from "@/components/MatchCard";
import { PlayerMiniCard } from "@/components/PlayerMiniCard";
import {
  loadCommunity,
  loadCommunityMatches,
  subscribeCommunityMatches,
  loadCommunityMembers,
  syncCommunityMemberCount,
  requestToJoin,
  joinCommunityPublic,
  leaveCommunity,
  getJoinRequestStatus,
  isCommunityOrganizerPro,
  isCommunityAdmin,
  createCommunityInvite,
  joinCommunityViaInvite,
  type Community,
  type MatchListing,
  type CommunityMember,
  type JoinRequestStatus,
} from "@/lib/communityRepository";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthGate } from "@/contexts/AuthGateContext";
import { useUserProfile } from "@/hooks/useUserProfile";
import { JogaButton, JogaCard, JogaChip, JogaPage } from "@/components/joga";
import { loadCommunityMatchResults, type MatchResult, type MatchPlayerResult } from "@/lib/matchHistoryRepository";
import { generateMatchNarrative } from "@/lib/matchNarrative";
import { RankingList } from "@/components/RankingList";
import {
  loadCommunityPlayerStats,
  loadCommunityPlayerStatsForPeriod,
  computeLeaderboard,
  loadCommunityRivalries,
  type CommunityPlayerStats,
} from "@/lib/communityStatsRepository";
import { CommunityDuel, RivalryCard } from "@/components/CommunityDuel";
import { imageDisplaySrc, resolveCommunityCover } from "@/lib/imageUtils";
import { loadPublicProfiles, type PublicUserProfile } from "@/lib/userRepository";
import { loadBlockedIds, filterBlocked } from "@/lib/blockRepository";
import { ReportBlockActions } from "@/components/ReportBlockActions";
import { MensalistaCard } from "@/components/MensalistaCard";
import { getContrastTextColor } from "@/lib/colorContrast";
import { trackEvent } from "@/lib/analytics";
import { toast } from "@/hooks/use-toast";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

const gameTypeLabel: Record<string, string> = {
  futsal: "Futsal",
  fut5: "Fut 5",
  fut7: "Fut 7",
  futebol11: "Fut 11",
};

const COMMUNITY_TABS = ["partidas", "membros", "resultados", "liga", "duelos"] as const;
type CommunityTab = (typeof COMMUNITY_TABS)[number];

function parseCommunityTab(): CommunityTab {
  const tab = new URLSearchParams(window.location.search).get("tab");
  return COMMUNITY_TABS.includes(tab as CommunityTab) ? (tab as CommunityTab) : "partidas";
}

const MATCH_RANKING_LABELS: Record<"goals" | "assists" | "saves" | "rating", string> = {
  goals: "golos",
  assists: "assist.",
  saves: "defesas",
  rating: "nota",
};

/** Ranking dos jogadores de UMA partida (goals/assists/saves/rating). */
function buildMatchRanking(
  players: MatchPlayerResult[],
  metric: "goals" | "assists" | "saves" | "rating",
) {
  const valueLabel = MATCH_RANKING_LABELS[metric];
  return [...players]
    .filter((p) => (metric === "rating" ? p.rating > 0 : true))
    .sort((a, b) => b[metric] - a[metric])
    .map((p, index) => ({
      rank: index + 1,
      name: p.name,
      position: "MEM",
      overall: Math.round(p.rating * 10) || 50,
      value: metric === "rating" ? p.rating.toFixed(1) : p[metric],
      valueLabel,
    }));
}

export default function ComunidadePage() {
  const { requireLinked } = useAuthGate();
  const { userId, isLinked } = useAuth();
  const { profile } = useUserProfile();
  const [, params] = useRoute("/comunidades/:id");
  const [activeTab, setActiveTab] = useState<CommunityTab>(parseCommunityTab);
  const id = params?.id || "";
  const inviteToken = new URLSearchParams(window.location.search).get("invite") || "";
  const [invitingBusy, setInvitingBusy] = useState(false);
  const [acceptingInvite, setAcceptingInvite] = useState(false);

  function selectTab(tab: CommunityTab) {
    setActiveTab(tab);
    const url = new URL(window.location.href);
    if (tab === "partidas") url.searchParams.delete("tab");
    else url.searchParams.set("tab", tab);
    window.history.replaceState({}, "", `${url.pathname}${url.search}`);
  }

  useEffect(() => {
    setActiveTab(parseCommunityTab());
  }, [id]);

  const [community, setCommunity] = useState<Community | null>(null);
  useDocumentTitle(community?.name ?? "Comunidade");
  const [matches, setMatches] = useState<MatchListing[]>([]);
  const [members, setMembers] = useState<CommunityMember[]>([]);
  const [joinStatus, setJoinStatus] = useState<JoinRequestStatus | null>(null);
  const [results, setResults] = useState<MatchResult[]>([]);
  const [joining, setJoining] = useState(false);
  const [playerStats, setPlayerStats] = useState<CommunityPlayerStats[]>([]);
  const [monthlyPlayerStats, setMonthlyPlayerStats] = useState<CommunityPlayerStats[]>([]);
  const [leaguePeriod, setLeaguePeriod] = useState<"month" | "season">("month");
  const [showLastMatchRanking, setShowLastMatchRanking] = useState(false);
  const [rivalries, setRivalries] = useState<Awaited<ReturnType<typeof loadCommunityRivalries>>>([]);
  const [duelTargetId, setDuelTargetId] = useState<string>("");
  const [memberProfiles, setMemberProfiles] = useState<Map<string, PublicUserProfile>>(new Map());
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set());
  const [organizerProActive, setOrganizerProActive] = useState(false);

  useEffect(() => {
    if (!userId) {
      setBlockedIds(new Set());
      return;
    }
    void loadBlockedIds(userId).then(setBlockedIds);
  }, [userId]);

  async function refreshCommunity() {
    const c = await loadCommunity(id, userId);
    setCommunity(c);
    if (c) {
      void isCommunityOrganizerPro(id).then(setOrganizerProActive);
    } else {
      setOrganizerProActive(false);
    }
    if (userId) {
      const status = await getJoinRequestStatus(id, userId);
      setJoinStatus(status);
    }
  }

  useEffect(() => {
    if (!id) return;
    void refreshCommunity();
    const unsubMatches = subscribeCommunityMatches(id, (next) => {
      setMatches(next);
      void loadCommunityMatchResults(id).then(setResults);
    });
    loadCommunityPlayerStats(id).then(setPlayerStats);
    loadCommunityPlayerStatsForPeriod(id, "month").then(setMonthlyPlayerStats);
    if (userId) {
      loadCommunityRivalries(id, userId).then(setRivalries);
    }
    return () => unsubMatches();
  }, [id, userId]);

  useEffect(() => {
    if (!id || !community) return;
    const hasMemberAccess = community.isMember || community.adminId === userId;
    if (!hasMemberAccess) return;
    void loadCommunityMembers(id).then(async (list) => {
      setMembers(list);
      if (list.length !== community.memberCount) {
        const synced = await syncCommunityMemberCount(id);
        setCommunity((c) => (c ? { ...c, memberCount: synced } : c));
      }
    });
  }, [id, community?.isMember, community?.adminId, community?.memberCount, userId]);

  useEffect(() => {
    if (!members.length) {
      setMemberProfiles(new Map());
      return;
    }
    void loadPublicProfiles(members.map((m) => m.userId)).then(setMemberProfiles);
  }, [members]);

  const duelCandidates = useMemo(() => {
    const statsById = new Map(playerStats.map((s) => [s.userId, s]));
    return filterBlocked(
      members
        .filter((m) => m.userId !== userId)
        .map((m) => {
          const stats = statsById.get(m.userId);
          const profile = memberProfiles.get(m.userId);
          if (stats) return stats;
          return {
            userId: m.userId,
            name: profile?.displayName || m.displayName,
            goals: 0,
            assists: 0,
            matches: 0,
            mvpCount: 0,
            ratingSum: 0,
            ratingCount: 0,
            avgRating: 0,
          } satisfies CommunityPlayerStats;
        }),
      blockedIds,
    );
  }, [members, playerStats, memberProfiles, userId, blockedIds]);

  const visibleMembers = useMemo(
    () => filterBlocked(members, blockedIds),
    [members, blockedIds],
  );

  const visiblePlayerStats = useMemo(
    () => filterBlocked(playerStats, blockedIds),
    [playerStats, blockedIds],
  );

  const visibleMonthlyPlayerStats = useMemo(
    () => filterBlocked(monthlyPlayerStats, blockedIds),
    [monthlyPlayerStats, blockedIds],
  );

  const visibleLeagueStats = leaguePeriod === "month" ? visibleMonthlyPlayerStats : visiblePlayerStats;

  const visibleRivalries = useMemo(
    () =>
      rivalries.filter(
        (r) => !blockedIds.has(r.userIdA) && !blockedIds.has(r.userIdB),
      ),
    [rivalries, blockedIds],
  );

  if (!community) {
    return (
      <JogaPage theme="dark" className="py-10 text-center">
        <p className="text-white/50">A carregar comunidade…</p>
      </JogaPage>
    );
  }

  const isMember = community.isMember;
  const isAdmin = isCommunityAdmin(community, userId);
  const joinPending = joinStatus === "pending" || Boolean((community as Community & { joinPending?: boolean }).joinPending);
  const hasAccess = isMember || isAdmin;
  const coverSrc = imageDisplaySrc(
    community.branding?.bannerUrl || resolveCommunityCover(community),
  );
  const brandColor =
    organizerProActive && community.branding?.primaryColor
      ? community.branding.primaryColor
      : undefined;
  // Clube PRO é da comunidade (via admin principal), não do perfil de quem
  // vê — assim um admin adicional também vê o Dashboard já desbloqueado.
  const orgPro = organizerProActive;
  const displayMemberCount = visibleMembers.length > 0 ? visibleMembers.length : community.memberCount;

  async function handleRequestJoin() {
    if (!requireLinked({ mode: "register", title: "Cria conta para entrar na comunidade" })) {
      return;
    }
    if (!community || isMember || isAdmin) return;

    if (joinPending) {
      toast({
        title: "Pedido pendente",
        description: "O administrador ainda não aprovou o teu pedido.",
      });
      return;
    }

    setJoining(true);
    try {
      if (community.isPrivate) {
        await requestToJoin(id, userId, profile.displayName || "Jogador");
        trackEvent("community_join_requested", { communityId: id });
        setJoinStatus("pending");
        await refreshCommunity();
        toast({
          title: "Pedido enviado",
          description: "Aguarda aprovação do administrador para entrar na comunidade.",
        });
      } else {
        await joinCommunityPublic(id, userId, profile.displayName || "Jogador");
        await refreshCommunity();
        loadCommunityMembers(id).then(setMembers);
        toast({
          title: "Entraste na comunidade!",
          description: `Bem-vindo a ${community.name}.`,
        });
      }
    } catch {
      toast({ title: "Erro ao entrar", variant: "destructive" });
    } finally {
      setJoining(false);
    }
  }

  async function handleAcceptInvite() {
    if (!requireLinked({ mode: "register", title: "Cria conta para aceitar o convite" })) {
      return;
    }
    if (!community || isMember || isAdmin || !inviteToken) return;

    setAcceptingInvite(true);
    try {
      await joinCommunityViaInvite(id, inviteToken, userId, profile.displayName || "Jogador");
      await refreshCommunity();
      loadCommunityMembers(id).then(setMembers);
      trackEvent("community_join_via_invite", { communityId: id });
      toast({ title: "Entraste na comunidade!", description: `Bem-vindo a ${community.name}.` });
    } catch (err) {
      toast({
        title: "Não foi possível aceitar o convite",
        description: err instanceof Error ? err.message : "Tenta outra vez.",
        variant: "destructive",
      });
    } finally {
      setAcceptingInvite(false);
    }
  }

  async function handleInvitePlayers() {
    if (!userId) return;
    setInvitingBusy(true);
    try {
      const token = await createCommunityInvite(id, userId);
      const url = `${window.location.origin}/comunidades/${id}?invite=${token}`;
      if (navigator.share) {
        await navigator.share({ title: `Junta-te a ${community?.name ?? "esta comunidade"}`, url });
      } else {
        await navigator.clipboard.writeText(url);
        toast({ title: "Link copiado!", description: "Partilha com quem quiseres convidar." });
      }
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;
      toast({
        title: "Não foi possível criar o convite",
        description: err instanceof Error ? err.message : "Tenta outra vez.",
        variant: "destructive",
      });
    } finally {
      setInvitingBusy(false);
    }
  }

  async function handleLeave() {
    if (!window.confirm("Queres sair desta comunidade?")) return;
    setJoining(true);
    try {
      await leaveCommunity(id, userId);
      setMembers([]);
      await refreshCommunity();
      toast({ title: "Saíste da comunidade" });
    } catch (err) {
      toast({
        title: "Não foi possível sair",
        description: err instanceof Error ? err.message : "Tenta novamente.",
        variant: "destructive",
      });
    } finally {
      setJoining(false);
    }
  }

  const tabs = [
    { key: "partidas", label: "Partidas" },
    { key: "resultados", label: "Resultados" },
    { key: "liga", label: "Liga" },
    { key: "duelos", label: "Duelos" },
    { key: "membros", label: "Membros" },
  ] as const;

  const myStats = userId ? playerStats.find((s) => s.userId === userId) : null;

  const duelTarget = duelTargetId
    ? duelCandidates.find((s) => s.userId === duelTargetId)
    : null;

  return (
    <JogaPage theme="dark" padded={false}>
      <div
        className="relative h-44 joga-hero-arena overflow-hidden"
        style={brandColor ? { boxShadow: `inset 0 -40px 60px ${brandColor}33` } : undefined}
      >
        {coverSrc ? (
          <img
            src={coverSrc}
            alt={community.name}
            className="w-full h-full object-cover opacity-60"
          />
        ) : (
          <div
            className="w-full h-full"
            style={{
              background: brandColor
                ? `linear-gradient(135deg, ${brandColor}88, #052010)`
                : undefined,
            }}
          >
            {!brandColor && <div className="w-full h-full bg-linear-to-br from-emerald-900 to-emerald-950" />}
          </div>
        )}
        <div className="absolute inset-0 bg-linear-to-t from-black/70 to-transparent" />
        <Link
          href="/comunidades"
          className="joga-tap absolute top-4 left-4 w-9 h-9 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center border border-white/15"
          data-testid="button-back"
        >
          <ChevronLeft className="w-5 h-5 text-white" />
        </Link>
        <div className="absolute bottom-4 left-4 right-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h1 className="font-display font-bold text-white text-2xl leading-tight drop-shadow-md">
                {community.name}
                {organizerProActive && (
                  <span className="ml-2 align-middle inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wide bg-amber-400/15 text-amber-300 border border-amber-400/35">
                    ✦ Clube PRO
                  </span>
                )}
              </h1>
              {community.branding?.logoUrl && organizerProActive && (
                <img
                  src={community.branding.logoUrl}
                  alt=""
                  className="h-8 w-8 rounded-lg object-cover mt-2 border border-white/20"
                />
              )}
            </div>
            {userId && community.adminId !== userId ? (
              <ReportBlockActions
                targetType="community"
                targetId={id}
                targetLabel={community.name}
              />
            ) : null}
          </div>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <div className="flex items-center gap-1 text-white/80 text-xs">
              <MapPin className="w-3 h-3" />
              <span>{community.city}</span>
            </div>
            <div className="flex items-center gap-1 text-white/80 text-xs">
              <Users className="w-3 h-3" />
              <span>{displayMemberCount} membros</span>
            </div>
            <span className="bg-white/20 text-white text-xs font-semibold px-2 py-0.5 rounded-full">
              {gameTypeLabel[community.gameType] || community.gameType}
            </span>
            {community.isPrivate && (
              <span className="flex items-center gap-1 bg-amber-500/20 text-amber-300 text-xs font-semibold px-2 py-0.5 rounded-full">
                <Lock className="w-3 h-3" />
                Privada
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="px-4 pt-4 space-y-4">
        {isAdmin && (
          <div className="flex gap-2">
            <Link href={`/comunidades/${id}/configuracoes`} className="flex-1">
              <JogaButton variant="ghost" size="sm" className="w-full">⚙️ Configurar</JogaButton>
            </Link>
            <JogaButton
              variant="ghost"
              size="sm"
              className="flex-1"
              disabled={invitingBusy}
              onClick={() => void handleInvitePlayers()}
              data-testid="button-invite-players"
            >
              👥 Convidar
            </JogaButton>
            {orgPro && (
              <Link href={`/comunidades/${id}/dashboard`} className="flex-1">
                <JogaButton
                  variant="gold"
                  size="sm"
                  className="w-full"
                  style={brandColor ? { background: brandColor, color: getContrastTextColor(brandColor) } : undefined}
                >
                  📊 Dashboard
                </JogaButton>
              </Link>
            )}
          </div>
        )}

        {hasAccess && <MensalistaCard community={community} userId={userId} />}

        {isAdmin && isMember && (
          <p className="text-emerald-400 text-xs font-semibold text-center mt-5 pt-1">
            És o administrador desta comunidade
          </p>
        )}

        {/* Pré-visualização para não-membros */}
        {!hasAccess && (
          <JogaCard variant="arena" padding="md">
            <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest mb-2">Sobre</p>
            <p className="text-white/80 text-sm leading-relaxed">
              Comunidade de {gameTypeLabel[community.gameType] || community.gameType} em {community.city}.
              {community.isPrivate
                ? " Entrada sujeita a aprovação do administrador."
                : " Entrada livre — junta-te à malta."}
            </p>
            <div className="flex gap-4 mt-4 text-sm text-white/55">
              <span className="flex items-center gap-1.5">
                <Users className="w-4 h-4 text-emerald-400" />
                {displayMemberCount} membros
              </span>
              <span className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-emerald-400" />
                {matches.length} partida{matches.length !== 1 ? "s" : ""} aberta{matches.length !== 1 ? "s" : ""}
              </span>
            </div>
            <p className="text-white/35 text-xs mt-3">
              {community.isPrivate
                ? "Depois de aprovado vês a lista de membros, partidas e resultados."
                : "Ao entrar vês membros, partidas e resultados."}
            </p>
          </JogaCard>
        )}

        {isMember && !isAdmin && (
          <JogaButton
            variant="ghost"
            size="md"
            className="w-full text-red-300 border border-red-400/20"
            disabled={joining}
            onClick={() => void handleLeave()}
            data-testid="button-leave-community"
          >
            Sair da comunidade
          </JogaButton>
        )}

        {!isMember && !isAdmin && inviteToken && (
          <JogaCard variant="arena" padding="md" className="border-emerald-400/25 bg-emerald-400/8">
            <p className="text-emerald-300 text-[10px] font-bold uppercase tracking-widest">Convite</p>
            <p className="text-white text-sm mt-1">Foste convidado para esta comunidade.</p>
            <JogaButton
              variant="primary"
              size="lg"
              className="w-full mt-3"
              disabled={acceptingInvite}
              onClick={() => void handleAcceptInvite()}
              data-testid="button-accept-invite"
            >
              Aceitar convite e entrar
            </JogaButton>
          </JogaCard>
        )}

        {!isMember && !isAdmin && isLinked && !inviteToken && (
          <JogaButton
            variant="primary"
            size="lg"
            data-testid="button-join-community"
            disabled={joining || joinPending}
            onClick={() => void handleRequestJoin()}
          >
            {joinPending
              ? "Pedido pendente"
              : community.isPrivate
                ? "Pedir para entrar"
                : "Entrar na comunidade"}
          </JogaButton>
        )}

        {!isLinked && !inviteToken && (
          <JogaButton
            variant="primary"
            size="lg"
            onClick={() =>
              requireLinked({
                mode: "register",
                title: "Cria conta para entrar na comunidade",
              })
            }
          >
            Entrar com conta para pedir acesso
          </JogaButton>
        )}

        <div className="flex gap-2 flex-wrap" style={{ display: hasAccess ? "flex" : "none" }}>
          {tabs.map((tab) => (
            <JogaChip
              key={tab.key}
              label={tab.label}
              active={activeTab === tab.key}
              onClick={() => selectTab(tab.key as CommunityTab)}
              testId={`tab-${tab.key}`}
            />
          ))}
        </div>

        {hasAccess && activeTab === "partidas" && (
          <div className="space-y-3">
            {(isAdmin || isMember) && (
              <Link href={`/criar-partida?communityId=${id}`}>
                <JogaButton variant="primary" size="md" className="w-full">
                  Criar partida na comunidade
                </JogaButton>
              </Link>
            )}
            <div className={`space-y-3 ${(isAdmin || isMember) ? "mt-6" : ""}`}>
              {matches.length === 0 ? (
                <p className="text-white/40 text-sm text-center py-8">Sem partidas nesta comunidade.</p>
              ) : (
                matches.map((m) => <MatchCard key={m.id} {...m} returnTo={`/comunidades/${id}`} />)
              )}
            </div>
          </div>
        )}

        {hasAccess && activeTab === "resultados" && (
          <div className="space-y-3">
            {results.length === 0 ? (
              <p className="text-white/40 text-sm text-center py-8">Sem resultados registados.</p>
            ) : (
              results.map((r, index) => (
                <JogaCard key={r.matchId} variant="arena">
                  <p className="font-display font-black text-white">{r.title}</p>
                  <p className="text-white/40 text-xs mt-1">
                    {new Date(r.completedAt).toLocaleDateString("pt-PT")}
                  </p>
                  <p className="text-white/55 text-sm mt-2 leading-relaxed">
                    {generateMatchNarrative({ matchResult: r, miniGames: [] })}
                  </p>
                  {r.topScorers?.[0] && (
                    <p className="text-emerald-400 text-sm mt-2">
                      Artilheiro: {r.topScorers[0].name} ({r.topScorers[0].goals} golos)
                    </p>
                  )}
                  <div className="mt-2 space-y-1">
                    {r.players.slice(0, 5).map((p) => (
                      <div key={p.playerId} className="flex justify-between text-xs text-white/60">
                        <span>{p.name}</span>
                        <span>Nota {p.rating > 0 ? p.rating.toFixed(1) : "—"}</span>
                      </div>
                    ))}
                  </div>

                  {/* Ranking completo da partida — só disponível para a última
                      (mais recente). Partidas mais antigas não mostram o botão. */}
                  {index === 0 && (
                    <>
                      <JogaButton
                        variant="ghost"
                        size="sm"
                        className="w-full mt-3"
                        onClick={() => setShowLastMatchRanking((v) => !v)}
                        data-testid="button-toggle-match-ranking"
                      >
                        {showLastMatchRanking ? "Fechar ranking da partida" : "Ver ranking da partida"}
                      </JogaButton>
                      {showLastMatchRanking && (
                        <div className="mt-3 space-y-3">
                          <RankingList title="Golos" entries={buildMatchRanking(r.players, "goals")} />
                          <RankingList title="Assistências" entries={buildMatchRanking(r.players, "assists")} />
                          <RankingList title="Defesas" entries={buildMatchRanking(r.players, "saves")} />
                          <RankingList title="Notas" entries={buildMatchRanking(r.players, "rating")} />
                        </div>
                      )}
                    </>
                  )}
                </JogaCard>
              ))
            )}
          </div>
        )}

        {hasAccess && activeTab === "liga" && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <JogaChip
                label="Liga mensal"
                active={leaguePeriod === "month"}
                onClick={() => setLeaguePeriod("month")}
                testId="liga-tab-mensal"
              />
              <JogaChip
                label="Liga época"
                active={leaguePeriod === "season"}
                onClick={() => setLeaguePeriod("season")}
                testId="liga-tab-epoca"
              />
            </div>

            {visibleLeagueStats.length === 0 ? (
              <p className="text-white/40 text-sm text-center py-8">
                {leaguePeriod === "month" ? "Sem jogos este mês ainda." : "Sem dados de liga ainda."}
              </p>
            ) : (
              <>
                <RankingList
                  title="Golos"
                  entries={computeLeaderboard(visibleLeagueStats, "goals")}
                />
                <RankingList
                  title="Assistências"
                  entries={computeLeaderboard(visibleLeagueStats, "assists")}
                />
                <RankingList
                  title="Nota média"
                  entries={computeLeaderboard(visibleLeagueStats, "avgRating")}
                />
                <RankingList
                  title="MVP"
                  entries={computeLeaderboard(visibleLeagueStats, "mvp")}
                />
              </>
            )}
          </div>
        )}

        {hasAccess && activeTab === "duelos" && (
          <div className="space-y-4">
            <JogaCard variant="arena" padding="md">
              <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest mb-2">
                Escolhe adversário
              </p>
              <select
                value={duelTargetId}
                onChange={(e) => setDuelTargetId(e.target.value)}
                className="w-full rounded-xl px-3 py-3 bg-white/5 border border-white/10 text-white text-sm"
              >
                <option value="">Seleciona um membro</option>
                {duelCandidates.map((s) => (
                  <option key={s.userId} value={s.userId}>
                    {s.name}
                  </option>
                ))}
              </select>
            </JogaCard>

            {duelTarget && (
              <CommunityDuel
                playerA={
                  myStats ?? {
                    userId: userId ?? "",
                    name: profile.displayName || "Tu",
                    goals: 0,
                    assists: 0,
                    matches: 0,
                    mvpCount: 0,
                    ratingSum: 0,
                    ratingCount: 0,
                    avgRating: 0,
                  }
                }
                playerB={duelTarget}
              />
            )}

            {visibleRivalries.length > 0 && (
              <div className="space-y-3">
                <h3 className="font-display font-black text-white text-lg">As tuas rivalidades</h3>
                {visibleRivalries.map((r) => (
                  <RivalryCard key={r.pairId} rivalry={r} currentUserId={userId} />
                ))}
              </div>
            )}
          </div>
        )}

        {hasAccess && activeTab === "membros" && (
          <div className="space-y-3">
            {visibleMembers.length === 0 ? (
              <p className="text-white/40 text-sm text-center py-8">Sem membros listados.</p>
            ) : (
              visibleMembers.map((m) => {
                const profile = memberProfiles.get(m.userId);
                const photoSrc = imageDisplaySrc(profile?.photoUrl);
                return (
                  <Link key={m.userId} href={`/perfil/${m.userId}?from=${encodeURIComponent(`/comunidades/${id}?tab=membros`)}`}>
                    <JogaCard variant="arena" className="joga-tap">
                      <PlayerMiniCard
                        name={profile?.displayName || m.displayName}
                        position={profile?.position || (m.role === "admin" ? "ADM" : "MEM")}
                        overall={profile?.overall ?? 50}
                        photoUrl={photoSrc}
                        variant="dark"
                        subtitle={m.role === "admin" ? "Administrador · Ver perfil" : "Membro · Ver perfil"}
                      />
                    </JogaCard>
                  </Link>
                );
              })
            )}
          </div>
        )}
      </div>
    </JogaPage>
  );
}
