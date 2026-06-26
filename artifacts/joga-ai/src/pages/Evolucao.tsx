import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ChevronLeft, ChevronRight, Shield, Trophy } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { JogaButton, JogaCard, JogaEvolutionBadge, JogaHero, JogaPage } from "@/components/joga";
import { loadEvolutionHistory, type EvolutionRecord } from "@/lib/evolutionStorage";
import { loadEvolutionFromFirestore } from "@/lib/evolutionRepository";
import { isPostMatchExpired, loadPostMatch } from "@/lib/postMatchStorage";
import { hasUserVotedInSession, currentMatchUserId, resolveMatchId } from "@/lib/matchFlowStorage";

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
  const { userId: authUserId } = useAuth();
  const [history, setHistory] = useState<EvolutionRecord[]>(() => loadEvolutionHistory());
  const [pendingMatch, setPendingMatch] = useState(() => loadPostMatch());
  const matchUserId = currentMatchUserId();
  const pendingMatchId = resolveMatchId({ storedMatchId: pendingMatch?.matchId });
  const pendingExpired = isPostMatchExpired(pendingMatch);
  const hasVoted = hasUserVotedInSession(matchUserId, pendingMatchId);
  const showPendingVote = Boolean(
    pendingMatch &&
      !pendingExpired &&
      !hasVoted &&
      pendingMatch.status !== "expirada" &&
      pendingMatch.status !== "concluida",
  );

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
    loadEvolutionFromFirestore(authUserId).then((remote) => {
      if (remote.length > 0) setHistory(remote);
    });
  }, [authUserId]);

  return (
    <JogaPage theme="dark" className="py-5">
      <div className="flex items-center gap-3 mb-4">
        <Link href="/perfil" className="joga-tap">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center border border-white/12 bg-white/6">
            <ChevronLeft className="w-5 h-5 text-white" />
          </div>
        </Link>
        <div>
          <p className="text-white/40 text-[10px] font-bold uppercase tracking-[0.2em]">Perfil</p>
          <h1 className="font-display font-black text-white text-2xl">Evolução</h1>
        </div>
      </div>

      {showPendingVote && (
        <JogaCard variant="arena" className="mb-4 border-amber-400/25 bg-amber-400/8">
          <p className="text-amber-300 text-[10px] font-bold uppercase tracking-[0.18em]">Pelada pendente</p>
          <h2 className="font-display font-black text-white text-xl mt-1">Ainda podes votar nesta pelada</h2>
          <p className="text-white/50 text-sm mt-2">
            O resumo e a votação ficam no pós-jogo. Depois de votar, os atributos ganhos aparecem aqui no histórico.
          </p>
          <Link href={`/partida/${pendingMatchId}/pos-jogo`} className="block mt-3">
            <JogaButton variant="gold" size="md" className="gap-2">
              Ir para resumo / votação
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

          <div className="space-y-3">
            {latest.gains.map((gain) => (
              <JogaCard
                key={`${latest.id}-${gain.title}`}
                variant="arena"
                className={gain.type === "pending" ? "border-amber-400/20 bg-amber-400/8" : ""}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-display font-black text-white text-xl">{gain.title}</p>
                    <p className="text-white/40 text-xs mt-1">{gain.reason}</p>
                  </div>
                  <p
                    className="font-display font-black text-2xl"
                    style={{ color: gain.type === "pending" ? "#fbbf24" : "#4ade80" }}
                  >
                    {gain.value}
                  </p>
                </div>
              </JogaCard>
            ))}
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

      {history.length > 1 && (
        <section className="mt-6">
          <h3 className="font-display font-black text-white text-lg mb-3">Histórico</h3>
          <div className="space-y-2">
            {history.slice(1).map((record) => (
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
    </JogaPage>
  );
}
