import { lazy, type ComponentType, type LazyExoticComponent } from "react";

const CHUNK_RELOAD_KEY = "joga-ai-chunk-reload";

/**
 * lazy() com retry — se o chunk falhar (deploy novo + SW antigo), recarrega uma vez.
 */
function reloadAfterChunkFailure() {
  const url = new URL(window.location.href);
  url.searchParams.set("_cb", String(Date.now()));
  window.location.replace(url.toString());
}

async function clearCachesAndReload() {
  if ("caches" in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  }
  if ("serviceWorker" in navigator) {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
  }
  reloadAfterChunkFailure();
}

export function lazyRoute<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(() =>
    factory().catch((err) => {
      const count = parseInt(sessionStorage.getItem(CHUNK_RELOAD_KEY) || "0", 10);
      if (count < 3) {
        sessionStorage.setItem(CHUNK_RELOAD_KEY, String(count + 1));
        void clearCachesAndReload();
        return new Promise<{ default: T }>(() => {});
      }
      sessionStorage.removeItem(CHUNK_RELOAD_KEY);
      throw err;
    }),
  );
}
