/**
 * pwaUpdate.ts — mantém a app atualizada dentro do TWA (Android).
 *
 * Causa raiz do bug "app instalada fica dias com dados/UI antigos": o
 * vite-plugin-pwa estava configurado com registerType "autoUpdate" +
 * injectRegister "auto", mas nada importava "virtual:pwa-register". Nessa
 * combinação o plugin gera um registerSW.js que só faz
 * navigator.serviceWorker.register() no evento load — sem update()
 * periódico e sem reload quando um SW novo assume. Num TWA nunca há uma
 * nova navegação de topo (a app abre sempre na mesma instância), por isso
 * o service worker nunca era revalidado.
 *
 * IMPORTANTE (registerType "autoUpdate", confirmado em
 * vite-plugin-pwa@1.3.0 dist/client/build/register.js): o ramo "auto" do
 * registerSW NUNCA chama onNeedRefresh — esse callback só existe no ramo
 * "prompt". O hook correto para intercetar o reload automático é
 * onNeedReload, chamado no evento "activated" do workbox-window quando
 * event.isUpdate || event.isExternal; sem esse callback o próprio plugin já
 * faz window.location.reload() sozinho. A função devolvida por registerSW
 * também é um no-op em modo "auto" (só envia skipWaiting em modo "prompt"),
 * por isso nunca deve ser usada para forçar o reload aqui.
 */

import { registerSW } from "virtual:pwa-register";

const UPDATE_CHECK_INTERVAL_MS = 60_000;

type NeedReloadListener = () => void;

let needsReload = false;
const listeners = new Set<NeedReloadListener>();

function notifyNeedReload() {
  needsReload = true;
  listeners.forEach((listener) => listener());
}

/** Subscreve a UI ao estado "há uma versão nova pronta a assumir". Chama logo o listener se já estiver pendente. */
export function subscribePwaNeedRefresh(listener: NeedReloadListener): () => void {
  listeners.add(listener);
  if (needsReload) listener();
  return () => {
    listeners.delete(listener);
  };
}

/** Regista o service worker e liga os gatilhos de revalidação. Chamar uma vez, no arranque (main.tsx). */
export function initPwaUpdate(): void {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  registerSW({
    immediate: true,
    // Em modo "autoUpdate" isto substitui o reload automático do plugin —
    // deixamos a app decidir quando recarregar (botão no banner) em vez de
    // arrancar a página debaixo do utilizador sem aviso.
    onNeedReload() {
      notifyNeedReload();
    },
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;

      const checkForUpdate = () => {
        registration.update().catch(() => {});
      };

      window.setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL_MS);

      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") checkForUpdate();
      });

      window.addEventListener("focus", checkForUpdate);
    },
    onRegisterError(error) {
      console.warn("[pwaUpdate] falha ao registar service worker:", error);
    },
  });
}
