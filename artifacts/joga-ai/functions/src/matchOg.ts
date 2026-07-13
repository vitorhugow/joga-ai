/**
 * Preview Open Graph para partilhas (WhatsApp, etc.).
 * URL: /matchOgPreview?matchId=...
 * Humanos: redirect para a app; crawlers: leem as meta tags do HTML.
 */

import { onRequest } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { REGION } from "./callableOptions";

const SITE_ORIGIN = "https://jogaai.pt";
const DEFAULT_OG_IMAGE = `${SITE_ORIGIN}/opengraph.jpg`;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatSchedule(date?: string, time?: string): string {
  if (!date && !time) return "Data a definir";
  if (date && time) {
    try {
      const d = new Date(`${date}T${time}`);
      return d.toLocaleString("pt-PT", {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return `${date} ${time}`;
    }
  }
  return date || time || "Data a definir";
}

function spotsLabel(players: unknown[], maxPlayers?: number): string {
  const count = Array.isArray(players) ? players.length : 0;
  const max = Math.max(4, Number(maxPlayers) || 14);
  const left = Math.max(0, max - count);
  if (left === 0) return "Lotado";
  return `${left} ${left === 1 ? "vaga" : "vagas"}`;
}

export const matchOgPreview = onRequest({ region: REGION }, async (req, res) => {
  const matchId = String(req.query.matchId ?? "").trim();
  if (!matchId) {
    res.status(400).send("matchId em falta");
    return;
  }

  const appUrl = `${SITE_ORIGIN}/partida/${encodeURIComponent(matchId)}/pre-jogo`;
  let title = "Pelada Joga AI";
  let description = "Entra na pelada, monta o teu plantel e joga com a malta.";
  let image = DEFAULT_OG_IMAGE;

  try {
    const snap = await getFirestore().doc(`matches/${matchId}`).get();
    if (snap.exists) {
      const data = snap.data() ?? {};
      title = String(data.title ?? title).trim() || title;
      const city = String(data.city ?? "").trim();
      const location = String(data.location ?? "").trim();
      const schedule = formatSchedule(
        String(data.scheduledDate ?? data.date ?? ""),
        String(data.scheduledTime ?? data.time ?? ""),
      );
      const price = String(data.price ?? "Grátis").trim() || "Grátis";
      const spots = spotsLabel(data.players, Number(data.maxPlayers));
      const place = [location, city].filter(Boolean).join(" · ") || city || "Local a definir";
      description = `${schedule} · ${place} · ${spots} · ${price}`;
      const gameType = String(data.gameType ?? "").trim();
      if (gameType) description = `${gameType.toUpperCase()} — ${description}`;
    }
  } catch (err) {
    console.warn("[matchOgPreview]", err);
  }

  const safeTitle = escapeHtml(title);
  const safeDescription = escapeHtml(description);
  const safeImage = escapeHtml(image);
  const safeUrl = escapeHtml(appUrl);

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300");
  res.status(200).send(`<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeTitle} · Joga AI</title>
  <meta name="description" content="${safeDescription}" />
  <meta property="og:title" content="${safeTitle}" />
  <meta property="og:description" content="${safeDescription}" />
  <meta property="og:image" content="${safeImage}" />
  <meta property="og:url" content="${safeUrl}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Joga AI" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${safeTitle}" />
  <meta name="twitter:description" content="${safeDescription}" />
  <meta name="twitter:image" content="${safeImage}" />
  <meta http-equiv="refresh" content="0;url=${safeUrl}" />
  <link rel="canonical" href="${safeUrl}" />
</head>
<body style="background:#0a0f1a;color:#fff;font-family:system-ui,sans-serif;padding:2rem;text-align:center">
  <p>A abrir a pelada…</p>
  <p><a href="${safeUrl}" style="color:#4ade80">${safeTitle}</a></p>
</body>
</html>`);
});
