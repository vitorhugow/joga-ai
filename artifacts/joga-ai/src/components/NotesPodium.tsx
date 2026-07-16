import { Trophy } from "lucide-react";

export type PodiumPlayer = {
  id: string;
  name: string;
  rating: number;
};

type NotesPodiumProps = {
  players: PodiumPlayer[];
};

const PODIUM_HEIGHTS = ["h-24", "h-32", "h-16"] as const; // [2º, 1º, 3º] — ordem visual do pódio
const PODIUM_COLORS = [
  { bg: "rgba(255,255,255,0.08)", border: "rgba(255,255,255,0.15)", text: "rgba(255,255,255,0.7)" },
  { bg: "rgba(251,191,36,0.15)", border: "rgba(251,191,36,0.4)", text: "#fbbf24" },
  { bg: "rgba(180,83,9,0.12)", border: "rgba(180,83,9,0.35)", text: "#b45309" },
];

export function NotesPodium({ players }: NotesPodiumProps) {
  const ranked = [...players]
    .filter((p) => p.rating > 0)
    .sort((a, b) => b.rating - a.rating);

  if (ranked.length === 0) {
    return (
      <p className="text-white/40 text-sm text-center py-6">Ainda sem notas para mostrar.</p>
    );
  }

  const top3 = ranked.slice(0, 3);
  const rest = ranked.slice(3);
  // Ordem visual: 2º, 1º, 3º
  const podiumOrder = [top3[1], top3[0], top3[2]];

  return (
    <div data-testid="notes-podium">
      <div className="flex items-end justify-center gap-2 px-2">
        {podiumOrder.map((player, slot) => {
          if (!player) return <div key={`empty-${slot}`} className="flex-1" />;
          const place = slot === 1 ? 1 : slot === 0 ? 2 : 3;
          const colors = PODIUM_COLORS[place - 1];
          return (
            <div key={player.id} className="flex-1 flex flex-col items-center gap-1.5">
              {place === 1 && <Trophy className="w-5 h-5 text-amber-400 mb-0.5" />}
              <p className="font-display font-black text-white text-sm text-center truncate max-w-full px-1">
                {player.name}
              </p>
              <p className="font-display font-black text-lg leading-none" style={{ color: colors.text }}>
                {player.rating.toFixed(1)}
              </p>
              <div
                className={`w-full rounded-t-xl flex items-start justify-center pt-2 ${PODIUM_HEIGHTS[slot]}`}
                style={{ background: colors.bg, border: `1px solid ${colors.border}`, borderBottom: "none" }}
              >
                <span className="font-display font-black text-2xl" style={{ color: colors.text }}>
                  {place}º
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {rest.length > 0 && (
        <div className="mt-4 space-y-1.5">
          {rest.map((player, index) => (
            <div
              key={player.id}
              className="flex items-center justify-between px-3 py-2 rounded-xl"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
            >
              <span className="text-white/50 text-xs font-bold w-6">{index + 4}º</span>
              <span className="text-white text-sm flex-1 truncate">{player.name}</span>
              <span className="font-display font-black text-white text-sm">{player.rating.toFixed(1)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
