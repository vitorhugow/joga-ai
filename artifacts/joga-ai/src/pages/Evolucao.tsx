import { useEffect, useState } from "react";
import { Link as WLink } from "wouter";
import { isProActive } from "@/lib/entitlements";
import { ProFeatureBadge } from "@/components/ProFeatureBadge";
import { useUserProfile } from "@/hooks/useUserProfile";
import { Link } from "wouter";
import { ChevronLeft, ChevronRight, Shield, Trophy } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { JogaButton, JogaCard, JogaEvolutionBadge, JogaHero, JogaPage } from "@/components/joga";
import { EvolutionGainsSummary } from "@/components/EvolutionGainsSummary";
import { summarizeGainsForDisplay } from "@/lib/evolutionDisplay";
import { loadEvolutionHistory, type EvolutionRecord } from "@/lib/evolutionStorage";
import { loadEvolutionFromFirestore } from "@/lib/evolutionRepository";
import { isPostMatchExpired, loadPostMatch } from "@/lib/postMatchStorage";
import { resolveMatchId } from "@/lib/matchFlowStorage";
import { loadMatchFromFirestore } from "@/lib/matchRepository";
import { loadMatchResult } from "@/lib/matchHistoryRepository";
import { matchSummaryPath, subscribeHasUserVoted } from "@/lib/voteStatusRepository";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

