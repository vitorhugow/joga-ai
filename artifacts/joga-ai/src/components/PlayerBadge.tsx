interface PlayerBadgeProps {
  overall: number;
  position: string;
  size?: "sm" | "md" | "lg";
}

const positionColors: Record<string, string> = {
  AVA: "from-emerald-500 to-green-700",
  DEF: "from-blue-500 to-indigo-700",
  MEI: "from-purple-500 to-fuchsia-700",
  GR: "from-amber-500 to-orange-700",
};

export function PlayerBadge({ overall, position, size = "md" }: PlayerBadgeProps) {
  const gradient = positionColors[position] || "from-slate-500 to-slate-700";
  const sizeClasses = {
    sm: "w-9 h-10 rounded",
    md: "w-12 h-14 rounded-lg",
    lg: "w-16 h-18 rounded-xl",
  };
  const textSizes = {
    sm: "text-base",
    md: "text-xl",
    lg: "text-2xl",
  };
  return (
    <div
      className={`bg-linear-to-br ${gradient} flex flex-col items-center justify-center shadow-md ${sizeClasses[size]}`}
      data-testid="player-badge"
    >
      <span className={`font-display font-bold text-white leading-none ${textSizes[size]}`}>{overall}</span>
      <span className="font-display text-[8px] font-semibold text-white/80 tracking-wider">{position}</span>
    </div>
  );
}
