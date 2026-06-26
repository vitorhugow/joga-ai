interface PlayerMiniCardProps {
  name: string;
  position: string;
  overall: number;
  shirtNumber?: number;
  subtitle?: string;
  className?: string;
}

const positionColors: Record<string, string> = {
  AVA: "from-emerald-500 to-green-700",
  DEF: "from-blue-500 to-indigo-700",
  MEI: "from-purple-500 to-fuchsia-700",
  GR: "from-amber-500 to-orange-700",
};

export function PlayerMiniCard({ name, position, overall, shirtNumber, subtitle, className = "" }: PlayerMiniCardProps) {
  const gradient = positionColors[position] || "from-slate-500 to-slate-700";

  return (
    <div className={`flex items-center gap-3 ${className}`} data-testid="player-mini-card">
      <div className={`relative w-12 h-14 rounded-lg bg-linear-to-br ${gradient} flex flex-col items-center justify-center shadow-md shrink-0`}>
        <span className="font-display text-xl font-bold text-white leading-none">{overall}</span>
        <span className="font-display text-[9px] font-semibold text-white/80 tracking-wider">{position}</span>
        {shirtNumber !== undefined && (
          <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-white border border-gray-200 flex items-center justify-center">
            <span className="text-[8px] font-bold text-gray-700">{shirtNumber}</span>
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-900 text-sm leading-tight truncate" data-testid="player-mini-name">{name}</p>
        {subtitle && (
          <p className="text-xs text-gray-500 truncate mt-0.5">{subtitle}</p>
        )}
      </div>
    </div>
  );
}
