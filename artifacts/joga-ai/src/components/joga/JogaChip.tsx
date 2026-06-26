import { cn } from "@/lib/utils";

interface JogaChipProps {
  label: string;
  active?: boolean;
  onClick?: () => void;
  className?: string;
  color?: string;
  glow?: string;
  testId?: string;
}

export function JogaChip({
  label,
  active = false,
  onClick,
  className,
  color = "#4ade80",
  glow = "rgba(74,222,128,0.3)",
  testId,
}: JogaChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={cn(
        "joga-chip shrink-0 px-4 py-2 rounded-full text-sm font-semibold",
        className
      )}
      style={
        active
          ? {
              background: `${color}22`,
              border: `1.5px solid ${color}55`,
              color,
              boxShadow: `0 0 12px ${glow}`,
            }
          : {
              background: "rgba(255,255,255,0.06)",
              border: "1.5px solid rgba(255,255,255,0.08)",
              color: "rgba(255,255,255,0.42)",
            }
      }
    >
      {label}
    </button>
  );
}

interface JogaChipLightProps {
  label: string;
  active?: boolean;
  onClick?: () => void;
  className?: string;
  testId?: string;
}

export function JogaChipLight({ label, active, onClick, className, testId }: JogaChipLightProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={cn(
        "joga-chip-light px-3 py-1.5 rounded-full text-xs font-semibold",
        active ? "bg-primary text-white shadow-sm" : "bg-white/10 text-white/55 border border-white/10",
        className
      )}
      data-active={active ? "true" : "false"}
    >
      {label}
    </button>
  );
}
