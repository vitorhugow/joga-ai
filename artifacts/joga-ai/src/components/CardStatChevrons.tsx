type CardStatChevronsProps = {
  delta: number;
};

const UP_COLOR = "#8DBE4B";
const DOWN_COLOR = "#ef4444";

/** Chevron preenchido no estilo FIFA — aponta para cima ou para baixo. */
function ChevronShape({ up, color }: { up: boolean; color: string }) {
  return (
    <svg viewBox="0 0 40 20" className="joga-card-stat-chevron" aria-hidden>
      {up ? (
        <path
          d="M4 17 L20 4 L36 17 L32 17 L20 7 L8 17 Z"
          fill={color}
        />
      ) : (
        <path
          d="M4 3 L20 16 L36 3 L32 3 L20 13 L8 3 Z"
          fill={color}
        />
      )}
    </svg>
  );
}

export function CardStatChevrons({ delta }: CardStatChevronsProps) {
  if (!delta) return null;

  const count = Math.min(Math.abs(delta), 3);
  const up = delta > 0;
  const color = up ? UP_COLOR : DOWN_COLOR;

  return (
    <span
      className={`joga-card-stat-chevrons${up ? " joga-card-stat-chevrons--up" : " joga-card-stat-chevrons--down"}`}
      aria-label={up ? `+${delta}` : `${delta}`}
    >
      {Array.from({ length: count }, (_, i) => (
        <ChevronShape key={i} up={up} color={color} />
      ))}
    </span>
  );
}
