/**
 * cardExportUtils — exportar carta como PNG e partilhar
 */

import { toPng } from "html-to-image";

export type CardExportOptions = {
  filename?: string;
  pixelRatio?: number;
};

async function waitForImages(root: HTMLElement): Promise<void> {
  const images = Array.from(root.querySelectorAll("img"));
  await Promise.all(
    images.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) {
            resolve();
            return;
          }
          img.onload = () => resolve();
          img.onerror = () => resolve();
        }),
    ),
  );
}

/** Clona o nó para o viewport com dimensões completas (evita corte e cores esvaziadas) */
function prepareExportNode(element: HTMLElement): { node: HTMLElement; cleanup: () => void } {
  const width = Math.ceil(element.scrollWidth || element.getBoundingClientRect().width);
  const height = Math.ceil(element.scrollHeight || element.getBoundingClientRect().height);

  const clone = element.cloneNode(true) as HTMLElement;
  clone.style.position = "fixed";
  clone.style.left = "0";
  clone.style.top = "0";
  clone.style.zIndex = "-1";
  clone.style.opacity = "1";
  clone.style.pointerEvents = "none";
  clone.style.overflow = "visible";
  clone.style.width = `${width}px`;
  clone.style.height = `${height}px`;
  clone.style.transform = "none";
  clone.style.background = "#0a0f1a";

  clone.querySelectorAll(".joga-new-player-card-wrap").forEach((node) => {
    const wrap = node as HTMLElement;
    wrap.style.filter = "none";
    wrap.style.width = `${width}px`;
    wrap.style.maxWidth = "none";
  });

  document.body.appendChild(clone);
  return {
    node: clone,
    cleanup: () => {
      clone.remove();
    },
  };
}

export async function exportElementToPng(
  element: HTMLElement,
  options: CardExportOptions = {},
): Promise<Blob> {
  const { node, cleanup } = prepareExportNode(element);

  try {
    await waitForImages(node);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    const width = Math.ceil(node.scrollWidth || node.getBoundingClientRect().width);
    const height = Math.ceil(node.scrollHeight || node.getBoundingClientRect().height);

    const dataUrl = await toPng(node, {
      // HD (3x) para a imagem aguentar uso em vídeo. As fontes agora são
      // same-origin (/fonts/fonts.css) — o html-to-image embebe-as sem o
      // SecurityError que a folha cross-origin do Google Fonts provocava.
      pixelRatio: options.pixelRatio ?? 3,
      cacheBust: true,
      backgroundColor: "#0a0f1a",
      width,
      height,
      style: {
        transform: "none",
        width: `${width}px`,
        height: `${height}px`,
      },
    });

    const res = await fetch(dataUrl);
    return res.blob();
  } finally {
    cleanup();
  }
}

export async function exportPlayerCardPng(
  element: HTMLElement,
  options: CardExportOptions = {},
): Promise<Blob> {
  return exportElementToPng(element, options);
}

export async function shareOrDownloadPng(
  blob: Blob,
  filename: string,
  shareTitle: string,
  shareText = "",
): Promise<"shared" | "downloaded" | "copied"> {
  const file = new File([blob], filename, { type: "image/png" });

  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({
      title: shareTitle,
      text: shareText,
      files: [file],
    });
    return "shared";
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return "downloaded";
}
