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
  type Community,
  type MatchListing,
  type CommunityMember,
  type JoinRequestStatus,
} from "@/lib/communityRepository";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthGate } from "@/contexts/AuthGateContext";
import { useUserProfile } from "@/hooks/useUserProfile";
import { JogaButton, JogaCard, JogaChip, JogaPage } from "@/components/joga";
import { loadCommunityMatchResults, type MatchResult } from "@/lib/matchHistoryRepository";
import { generateMatchNarrative } from "@/lib/matchNarrative";
import { RankingList } from "@/components/RankingList";
import {
  loadCommunityPlayerStats,
  computeLeaderboard,
  loadCommunityRivalries,
  type CommunityPlayerStats,
} from "@/lib/communityStatsRepository";
import { CommunityDuel, RivalryCard } from "@/components/CommunityDuel";
import { imageDisplaySrc } from "@/lib/imageUtils";
import { loadPublicProfiles, type PublicUserProfile } from "@/lib/userRepository";
import { toast } from "@/hooks/use-toast";

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

export default function ComunidadePage() {
  const { requireLinked } = useAuthGate();
  const { userId, isLinked } = useAuth();
  const { profile } = useUserProfile();
  const [, params] = useRoute("/comunidades/:id");
  const [activeTab, setActiveTab] = useState<CommunityTab>(parseCommunityTab);
  const id = params?.id || "";

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
  const [matches, setMatches] = useState<MatchListing[]>([]);
  const [members, setMembers] = useState<CommunityMember[]>([]);
  const [joinStatus, setJoinStatus] = useState<JoinRequestStatus | null>(null);
  const [results, setResults] = useState<MatchResult[]>([]);
  const [joining, setJoining] = useState(false);
  const [playerStats, setPlayerStats] = useState<CommunityPlayerStats[]>([]);
  const [rivalries, setRivalries] = useState<Awaited<ReturnType<typeof loadCommunityRivalries>>>([]);
  const [duelTargetId, setDuelTargetId] = useState<string>("");
  const [memberProfiles, setMemberProfiles] = useState<Map<string, PublicUserProfile>>(new Map());

  async function refreshCommunity() {
    const c = await loadCommunity(id, userId);
    setCommunity(c);
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
    return members
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
      });
  }, [members, playerStats, memberProfiles, userId]);

  if (!community) {
    return (
      <JogaPage theme="dark" className="py-10 text-center">
        <p className="text-white/50">A carregar comunidade…</p>
      </JogaPage>
    );
  }

  const isMember = community.isMember;
  const isAdmin = community.adminId === userId;
  const joinPending = joinStatus === "pending" || Boolean((community as Community & { joinPending?: boolean }).joinPending);
  const hasAccess = isMember || isAdmin;
  const coverSrc = imageDisplaySrc(community.coverImage);
  const displayMemberCount = members.length > 0 ? members.length : community.memberCount;

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
      <div className="relative h-44 joga-hero-arena overflow-hidden">
        {coverSrc ? (
          <img
            src={coverSrc}
            alt={community.name}
            className="w-full h-full object-cover opacity-60"
          />
        ) : (
          <div className="w-full h-full bg-linear-to-br from-emerald-900 to-emerald-950" />
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
          <h1 className="font-display font-bold text-white text-2xl leading-tight drop-shadow-md">
            {community.name}
          </h1>
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
          <Link href={`/comunidades/${id}/configuracoes`}>
            <JogaButton variant="ghost" size="sm" className="w-full">⚙️ Configurar comunidade</JogaButton>
          </Link>
        )}

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

        {!isMember && !isAdmin && isLinked && (
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

        {!isLinked && (
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
              results.map((r) => (
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
                </JogaCard>
              ))
            )}
          </div>
        )}

        {hasAccess && activeTab === "liga" && (
          <div className="space-y-4">
            {playerStats.length === 0 ? (
              <p className="text-white/40 text-sm text-center py-8">Sem dados de liga ainda.</p>
            ) : (
              <>
                <RankingList
                  title="Golos"
                  entries={computeLeaderboard(playerStats, "goals")}
                />
                <RankingList
                  title="Assistências"
                  entries={computeLeaderboard(playerStats, "assists")}
                />
                <RankingList
                  title="Nota média"
                  entries={computeLeaderboard(playerStats, "avgRating")}
                />
                <RankingList
                  title="MVP"
                  entries={computeLeaderboard(playerStats, "mvp")}
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

            {rivalries.length > 0 && (
              <div className="space-y-3">
                <h3 className="font-display font-black text-white text-lg">As tuas rivalidades</h3>
                {rivalries.map((r) => (
                  <RivalryCard key={r.pairId} rivalry={r} currentUserId={userId} />
                ))}
              </div>
            )}
          </div>
        )}

        {hasAccess && activeTab === "membros" && (
          <div className="space-y-3">
            {members.length === 0 ? (
              <p className="text-white/40 text-sm text-center py-8">Sem membros listados.</p>
            ) : (
              members.map((m) => {
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
