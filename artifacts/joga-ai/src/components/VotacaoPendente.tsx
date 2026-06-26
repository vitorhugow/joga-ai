import { useState, useRef } from "react";
import { Clock, Trophy } from "lucide-react";
import { PlayerBadge } from "./PlayerBadge";

const matchPlayers = [
  { id: "2", name: "João Silva",      position: "DEF", overall: 65 },
  { id: "3", name: "Pedro Santos",    position: "MEI", overall: 70 },
  { id: "4", name: "Miguel Costa",    position: "GR",  overall: 68 },
  { id: "5", name: "Bruno Fernandes", position: "MEI", overall: 74 },
  { id: "6", name: "Rui Patrício",    position: "AVA", overall: 62 },
];

interface VotacaoPendenteProps {
  onComplete: () => void;
}

/* ── Half-star component ─────────────────────────────────── */
function HalfStarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hovered, setHovered] = useState<number>(0);
  const display = hovered || value;

  function handleClick(e: React.MouseEvent<HTMLButtonElement>, star: number) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const isHalf = x < rect.width / 2;
    onChange(isHalf ? star - 0.5 : star);
  }

  function handleMove(e: React.MouseEvent<HTMLButtonElement>, star: number) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const isHalf = x < rect.width / 2;
    setHovered(isHalf ? star - 0.5 : star);
  }

  return (
    <div className="flex items-center gap-1" onMouseLeave={() => setHovered(0)}>
      {[1, 2, 3, 4, 5].map((star) => {
        const full = display >= star;
        const half = !full && display >= star - 0.5;
        return (
          <button
            key={star}
            className="p-0.5 transition-transform active:scale-110 relative"
            onClick={(e) => handleClick(e, star)}
            onMouseMove={(e) => handleMove(e, star)}
            data-testid={`half-star-${star}`}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" className="drop-shadow-sm">
              {/* Background empty star */}
              <path
                d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
                fill="#e5e7eb"
                stroke="#e5e7eb"
                strokeWidth="0"
              />
              {/* Filled portion */}
              {(full || half) && (
                <clipPath id={`clip-${star}`}>
                  <rect x="0" y="0" width={half ? "12" : "24"} height="24" />
                </clipPath>
              )}
              {(full || half) && (
                <path
                  d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
                  fill="#fbbf24"
                  stroke="#fbbf24"
                  strokeWidth="0"
                  clipPath={`url(#clip-${star})`}
                />
              )}
            </svg>
          </button>
        );
      })}
    </div>
  );
}

