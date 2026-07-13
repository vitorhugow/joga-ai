export type FieldType = "futsal" | "fut5" | "fut7" | "futebol11" | string;

type FieldTypeIllustrationProps = {
  fieldType?: FieldType;
  className?: string;
  compact?: boolean;
};

function normalizeFieldType(fieldType?: string): FieldType {
  if (!fieldType) return "fut5";
  const v = fieldType.toLowerCase();
  if (v === "futsal" || v === "fut5" || v === "fut7" || v === "futebol11") return v;
  if (v === "f11") return "futebol11";
  return "fut5";
}

/** Ilustração estilizada do campo — sem fotos reais */
export function FieldTypeIllustration({
  fieldType,
  className = "",
  compact = false,
}: FieldTypeIllustrationProps) {
  const type = normalizeFieldType(fieldType);
  const h = compact ? 56 : 72;
  const w = compact ? 88 : 112;

  const pitchColor =
    type === "futsal"
      ? { grass: "#4a3728", line: "#d4a574" }
      : { grass: "#14532d", line: "rgba(255,255,255,0.55)" };

  const label =
    type === "futsal"
      ? "Futsal"
      : type === "fut5"
        ? "F5"
        : type === "fut7"
          ? "F7"
          : "F11";

  const showBoxes = type === "fut7" || type === "futebol11";
  const showCenterCircle = type !== "futsal";

  return (
    <svg
      viewBox="0 0 112 72"
      width={w}
      height={h}
      className={className}
      aria-hidden
      data-testid={`field-illustration-${type}`}
    >
      <defs>
        <linearGradient id={`grass-${type}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={pitchColor.grass} stopOpacity="1" />
          <stop offset="100%" stopColor={pitchColor.grass} stopOpacity="0.75" />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="104" height="64" rx="8" fill={`url(#grass-${type})`} />
      <rect
        x="8"
        y="8"
        width="96"
        height="56"
        rx="4"
        fill="none"
        stroke={pitchColor.line}
        strokeWidth="1.5"
      />
      <line x1="56" y1="8" x2="56" y2="64" stroke={pitchColor.line} strokeWidth="1.2" />
      {showCenterCircle && (
        <circle cx="56" cy="36" r="10" fill="none" stroke={pitchColor.line} strokeWidth="1.2" />
      )}
      {showBoxes && (
        <>
          <rect x="8" y="22" width="14" height="28" fill="none" stroke={pitchColor.line} strokeWidth="1" />
          <rect x="90" y="22" width="14" height="28" fill="none" stroke={pitchColor.line} strokeWidth="1" />
        </>
      )}
      {type === "futebol11" && (
        <>
          <rect x="8" y="28" width="8" height="16" fill="none" stroke={pitchColor.line} strokeWidth="0.8" />
          <rect x="96" y="28" width="8" height="16" fill="none" stroke={pitchColor.line} strokeWidth="0.8" />
        </>
      )}
      <text
        x="56"
        y="68"
        textAnchor="middle"
        fill="rgba(255,255,255,0.75)"
        fontSize="9"
        fontWeight="800"
        fontFamily="system-ui, sans-serif"
      >
        {label}
      </text>
    </svg>
  );
}
