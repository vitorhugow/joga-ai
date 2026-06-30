import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import { Users, MapPin, ChevronLeft, Lock, Calendar } from "lucide-react";
import { Link } from "wouter";
import { MatchCard } from "@/components/MatchCard";
import { PlayerMiniCard } from "@/components/PlayerMiniCard";
import {
  loadCommunity,
  loadAvailableMatches,
  loadCommunityMembers,
  requestToJoin,
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
import { imageDisplaySrc } from "@/lib/imageUtils";
import { toast } from "@/hooks/use-toast";

const gameTypeLabel: Record<string, string> = {
  futsal: "Futsal",
  fut5: "Fut 5",
  fut7: "Fut 7",
  futebol11: "Fut 11",
};

export default function ComunidadePage() {
  const { requireLinked } = useAuthGate();
  const { userId, isLinked } = useAuth();
  const { profile } = useUserProfile();
  const [, params] = useRoute("/comunidades/:id");
  const [activeTab, setActiveTab] = useState<"partidas" | "membros" | "resultados">("partidas");
  const id = params?.id || "";

  const [community, setCommunity] = useState<Community | null>(null);
  const [matches, setMatches] = useState<MatchListing[]>([]);
  const [members, setMembers] = useState<CommunityMember[]>([]);
  const [joinStatus, setJoinStatus] = useState<JoinRequestStatus | null>(null);
  const [results, setResults] = useState<MatchResult[]>([]);
  const [joining, setJoining] = useState(false);

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
    loadAvailableMatches().then((all) =>
      setMatches(all.filter((m) => m.communityId === id)),
    );
    loadCommunityMatchResults(id).then(setResults);
  }, [id, userId]);

  useEffect(() => {
    if (!id || !community?.isMember) return;
    loadCommunityMembers(id).then(setMembers);
  }, [id, community?.isMember]);

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

  async function handleRequestJoin() {
    if (!requireLinked({ mode: "register", title: "Cria conta para entrar na comunidade" })) {
      return;
    }
    if (!community || isMember || joinPending || isAdmin) return;

    setJoining(true);
    try {
      await requestToJoin(id, userId, profile.displayName || "Jogador");
      setJoinStatus("pending");
      await refreshCommunity();
      toast({
        title: "Pedido enviado",
        description: "O administrador vai rever o teu pedido.",
      });
    } catch {
      toast({ title: "Erro ao pedir entrada", variant: "destructive" });
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
    { key: "membros", label: "Membros" },
  ] as const;

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
              <span>{community.memberCount} membros</span>
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
          <p className="text-emerald-400 text-xs font-semibold text-center">És o administrador desta comunidade</p>
        )}

        {/* Pré-visualização para não-membros */}
        {!hasAccess && (
          <JogaCard variant="arena" padding="md">
            <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest mb-2">Sobre</p>
            <p className="text-white/80 text-sm leading-relaxed">
              Comunidade de {gameTypeLabel[community.gameType] || community.gameType} em {community.city}.
              {community.isPrivate
                ? " Entrada sujeita a aprovação do administrador."
                : " Entrada sujeita a aprovação do administrador."}
            </p>
            <div className="flex gap-4 mt-4 text-sm text-white/55">
              <span className="flex items-center gap-1.5">
                <Users className="w-4 h-4 text-emerald-400" />
                {community.memberCount} membros
              </span>
              <span className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-emerald-400" />
                {matches.length} partida{matches.length !== 1 ? "s" : ""} aberta{matches.length !== 1 ? "s" : ""}
              </span>
            </div>
            <p className="text-white/35 text-xs mt-3">
              Depois de aprovado vês a lista de membros, partidas e resultados.
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
            {joinPending ? "Pedido pendente" : "Pedir para entrar"}
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
              onClick={() => setActiveTab(tab.key)}
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
            {matches.length === 0 ? (
              <p className="text-white/40 text-sm text-center py-8">Sem partidas nesta comunidade.</p>
            ) : (
              matches.map((m) => <MatchCard key={m.id} {...m} returnTo={`/comunidades/${id}`} />)
            )}
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

        {hasAccess && activeTab === "membros" && (
          <div className="space-y-3">
            {members.length === 0 ? (
              <p className="text-white/40 text-sm text-center py-8">Sem membros listados.</p>
            ) : (
              members.map((m) => (
                <JogaCard key={m.userId} variant="arena">
                  <PlayerMiniCard
                    name={m.displayName}
                    position={m.role === "admin" ? "ADM" : "MEM"}
                    overall={0}
                    subtitle={m.role === "admin" ? "Administrador" : "Membro"}
                  />
                </JogaCard>
              ))
            )}
          </div>
        )}
      </div>
    </JogaPage>
  );
}
