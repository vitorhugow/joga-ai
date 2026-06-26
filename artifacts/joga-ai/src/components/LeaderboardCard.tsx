import { PlayerBadge } from "./PlayerBadge";

interface LeaderboardCardProps {
  rank: number;
  name: string;
  position: string;
  overall: number;
  statValue: string | number;
  statLabel: string;
  isCurrentPlayer?: boolean;
}

export function LeaderboardCard({ rank, name, position, overall, statValue, statLabel, isCurrentPlayer }: LeaderboardCardProps) {
  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${isCurrentPlayer ? "bg-emerald-50 border-emerald-200" : "bg-white border-gray-100"}`}
      data-testid={`leaderboard-card-${rank}`}
    >
      <span className={`font-display font-bold text-xl w-7 text-center ${rank === 1 ? "text-amber-500" : rank === 2 ? "text-gray-400" : rank === 3 ? "text-amber-700" : "text-gray-400"}`}>
        {rank}
      </span>
      <PlayerBadge overall={overall} position={position} size="sm" />
      <div className="flex-1 min-w-0">
        <p className={`font-semibold text-sm truncate ${isCurrentPlayer ? "text-emerald-800" : "text-gray-900"}`}>{name}</p>
        <p className="text-xs text-gray-400">{position}</p>
      </div>
      <div className="text-right">
        <p className="font-display font-bold text-gray-900 text-lg leading-none">{statValue}</p>
        <p className="text-[10px] text-gray-400 uppercase tracking-wider">{statLabel}</p>
      </div>
    </div>
  );
}
