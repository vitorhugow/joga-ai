/**
 * colorContrast — escolhe texto branco ou escuro consoante o brilho de uma
 * cor de fundo escolhida pelo admin (branding.primaryColor), para nunca ficar
 * texto escuro sobre fundo escuro (ou claro sobre claro).
 */

function parseHexColor(hex: string): [number, number, number] | null {
  const clean = hex.trim().replace(/^#/, "");
  const full =
    clean.length === 3
      ? clean.split("").map((c) => c + c).join("")
      : clean;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

/** Luminância relativa aproximada (suficiente para decidir contraste de UI). */
function relativeLuminance(r: number, g: number, b: number): number {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** Devolve "#ffffff" ou uma cor escura, conforme o que for legível sobre `hex`. */
export function getContrastTextColor(hex: string | undefined | null, fallback = "#ffffff"): string {
  if (!hex) return fallback;
  const rgb = parseHexColor(hex);
  if (!rgb) return fallback;
  const luminance = relativeLuminance(...rgb);
  return luminance > 0.6 ? "#111827" : "#ffffff";
}
