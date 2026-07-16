import { Trophy } from "lucide-react";
import { PlayerBadge } from "./PlayerBadge";

interface RankingEntry {
  rank: number;
  name: string;
  position: string;
  overall: number;
  value: string | number;
  valueLabel: string;
}

interface RankingListProps {
  entries: RankingEntry[];
  title: string;
}

const rankColors = ["#fbbf24", "rgba(255,255,255,0.4)", "#b45309"];
const rankBg = [
  { background: "rgba(251,191,36,0.08)", borderColor: "rgba(251,191,36,0.2)" },
  { background: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.08)" },
  { background: "rgba(251,191,36,0.04)", borderColor: "rgba(251,191,36,0.1)" },
];

export function RankingList({ entries, title }: RankingListProps) {
  return (
    <div
      className="rounded-2xl border overflow-hidden"
      style={{ background: "rgba(255,255,255,0.045)", borderColor: "rgba(255,255,255,0.08)" }}
      data-testid="ranking-list"
    >
      <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <Trophy className="w-4 h-4 text-amber-400" />
        <h3 className="font-display font-semibold text-white text-sm uppercase tracking-wide">{title}</h3>
      </div>
      <div>
        {entries.map((entry, idx) => (
          <div
            key={entry.rank}
            className="flex items-center gap-3 px-4 py-3"
            style={{
              ...(idx < 3 ? rankBg[idx] : {}),
              borderTop: idx > 0 ? "1px solid rgba(255,255,255,0.05)" : undefined,
            }}
            data-testid={`ranking-entry-${entry.rank}`}
          >
            <span
              className="font-display font-bold text-lg w-6 text-center"
              style={{ color: idx < 3 ? rankColors[idx] : "rgba(255,255,255,0.4)" }}
            >
              {entry.rank}
            </span>
            <PlayerBadge overall={entry.overall} position={entry.position} size="sm" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-white text-sm truncate">{entry.name}</p>
              <p className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>{entry.position}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="font-display font-bold text-white text-lg leading-none">{entry.value}</p>
              <p className="text-[10px] uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.35)" }}>{entry.valueLabel}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
