import { useState } from "react";
import { Star } from "lucide-react";
import { PlayerMiniCard } from "./PlayerMiniCard";

interface VotingPlayer {
  id: string;
  name: string;
  position: string;
  overall: number;
}

interface PostMatchVotingProps {
  players: VotingPlayer[];
  onVoteSubmit?: (votes: Record<string, number>) => void;
}

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const stars = [1, 2, 3, 4, 5];
  const display = hovered !== null ? hovered : value;

  return (
    <div className="flex items-center gap-0.5" data-testid="star-rating">
      {stars.map((star) => {
        const filled = star <= Math.floor(display);
        const halfFilled = display > star - 1 && display < star;
        return (
          <button
            key={star}
            className="p-0.5 transition-transform active:scale-110"
            onClick={() => onChange(star)}
            onMouseEnter={() => setHovered(star)}
            onMouseLeave={() => setHovered(null)}
            data-testid={`star-${star}`}
          >
            <Star
              className={`w-6 h-6 transition-colors ${filled ? "fill-amber-400 text-amber-400" : "fill-gray-100 text-gray-200"}`}
              strokeWidth={1.5}
            />
          </button>
        );
      })}
      <span className="ml-2 text-sm font-bold text-gray-700 w-6">
        {value > 0 ? (value * 2) : "—"}
      </span>
    </div>
  );
}

export function PostMatchVoting({ players, onVoteSubmit }: PostMatchVotingProps) {
  const [votes, setVotes] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState(false);

  const allVoted = players.every((p) => votes[p.id] !== undefined);

  function handleSubmit() {
    if (allVoted) {
      onVoteSubmit?.(votes);
      setSubmitted(true);
    }
  }

  if (submitted) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-center" data-testid="voting-submitted">
        <div className="text-4xl mb-2">
          <Star className="w-10 h-10 text-amber-400 fill-amber-400 mx-auto" />
        </div>
        <p className="font-display font-bold text-emerald-800 text-lg">Votos submetidos!</p>
        <p className="text-emerald-600 text-sm mt-1">Ganhaste +1 Físico por votar.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="post-match-voting">
      {players.map((player) => (
        <div key={player.id} className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
          <PlayerMiniCard name={player.name} position={player.position} overall={player.overall} />
          <StarRating
            value={votes[player.id] || 0}
            onChange={(v) => setVotes((prev) => ({ ...prev, [player.id]: v }))}
          />
        </div>
      ))}
      <button
        onClick={handleSubmit}
        disabled={!allVoted}
        className="w-full py-3 rounded-xl bg-linear-to-r from-primary to-emerald-600 text-white font-display font-semibold text-base disabled:opacity-50 shadow-md active:scale-[0.98] transition-all"
        data-testid="button-submit-votes"
      >
        Submeter votos
      </button>
    </div>
  );
}
