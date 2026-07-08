import { lazy, type ComponentType, type LazyExoticComponent } from "react";

const CHUNK_RELOAD_KEY = "joga-ai-chunk-reload";

/**
 * lazy() com retry — se o chunk falhar (deploy novo + SW antigo), recarrega uma vez.
 */
export function lazyRoute<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(() =>
    factory().catch((err) => {
      if (!sessionStorage.getItem(CHUNK_RELOAD_KEY)) {
        sessionStorage.setItem(CHUNK_RELOAD_KEY, "1");
        window.location.reload();
        return new Promise<{ default: T }>(() => {});
      }
      sessionStorage.removeItem(CHUNK_RELOAD_KEY);
      throw err;
    }),
  );
}
