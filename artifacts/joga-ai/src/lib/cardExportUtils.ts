/**
 * cardExportUtils — exportar carta como PNG e partilhar
 */

import { toPng } from "html-to-image";

export type CardExportOptions = {
  filename?: string;
  pixelRatio?: number;
  width?: number;
  height?: number;
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

/** Clona o nó para o viewport e remove filtros CSS que esvaziam cores no html-to-image */
function prepareExportNode(element: HTMLElement): { node: HTMLElement; cleanup: () => void } {
  const clone = element.cloneNode(true) as HTMLElement;
  clone.style.position = "fixed";
  clone.style.left = "0";
  clone.style.top = "0";
  clone.style.zIndex = "-1";
  clone.style.opacity = "1";
  clone.style.pointerEvents = "none";
  clone.style.background = "#0a0f1a";

  clone.querySelectorAll(".joga-new-player-card-wrap").forEach((node) => {
    (node as HTMLElement).style.filter = "none";
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

    const dataUrl = await toPng(node, {
      pixelRatio: options.pixelRatio ?? 2,
      cacheBust: true,
      backgroundColor: "#0a0f1a",
      width: options.width,
      height: options.height,
      style: {
        transform: "none",
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
  return exportElementToPng(element, {
    pixelRatio: options.pixelRatio ?? 2,
    width: options.width,
    height: options.height,
  });
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
