interface StatBadgeProps {
  label: string;
  value: string | number;
  color?: "green" | "gold" | "blue" | "purple" | "red" | "gray";
  size?: "sm" | "md";
}

const colorMap = {
  green: "bg-emerald-100 text-emerald-800 border-emerald-200",
  gold: "bg-amber-100 text-amber-800 border-amber-200",
  blue: "bg-blue-100 text-blue-800 border-blue-200",
  purple: "bg-purple-100 text-purple-800 border-purple-200",
  red: "bg-red-100 text-red-800 border-red-200",
  gray: "bg-gray-100 text-gray-700 border-gray-200",
};

export function StatBadge({ label, value, color = "gray", size = "md" }: StatBadgeProps) {
  const sizeClasses = size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm";
  return (
    <div className={`inline-flex items-center gap-1.5 rounded-full border font-medium ${colorMap[color]} ${sizeClasses}`} data-testid={`stat-badge-${label.toLowerCase()}`}>
      <span className="font-bold">{value}</span>
      <span className="opacity-70">{label}</span>
    </div>
  );
}
