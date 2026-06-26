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

const rankColors = ["text-amber-500", "text-gray-400", "text-amber-700"];
const rankBg = ["bg-amber-50 border-amber-100", "bg-gray-50 border-gray-100", "bg-amber-50/50 border-amber-50"];

export function RankingList({ entries, title }: RankingListProps) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden" data-testid="ranking-list">
      <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-2">
        <Trophy className="w-4 h-4 text-amber-500" />
        <h3 className="font-display font-semibold text-gray-900 text-sm uppercase tracking-wide">{title}</h3>
      </div>
      <div className="divide-y divide-gray-50">
        {entries.map((entry, idx) => (
          <div
            key={entry.rank}
            className={`flex items-center gap-3 px-4 py-3 ${idx < 3 ? rankBg[idx] : ""}`}
            data-testid={`ranking-entry-${entry.rank}`}
          >
            <span className={`font-display font-bold text-lg w-6 text-center ${idx < 3 ? rankColors[idx] : "text-gray-400"}`}>
              {entry.rank}
            </span>
            <PlayerBadge overall={entry.overall} position={entry.position} size="sm" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 text-sm truncate">{entry.name}</p>
              <p className="text-xs text-gray-500">{entry.position}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="font-display font-bold text-gray-900 text-lg leading-none">{entry.value}</p>
              <p className="text-[10px] text-gray-400 uppercase tracking-wide">{entry.valueLabel}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
