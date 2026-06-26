import { LucideIcon } from "lucide-react";

interface MatchEventButtonProps {
  label: string;
  icon: LucideIcon;
  color?: "green" | "blue" | "amber" | "red" | "purple";
  onClick?: () => void;
  disabled?: boolean;
  count?: number;
}

const colorMap = {
  green: {
    bg: "from-emerald-500 to-green-600",
    shadow: "shadow-emerald-200",
    text: "text-white",
    badge: "bg-emerald-700",
  },
  blue: {
    bg: "from-blue-500 to-blue-600",
    shadow: "shadow-blue-200",
    text: "text-white",
    badge: "bg-blue-700",
  },
  amber: {
    bg: "from-amber-400 to-amber-500",
    shadow: "shadow-amber-200",
    text: "text-white",
    badge: "bg-amber-600",
  },
  red: {
    bg: "from-red-500 to-red-600",
    shadow: "shadow-red-200",
    text: "text-white",
    badge: "bg-red-700",
  },
  purple: {
    bg: "from-purple-500 to-purple-600",
    shadow: "shadow-purple-200",
    text: "text-white",
    badge: "bg-purple-700",
  },
};

export function MatchEventButton({ label, icon: Icon, color = "green", onClick, disabled, count }: MatchEventButtonProps) {
  const c = colorMap[color];
  return (
    <button
      className={`relative flex flex-col items-center justify-center gap-1.5 rounded-xl p-3 bg-linear-to-br ${c.bg} shadow-md ${c.shadow} active:scale-95 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed min-h-[72px]`}
      onClick={onClick}
      disabled={disabled}
      data-testid={`event-button-${label.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <Icon className="w-6 h-6 text-white" strokeWidth={2.5} />
      <span className="text-white font-semibold text-xs leading-tight text-center">{label}</span>
      {count !== undefined && count > 0 && (
        <div className={`absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full ${c.badge} flex items-center justify-center`}>
          <span className="text-white text-[10px] font-bold">{count}</span>
        </div>
      )}
    </button>
  );
}
