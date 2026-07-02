import { JogaCard } from "@/components/joga";
import type { EvolutionDisplayItem } from "@/lib/evolutionDisplay";

type EvolutionGainsSummaryProps = {
  items: EvolutionDisplayItem[];
};

export function EvolutionGainsSummary({ items }: EvolutionGainsSummaryProps) {
  if (items.length === 0) return null;

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <JogaCard key={item.label} variant="arena">
          <div className="flex items-center justify-between gap-3">
            <p className="font-display font-black text-white text-xl">{item.label}</p>
            <div className="text-right">
              <p
                className="font-display font-black text-2xl"
                style={{ color: item.variant === "down" ? "#f87171" : "#4ade80" }}
              >
                {item.value}
              </p>
              {item.variant === "up" && (
                <p className="text-emerald-300 text-xs font-black">↗ UP</p>
              )}
            </div>
          </div>
        </JogaCard>
      ))}
    </div>
  );
}
