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

export async function exportElementToPng(
  element: HTMLElement,
  options: CardExportOptions = {},
): Promise<Blob> {
  const dataUrl = await toPng(element, {
    pixelRatio: options.pixelRatio ?? 2,
    cacheBust: true,
    backgroundColor: "#0a0f1a",
    width: options.width,
    height: options.height,
  });

  const res = await fetch(dataUrl);
  return res.blob();
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
