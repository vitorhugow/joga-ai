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
      className="flex items-center gap-3 px-4 py-3 rounded-xl border"
      style={
        isCurrentPlayer
          ? { background: "rgba(74,222,128,0.1)", borderColor: "rgba(74,222,128,0.25)" }
          : { background: "rgba(255,255,255,0.045)", borderColor: "rgba(255,255,255,0.08)" }
      }
      data-testid={`leaderboard-card-${rank}`}
    >
      <span
        className="font-display font-bold text-xl w-7 text-center"
        style={{
          color: rank === 1 ? "#fbbf24" : rank === 2 ? "rgba(255,255,255,0.4)" : rank === 3 ? "#b45309" : "rgba(255,255,255,0.4)",
        }}
      >
        {rank}
      </span>
      <PlayerBadge overall={overall} position={position} size="sm" />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm truncate" style={{ color: isCurrentPlayer ? "#6ee7b7" : "white" }}>{name}</p>
        <p className="text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>{position}</p>
      </div>
      <div className="text-right">
        <p className="font-display font-bold text-white text-lg leading-none">{statValue}</p>
        <p className="text-[10px] uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.35)" }}>{statLabel}</p>
      </div>
    </div>
  );
}
