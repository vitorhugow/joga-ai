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

function upsertCanonical(href: string) {
  let el = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  el.href = href;
}

/**
 * Atualiza meta tags Open Graph / Twitter e o <link rel="canonical">
 * (útil em SPA; crawlers sem JS podem ignorar). Sem isto, todas as rotas
 * serviam o mesmo index.html com o canonical fixo em "/", declarando-se
 * canónicas da homepage — o Google não indexava nenhuma delas.
 */
export function usePageMeta(meta: PageMeta) {
  useEffect(() => {
    const previousTitle = document.title;
    const previousCanonical = document.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? null;

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
    const canonicalUrl =
      meta.url ??
      (typeof window !== "undefined" ? window.location.origin + window.location.pathname : undefined);
    if (canonicalUrl) {
      upsertMeta("property", "og:url", canonicalUrl);
      upsertCanonical(canonicalUrl);
    }
    upsertMeta("property", "og:type", "website");

    return () => {
      document.title = previousTitle;
      if (previousCanonical) upsertCanonical(previousCanonical);
    };
  }, [meta.title, meta.description, meta.image, meta.url]);
}
