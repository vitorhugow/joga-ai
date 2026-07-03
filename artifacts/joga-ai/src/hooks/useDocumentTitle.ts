import { useEffect } from "react";

/**
 * Define document.title como "{título} · Joga AI" enquanto o componente
 * está montado, repondo o título anterior ao desmontar (útil para o
 * transitions entre páginas do wouter, que não desmontam a app inteira).
 */
export function useDocumentTitle(title?: string) {
  useEffect(() => {
    if (!title) return;
    const previous = document.title;
    document.title = `${title} · Joga AI`;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
