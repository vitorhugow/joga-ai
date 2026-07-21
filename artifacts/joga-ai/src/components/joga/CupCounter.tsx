import { JogaCard } from "./JogaCard";
import { Progress } from "@/components/ui/progress";

interface CupCounterProps {
  current: number;
  max: number;
}

export function CupCounter({ current, max }: CupCounterProps) {
  const pct = max > 0 ? Math.min(100, (current / max) * 100) : 0;
  const slots = Array.from({ length: max }, (_, i) => i < current);

  return (
    <JogaCard
      variant="arena"
      padding="lg"
      style={{ borderColor: "rgba(24,184,94,0.28)" }}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-white/40 text-[10px] font-black uppercase tracking-[0.12em]">Clubes inscritos</span>
        <span className="flex items-center gap-1.5 text-[10px] font-black tracking-[0.05em]" style={{ color: "#84f0b8" }}>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          EM DIRETO
        </span>
      </div>

      <div className="flex items-baseline gap-1">
        <span
          className="font-black text-4xl leading-none"
          style={{
            background: "linear-gradient(180deg,#fff,#8ff0bd)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          {current}
        </span>
        <span className="text-white/40 text-2xl font-bold">/ {max}</span>
      </div>

      <Progress
        value={pct}
        className="mt-3.5 h-2.5 rounded-full"
        style={{ background: "#0a130f", border: "1px solid rgba(255,255,255,0.08)" }}
      />

      <div className="flex gap-1.5 mt-3">
        {slots.map((on, i) => (
          <div
            key={i}
            className="flex-1 h-[5px] rounded-full transition-colors"
            style={{ background: on ? "linear-gradient(90deg,#18b85e,#12d16a)" : "#152019" }}
          />
        ))}
      </div>

      <p className="text-white/45 text-xs text-center mt-3">Atualiza em tempo real a cada nova inscrição.</p>
    </JogaCard>
  );
}
