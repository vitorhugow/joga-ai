/** Badge compacto para marcar recursos PRO / Clube PRO (estilo CapCut). */

type ProFeatureBadgeProps = {
  tier?: "player" | "organizer";
  className?: string;
};

export function ProFeatureBadge({ tier = "player", className = "" }: ProFeatureBadgeProps) {
  const isOrg = tier === "organizer";
  return (
    <span
      className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wide shrink-0 ${className}`}
      style={
        isOrg
          ? { background: "rgba(250,204,21,0.18)", color: "#fde047", border: "1px solid rgba(250,204,21,0.45)" }
          : { background: "rgba(251,191,36,0.15)", color: "#fcd34d", border: "1px solid rgba(251,191,36,0.35)" }
      }
    >
      ✦ {isOrg ? "Clube PRO" : "PRO"}
    </span>
  );
}