export function VotacaoPendente({ onComplete }: VotacaoPendenteProps) {
  const [votes, setVotes] = useState<Record<string, number>>({});
  const [step, setStep] = useState<"intro" | "voting" | "done">("intro");
  const [currentIdx, setCurrentIdx] = useState(0);
  const currentPlayer = matchPlayers[currentIdx];
  const allVoted = votes[currentPlayer?.id] !== undefined;

  function handleVote(v: number) {
    setVotes((prev) => ({ ...prev, [currentPlayer.id]: v }));
  }

  function handleNext() {
    if (currentIdx < matchPlayers.length - 1) {
      setCurrentIdx((i) => i + 1);
    } else {
      setStep("done");
    }
  }

  if (step === "done") {
    return (
      <div className="fixed inset-0 z-9999 bg-linear-to-br from-slate-900 to-slate-950 flex flex-col items-center justify-center px-8 text-center">
        <div className="w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center mb-6">
          <Trophy className="w-10 h-10 text-emerald-400" />
        </div>
        <h2 className="font-display font-black text-white text-3xl mb-2">Votação Concluída!</h2>
        <p className="text-white/60 text-sm leading-relaxed mb-2">Os resultados foram registados.</p>
        <p className="text-emerald-400 font-semibold text-sm mb-8">+1 Físico ganho por votar</p>
        <button
          onClick={onComplete}
          className="w-full max-w-xs py-4 rounded-2xl bg-linear-to-r from-primary to-emerald-600 text-white font-display font-bold text-lg shadow-lg shadow-primary/30 active:scale-[0.98] transition-all"
          data-testid="button-voting-complete"
        >
          Ver o Pós-Jogo
        </button>
      </div>
    );
  }

  if (step === "intro") {
    return (
      <div className="fixed inset-0 z-9999 bg-linear-to-br from-slate-900 to-slate-950 flex flex-col" data-testid="votacao-pendente-screen">
        <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
          <div className="w-20 h-20 rounded-full bg-amber-500/20 border border-amber-400/30 flex items-center justify-center mb-6">
            <span className="text-5xl">⭐</span>
          </div>
          <h2 className="font-display font-black text-white text-2xl mb-3 uppercase tracking-tight">Votação Pendente</h2>
          <p className="text-white/60 text-sm leading-relaxed mb-4">
            A partida <span className="text-white font-semibold">Os Leões vs FC Baixa</span> terminou. Avalia os teus colegas.
          </p>
          <div className="bg-amber-500/10 border border-amber-400/20 rounded-2xl px-5 py-4 mb-8 w-full max-w-xs">
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-amber-400 shrink-0" />
              <div className="text-left">
                <p className="text-amber-300 font-bold text-sm">Prazo de 24 horas</p>
                <p className="text-white/50 text-xs">Tens até amanhã para votar.</p>
              </div>
            </div>
          </div>
          <button
            onClick={() => setStep("voting")}
            className="w-full max-w-xs py-4 rounded-2xl bg-linear-to-r from-amber-400 to-yellow-500 text-amber-900 font-display font-bold text-lg shadow-lg shadow-amber-500/30 active:scale-[0.98] transition-all"
            data-testid="button-start-voting"
          >
            Avaliar Agora ({matchPlayers.length} jogadores)
          </button>
        </div>
        <div className="px-8 pb-8 text-center">
          <p className="text-white/20 text-xs">Não podes fechar este ecrã sem votar</p>
        </div>
      </div>
    );
  }

  const progress = (currentIdx / matchPlayers.length) * 100;

  return (
    <div className="fixed inset-0 z-9999 bg-[#0f1923] flex flex-col" data-testid="votacao-voting-screen">
      {/* Progress bar */}
      <div className="h-1 bg-white/10">
        <div className="h-full bg-linear-to-r from-amber-400 to-yellow-500 transition-all duration-500" style={{ width: `${progress}%` }} />
      </div>

      <div className="flex-1 flex flex-col px-6 pt-6 pb-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest">Votação</p>
            <p className="text-white font-display font-bold text-lg">{currentIdx + 1} de {matchPlayers.length}</p>
          </div>
          <div className="flex gap-1.5">
            {matchPlayers.map((_, i) => (
              <div key={i} className={`w-2 h-2 rounded-full transition-all ${i < currentIdx ? "bg-emerald-400" : i === currentIdx ? "bg-amber-400 scale-125" : "bg-white/20"}`} />
            ))}
          </div>
        </div>

        {/* Player card */}
        <div className="flex-1 flex flex-col items-center justify-center">
          <div className="bg-white/5 border border-white/10 rounded-3xl p-8 w-full max-w-xs text-center mb-8">
            <div className="flex justify-center mb-4">
              <PlayerBadge overall={currentPlayer.overall} position={currentPlayer.position} size="lg" />
            </div>
            <h3 className="font-display font-black text-white text-2xl mb-1">{currentPlayer.name}</h3>
            <p className="text-white/40 text-sm mb-6">{currentPlayer.position} · Os Leões</p>

            <p className="text-white/60 text-sm mb-4">Como avaliarias a prestação?</p>
            <div className="flex justify-center mb-3">
              <HalfStarRating value={votes[currentPlayer.id] || 0} onChange={handleVote} />
            </div>
            {votes[currentPlayer.id] > 0 && (
              <p className="text-amber-400 font-display font-bold text-2xl">
                {(votes[currentPlayer.id] * 2).toFixed(1)} / 10
              </p>
            )}
          </div>

          <button
            onClick={handleNext}
            disabled={!allVoted}
            className="w-full max-w-xs py-4 rounded-2xl font-display font-bold text-lg transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed bg-linear-to-r from-amber-400 to-yellow-500 text-amber-900 shadow-lg shadow-amber-500/20"
            data-testid="button-next-vote"
          >
            {currentIdx < matchPlayers.length - 1 ? "Próximo →" : "Concluir Votação"}
          </button>
        </div>
      </div>
    </div>
  );
}
