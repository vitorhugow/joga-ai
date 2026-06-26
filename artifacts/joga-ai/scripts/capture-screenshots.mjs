import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "../public/screenshots");
const BASE = "http://localhost:5173";

const pages = [
  { url: "/", name: "home.png" },
  { url: "/perfil", name: "perfil.png" },
  { url: "/partida/100/pre-jogo", name: "pre-jogo.png" },
  { url: "/perfil/evolucao", name: "evolucao.png" },
  { url: "/comunidades/1", name: "comunidade.png" },
  { url: "/ranking", name: "ranking.png" },
];

await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
});
const page = await context.newPage();

for (const entry of pages) {
  console.log(`Capturing ${entry.url} → ${entry.name}`);
  await page.goto(`${BASE}${entry.url}`, { waitUntil: "networkidle", timeout: 45000 });
  await page.waitForTimeout(2000);
  await page.screenshot({
    path: path.join(OUT, entry.name),
    fullPage: false,
  });
}

await browser.close();
console.log("Done!");
