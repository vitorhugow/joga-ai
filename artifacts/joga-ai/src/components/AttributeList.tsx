import { PlayerAttributes } from "@/lib/cardUtils";

interface AttributeListProps {
  attributes: PlayerAttributes;
  showBars?: boolean;
  compact?: boolean;
  isGoalkeeper?: boolean;
}

const lineAttrLabels: Record<keyof PlayerAttributes, string> = {
  ritmo: "Ritmo",
  finalizacao: "Finalização",
  passe: "Passe",
  defesa: "Defesa",
  drible: "Drible",
  fisico: "Físico",
};

export function AttributeList({ attributes, showBars = true, compact = false, isGoalkeeper = false }: AttributeListProps) {
  const entries = Object.entries(attributes) as [keyof PlayerAttributes, number][];

  return (
    <div className={`space-y-${compact ? "1" : "2"} w-full`} data-testid="attribute-list">
      {entries.map(([key, value]) => {
        const label = lineAttrLabels[key];
        const pct = Math.min(100, Math.max(0, value));
        const barColor =
          value >= 80 ? "bg-emerald-500" :
          value >= 70 ? "bg-blue-500" :
          value >= 60 ? "bg-amber-500" :
          value >= 50 ? "bg-orange-400" : "bg-red-400";

        return (
          <div key={key} className="flex items-center gap-3" data-testid={`attr-${key}`}>
            <span className={`font-display font-bold text-gray-900 ${compact ? "text-base w-8" : "text-lg w-9"}`}>
              {value}
            </span>
            <span className={`text-gray-500 font-medium uppercase tracking-wide shrink-0 ${compact ? "text-[10px] w-16" : "text-xs w-20"}`}>
              {label}
            </span>
            {showBars && (
              <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${barColor} transition-all duration-700`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
