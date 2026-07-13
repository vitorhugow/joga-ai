import { useEffect } from "react";

type PageMeta = {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
};

function upsertMeta(attr: "name" | "property", key: string, content: string) {
  const selector = `meta[${attr}="${key}"]`;
  let el = document.querySelector(selector) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.content = content;
}

/** Atualiza meta tags Open Graph / Twitter (útil em SPA; crawlers sem JS podem ignorar). */
export function usePageMeta(meta: PageMeta) {
  useEffect(() => {
    const previousTitle = document.title;

    if (meta.title) {
      document.title = `${meta.title} · Joga AI`;
      upsertMeta("property", "og:title", meta.title);
      upsertMeta("name", "twitter:title", meta.title);
    }
    if (meta.description) {
      upsertMeta("name", "description", meta.description);
      upsertMeta("property", "og:description", meta.description);
      upsertMeta("name", "twitter:description", meta.description);
    }
    if (meta.image) {
      upsertMeta("property", "og:image", meta.image);
      upsertMeta("name", "twitter:image", meta.image);
    }
    if (meta.url) {
      upsertMeta("property", "og:url", meta.url);
    }
    upsertMeta("property", "og:type", "website");

    return () => {
      document.title = previousTitle;
    };
  }, [meta.title, meta.description, meta.image, meta.url]);
}
