/**
 * resultImage — gera a imagem de resultado da pelada (canvas puro, 1080×1350)
 * para partilha no WhatsApp. Cada partilha é um anúncio orgânico da app
 * dentro do grupo da pelada.
 */

export type ResultImageData = {
  title: string;
  dateLabel: string;
  teamAName: string;
  teamBName: string;
  scoreA: number;
  scoreB: number;
  gamesCount: number;
  topScorerName?: string;
  topScorerGoals?: number;
};

const W = 1080;
const H = 1350;

export async function generateResultImage(data: ResultImageData): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d indisponível");

  // Fundo: dark arena com glow verde (paleta da app)
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#0a0f1a");
  bg.addColorStop(0.5, "#0a1410");
  bg.addColorStop(1, "#0a0f1a");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const glow = ctx.createRadialGradient(W / 2, 560, 60, W / 2, 560, 620);
  glow.addColorStop(0, "rgba(16,185,129,0.22)");
  glow.addColorStop(1, "rgba(16,185,129,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Linhas de campo estilizadas
  ctx.strokeStyle = "rgba(255,255,255,0.05)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(W / 2, 560, 300, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(60, 560);
  ctx.lineTo(W - 60, 560);
  ctx.stroke();

  ctx.textAlign = "center";

  // Marca
  ctx.fillStyle = "#10b981";
  ctx.font = "900 54px system-ui, -apple-system, sans-serif";
  ctx.fillText("JOGA AI", W / 2, 120);

  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.font = "700 30px system-ui, sans-serif";
  ctx.fillText("RESULTADO FINAL", W / 2, 175);

  // Título da pelada + data
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 58px system-ui, sans-serif";
  ctx.fillText(truncate(data.title, 26), W / 2, 280);
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.font = "600 32px system-ui, sans-serif";
  ctx.fillText(data.dateLabel, W / 2, 335);

  // Placar
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 200px system-ui, sans-serif";
  ctx.fillText(`${data.scoreA}`, W / 2 - 220, 640);
  ctx.fillText(`${data.scoreB}`, W / 2 + 220, 640);
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.font = "900 80px system-ui, sans-serif";
  ctx.fillText("×", W / 2, 615);

  // Nomes dos times
  ctx.font = "800 40px system-ui, sans-serif";
  ctx.fillStyle = "#34d399";
  ctx.fillText(truncate(data.teamAName, 12), W / 2 - 220, 730);
  ctx.fillStyle = "#60a5fa";
  ctx.fillText(truncate(data.teamBName, 12), W / 2 + 220, 730);

  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.font = "600 30px system-ui, sans-serif";
  ctx.fillText(
    data.gamesCount > 1 ? `${data.gamesCount} jogos somados` : "1 jogo",
    W / 2,
    800,
  );

  // Artilheiro
  if (data.topScorerName) {
    roundRect(ctx, 120, 880, W - 240, 150, 28);
    ctx.fillStyle = "rgba(16,185,129,0.10)";
    ctx.fill();
    ctx.strokeStyle = "rgba(16,185,129,0.35)";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font = "800 28px system-ui, sans-serif";
    ctx.fillText("⚽ ARTILHEIRO DO DIA", W / 2, 935);
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 46px system-ui, sans-serif";
    const goals =
      data.topScorerGoals != null
        ? `  ·  ${data.topScorerGoals} ${data.topScorerGoals === 1 ? "golo" : "golos"}`
        : "";
    ctx.fillText(truncate(data.topScorerName, 18) + goals, W / 2, 995);
  }

  // Rodapé / CTA
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.font = "600 30px system-ui, sans-serif";
  ctx.fillText("Cria a tua carta de jogador e evolui a cada pelada", W / 2, 1200);
  ctx.fillStyle = "#10b981";
  ctx.font = "900 40px system-ui, sans-serif";
  ctx.fillText("jogaai.pt", W / 2, 1260);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob falhou"))),
      "image/png",
    );
  });
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