const VOTING_STATUSES = new Set(["aguardando_auditoria", "auditada"]);
const POST_GAME_STATUSES = new Set(["aguardando_auditoria", "auditada", "concluida"]);

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("pt-PT", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function Evolucao() {
  useDocumentTitle("Evolução");
  const { userId: authUserId } = useAuth();
  const [history, setHistory] = useState<EvolutionRecord[]>(() => loadEvolutionHistory(authUserId));
  const [pendingMatch, setPendingMatch] = useState(() => loadPostMatch());
  const pendingMatchId = resolveMatchId({ storedMatchId: pendingMatch?.matchId });
  const pendingExpired = isPostMatchExpired(pendingMatch);
  const [hasVoted, setHasVoted] = useState(false);
  const [remoteStatus, setRemoteStatus] = useState<string | null>(null);
  const [ratingsReleased, setRatingsReleased] = useState(false);

  useEffect(() => {
    if (!authUserId || !pendingMatchId) {
      setHasVoted(false);
      return;
    }
    return subscribeHasUserVoted(pendingMatchId, authUserId, setHasVoted);
  }, [authUserId, pendingMatchId]);

  useEffect(() => {
    if (!pendingMatchId) {
      setRemoteStatus(null);
      setRatingsReleased(false);
      return;
    }
    let cancelled = false;
    void loadMatchFromFirestore(pendingMatchId).then((remote) => {
      if (cancelled || !remote) return;
      setRemoteStatus(remote.status);
      setPendingMatch((current) =>
        current && current.matchId === remote.matchId
          ? { ...current, status: remote.status }
          : current,
      );
    });
    void loadMatchResult(pendingMatchId).then((result) => {
      if (!cancelled) setRatingsReleased(Boolean(result?.ratingsReleased));
    });
    return () => {
      cancelled = true;
    };
  }, [pendingMatchId]);

  const effectiveStatus = remoteStatus ?? pendingMatch?.status;
  const isVotingPhase = Boolean(effectiveStatus && VOTING_STATUSES.has(effectiveStatus));
  const showPendingVote = Boolean(
    pendingMatch &&
      pendingMatchId &&
      !pendingExpired &&
      !hasVoted &&
      !ratingsReleased &&
      isVotingPhase &&
      effectiveStatus !== "expirada" &&
      effectiveStatus !== "concluida",
  );
  const showVotedSummary = Boolean(
    pendingMatch &&
      pendingMatchId &&
      !pendingExpired &&
      (hasVoted || ratingsReleased) &&
      effectiveStatus &&
      POST_GAME_STATUSES.has(effectiveStatus),
  );

  const { profile: ownProfile } = useUserProfile();
  const pro = isProActive(ownProfile?.entitlements);
  const FREE_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;
  const visibleHistory = pro
    ? history
    : history.filter((r) => Date.now() - new Date(r.savedAt).getTime() <= FREE_WINDOW_MS);
  const hiddenCount = history.length - visibleHistory.length;

  const latest = history.find((r) => r.playerId === authUserId) ?? history[0] ?? null;

  useEffect(() => {
    const refresh = () => setPendingMatch(loadPostMatch());
    refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  useEffect(() => {
    setHistory(loadEvolutionHistory(authUserId));
    loadEvolutionFromFirestore(authUserId).then((remote) => {
      if (remote.length > 0) setHistory(remote);
    });
  }, [authUserId]);

  return (
    <JogaPage theme="dark" className="py-5 pb-28">
      <div className="flex items-center gap-3 mb-4">
        <Link href="/perfil" className="joga-tap">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center border border-white/12 bg-white/6">
            <ChevronLeft className="w-5 h-5 text-white" />
          </div>
        </Link>
        <div>
          <p className="text-white/40 text-[10px] font-bold uppercase tracking-[0.2em]">Perfil</p>
          <h1 className="font-display font-black text-white text-2xl flex items-center gap-2">
            Evolução
            <ProFeatureBadge tier="player" />
          </h1>
        </div>
      </div>

      {showPendingVote && (
        <JogaCard variant="arena" className="mb-4 border-amber-400/25 bg-amber-400/8">
          <p className="text-amber-300 text-[10px] font-bold uppercase tracking-[0.18em]">Pelada pendente</p>
          <h2 className="font-display font-black text-white text-xl mt-1">Ainda podes votar nesta pelada</h2>
          <p className="text-white/50 text-sm mt-2">
            O resumo e a votação ficam no pós-jogo. Depois de votar, os atributos ganhos aparecem aqui no histórico.
          </p>
          <Link href={matchSummaryPath(pendingMatchId)} className="block mt-3">
            <JogaButton variant="gold" size="md" className="gap-2">
              Ir para resumo / votação
              <ChevronRight className="w-4 h-4" />
            </JogaButton>
          </Link>
        </JogaCard>
      )}

      {showVotedSummary && (
        <JogaCard variant="arena" className="mb-4 border-emerald-400/20 bg-emerald-400/6">
          <p className="text-emerald-300 text-[10px] font-bold uppercase tracking-[0.18em]">
            {ratingsReleased ? "Notas publicadas" : "Voto registado"}
          </p>
          <p className="text-white/55 text-sm mt-2">
            {ratingsReleased
              ? "A tua nota já saiu — vê o resumo completo da pelada."
              : "Já deste a tua nota nesta pelada. Vê o resumo quando quiseres."}
          </p>
          <Link href={matchSummaryPath(pendingMatchId, { view: "summary" })} className="block mt-3">
            <JogaButton variant="ghost" size="md" className="gap-2">
              Ver resumo da pelada
              <ChevronRight className="w-4 h-4" />
            </JogaButton>
          </Link>
        </JogaCard>
      )}

      {latest ? (
        <section className="space-y-4">
          <JogaHero theme="arena" className="p-5 text-center">
            <JogaEvolutionBadge />
            <p className="text-emerald-300 text-[10px] font-bold uppercase tracking-[0.22em]">Última evolução</p>
            <h2 className="font-display font-black text-white text-3xl mt-2">Atributos ganhos</h2>
            <p className="text-white/50 text-sm mt-2">{formatDate(latest.savedAt)} · {latest.playerName}</p>
          </JogaHero>

          <div className="mt-4">
            <EvolutionGainsSummary items={summarizeGainsForDisplay(latest.gains)} />
          </div>

          <JogaCard variant="arena">
            <p className="text-white/35 text-[10px] font-bold uppercase tracking-[0.18em] mb-3">Resumo da pelada</p>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {[
                { label: "Golos", value: latest.stats.goals },
                { label: "Assist.", value: latest.stats.assists },
                { label: "Jogos", value: latest.stats.miniGames },
              ].map((item) => (
                <div key={item.label} className="rounded-xl py-2 text-center border border-white/8 bg-white/4">
                  <p className="font-display font-black text-white text-xl">{item.value}</p>
                  <p className="text-[10px] text-white/40 uppercase">{item.label}</p>
                </div>
              ))}
            </div>

            {latest.topScorers.length > 0 && (
              <div className="mb-3">
                <p className="text-white/35 text-[10px] font-bold uppercase mb-2 flex items-center gap-1">
                  <Trophy className="w-3.5 h-3.5 text-amber-400" />
                  {latest.topScorers.length > 1 ? "Artilheiros" : "Artilheiro"}
                </p>
                {latest.topScorers.map((scorer) => (
                  <div key={scorer.name} className="flex justify-between text-sm py-1">
                    <span className="text-white/80">{scorer.name}</span>
                    <span className="text-emerald-300 font-bold">{scorer.goals} golos</span>
                  </div>
                ))}
              </div>
            )}

            {latest.miniGames.length > 0 && (
              <div className="space-y-2">
                <p className="text-white/35 text-[10px] font-bold uppercase">Mini jogos</p>
                {latest.miniGames.map((game, index) => (
                  <div key={`${latest.id}-game-${index}`} className="rounded-xl px-3 py-2 bg-white/4 border border-white/8">
                    <p className="text-white font-semibold text-sm">{game.title}</p>
                    {game.winner && <p className="text-white/40 text-xs mt-0.5">Vencedor: {game.winner}</p>}
                  </div>
                ))}
              </div>
            )}
          </JogaCard>
        </section>
      ) : (
        <JogaCard variant="arena" padding="lg" className="text-center">
          <Shield className="w-10 h-10 text-emerald-300 mx-auto mb-3 opacity-80" />
          <h2 className="font-display font-black text-white text-2xl">Sem evoluções ainda</h2>
          <p className="text-white/45 text-sm mt-2 max-w-xs mx-auto">
            Joga uma pelada completa (Pré-Jogo → Ao Vivo → Pós-Jogo) e vota nos colegas para ver os atributos ganhos aqui.
          </p>
          <Link href="/jogos" className="block mt-4">
            <JogaButton variant="primary" size="md">
              Ver jogos disponíveis
            </JogaButton>
          </Link>
        </JogaCard>
      )}

      {visibleHistory.length > 1 && (
        <section className="mt-6">
          <h3 className="font-display font-black text-white text-lg mb-3">Histórico</h3>
          <div className="space-y-2">
            {visibleHistory.slice(1).map((record) => (
              <JogaCard key={record.id} variant="arena">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-white font-semibold">{formatDate(record.savedAt)}</p>
                    <p className="text-white/40 text-xs mt-0.5">
                      {record.stats.goals} golos · {record.stats.assists} assist. · {record.stats.miniGames} jogos
                    </p>
                  </div>
                  <p className="text-emerald-300 font-display font-black text-lg">
                    +{record.gains.filter((g) => g.type === "up").length}
                  </p>
                </div>
              </JogaCard>
            ))}
          </div>
        </section>
      )}

      {!pro && (
        <WLink href="/premium" className="block mt-6">
          <div
            className="rounded-2xl px-4 py-3 text-center"
            style={{ background: "rgba(230,182,76,0.08)", border: "1px dashed rgba(230,182,76,0.35)" }}
          >
            {hiddenCount > 0 && (
              <p className="text-amber-300 font-black text-sm">
                +{hiddenCount} {hiddenCount === 1 ? "pelada antiga" : "peladas antigas"} no histórico completo
              </p>
            )}
            <p className={`text-amber-300 font-black text-sm${hiddenCount > 0 ? " mt-1" : ""}`}>
              Plano gratuito: últimos 90 dias de evolução
            </p>
            <p className="text-white/40 text-xs mt-0.5">
              Desbloqueia o histórico completo com o PRO →
            </p>
          </div>
        </WLink>
      )}
    </JogaPage>
  );
}
