import { cn } from "@/lib/utils";
import { imageDisplaySrc } from "@/lib/imageUtils";
import { getContrastTextColor } from "@/lib/colorContrast";

const FALLBACK_COLOR = "#18B85E";

/** Cor estável derivada do nome/id — mesmo clube dá sempre a mesma cor. */
function stableColorFromString(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 62%, 40%)`;
}

interface ClubCrestProps {
  name: string;
  crestUrl?: string;
  primaryColor?: string;
  size?: number;
  className?: string;
}

/** Badge redondo do clube — imagem se houver crestUrl, senão inicial sobre cor estável. */
export function ClubCrest({ name, crestUrl, primaryColor, size = 48, className }: ClubCrestProps) {
  const dimension = { width: size, height: size };

  if (crestUrl) {
    return (
      <img
        src={imageDisplaySrc(crestUrl)}
        alt={name}
        className={cn("rounded-full object-cover shrink-0", className)}
        style={dimension}
      />
    );
  }

  const bg = primaryColor || stableColorFromString(name || "clube") || FALLBACK_COLOR;
  const initial = (name?.trim()?.[0] || "?").toUpperCase();

  return (
    <div
      className={cn("rounded-full flex items-center justify-center shrink-0 font-black", className)}
      style={{
        ...dimension,
        background: bg,
        color: getContrastTextColor(bg.startsWith("#") ? bg : undefined, "#ffffff"),
        fontSize: size * 0.42,
      }}
    >
      {initial}
    </div>
  );
}
