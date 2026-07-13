import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import fs from "node:fs";
import type { Plugin } from "vite";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { VitePWA } from "vite-plugin-pwa";

function firebaseMessagingSwPlugin(): Plugin {
  return {
    name: "firebase-messaging-sw",
    configResolved(config) {
      const env = loadEnv(config.mode, config.root, "VITE_");
      const firebaseConfig = {
        apiKey: env.VITE_FIREBASE_API_KEY ?? "",
        authDomain: env.VITE_FIREBASE_AUTH_DOMAIN ?? "",
        projectId: env.VITE_FIREBASE_PROJECT_ID ?? "",
        storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET ?? "",
        messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "",
        appId: env.VITE_FIREBASE_APP_ID ?? "",
      };
      const sw = `/* Firebase Cloud Messaging — background (gerado no build) */
importScripts('https://www.gstatic.com/firebasejs/11.4.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.4.0/firebase-messaging-compat.js');
firebase.initializeApp(${JSON.stringify(firebaseConfig)});
const messaging = firebase.messaging();
messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title ?? payload.data?.title ?? "Joga AI";
  const body = payload.notification?.body ?? payload.data?.body ?? "";
  const link = payload.data?.link ?? "/";
  self.registration.showNotification(title, {
    body,
    icon: "/pwa-192.png",
    badge: "/pwa-192.png",
    data: { link },
    tag: payload.data?.notifId,
  });
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = event.notification.data?.link ?? "/";
  event.waitUntil(clients.openWindow(link));
});`;
      fs.writeFileSync(path.resolve(config.root, "public/firebase-messaging-sw.js"), sw);
    },
  };
}

const port = Number(process.env.PORT ?? "5173");

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${process.env.PORT ?? ""}"`);
}

const basePath = process.env.BASE_PATH ?? "/";

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    firebaseMessagingSwPlugin(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      includeAssets: ["favicon.svg", "favicon-48.png", "apple-touch-icon.png"],
      manifest: {
        name: "Joga AI",
        short_name: "Joga AI",
        description: "Joga AI — A tua pelada. A tua carta. A tua evolução.",
        theme_color: "#0a0f1a",
        background_color: "#0a0f1a",
        display: "standalone",
        orientation: "portrait",
        start_url: basePath,
        scope: basePath,
        lang: "pt",
        icons: [
          { src: "pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // SPA: qualquer rota (/admin, /premium, …) serve index.html
        navigateFallback: "index.html",
        navigateFallbackDenylist: [/^\/api\//, /^\/\.well-known\//, /^\/assets\//, /\.(?:js|css|mjs)(?:\?.*)?$/],
        // Novo deploy substitui o SW de imediato (evita router antigo em cache)
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        // Deixa as leituras/escritas do Firestore fluírem pela persistência
        // nativa do SDK (persistentLocalCache); o service worker só cacheia
        // os assets estáticos da app (JS/CSS/imagens/fontes).
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
        globIgnores: ["**/firebase-messaging-sw.js", "firebase-messaging-sw.js"],
      },
    }),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom", "wouter"],
          "vendor-firebase": ["firebase/app", "firebase/auth", "firebase/firestore"],
          "vendor-motion": ["framer-motion"],
        },
      },
    },
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
