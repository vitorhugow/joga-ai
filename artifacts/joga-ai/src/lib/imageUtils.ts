/** URL para exibir capa/foto — não acrescenta query params a data URLs */
export function imageDisplaySrc(url?: string, size = "500"): string {
  if (!url) return "";
  if (url.startsWith("data:")) return url;
  return `${url}?w=${size}&h=200&fit=crop`;
}

/** Comprime data URL JPEG até caber no limite Firestore */
export function compressDataUrlToMaxBytes(
  dataUrl: string,
  maxBytes: number,
): Promise<string> {
  if (!dataUrl.startsWith("data:") || dataUrl.length <= maxBytes) {
    return Promise.resolve(dataUrl);
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let width = img.naturalWidth;
      let height = img.naturalHeight;
      const maxDim = 360;
      if (width > maxDim || height > maxDim) {
        const scale = maxDim / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(dataUrl);
        return;
      }

      let quality = 0.82;
      const render = () => {
        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);
        return canvas.toDataURL("image/jpeg", quality);
      };

      let result = render();
      while (result.length > maxBytes && quality > 0.35) {
        quality -= 0.07;
        result = render();
      }
      while (result.length > maxBytes && width > 96) {
        width = Math.round(width * 0.85);
        height = Math.round(height * 0.85);
        result = render();
      }

      resolve(result.length <= maxBytes ? result : dataUrl);
    };
    img.onerror = () => reject(new Error("Não foi possível processar a imagem"));
    img.src = dataUrl;
  });
}
