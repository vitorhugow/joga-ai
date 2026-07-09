/** URL para exibir capa/foto — não acrescenta query params a data URLs */
export function imageDisplaySrc(url?: string, size = "500"): string {
  if (!url) return "";
  if (url.startsWith("data:")) return url;
  if (url.includes("firebasestorage.googleapis.com")) return url;
  return `${url}?w=${size}&h=200&fit=crop`;
}

/** Retrocompat: URL do Storage em photoUrl/coverUrl; senão base64 legado em coverImage. */
export function resolveImageSrc(
  primaryUrl?: string,
  legacyBase64?: string,
): string | undefined {
  if (primaryUrl) {
    if (primaryUrl.startsWith("data:") || primaryUrl.startsWith("http")) return primaryUrl;
  }
  if (legacyBase64?.startsWith("data:") || legacyBase64?.startsWith("http")) {
    return legacyBase64;
  }
  return undefined;
}

export function resolveCommunityCover(input: {
  coverUrl?: string;
  coverImage?: string;
}): string | undefined {
  return resolveImageSrc(input.coverUrl, input.coverImage);
}

const STORAGE_MAX_DIM = 1600;
const STORAGE_JPEG_QUALITY = 0.85;

/** Comprime para upload no Storage (webp, até 1600px). */
export async function compressBlobForStorage(source: Blob | File | string): Promise<Blob> {
  const blob =
    typeof source === "string"
      ? await (await fetch(source)).blob()
      : source;

  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = typeof source === "string" ? source : URL.createObjectURL(blob);
    img.onload = () => {
      let width = img.naturalWidth;
      let height = img.naturalHeight;
      if (width > STORAGE_MAX_DIM || height > STORAGE_MAX_DIM) {
        const scale = STORAGE_MAX_DIM / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        if (typeof source !== "string") URL.revokeObjectURL(objectUrl);
        resolve(blob);
        return;
      }

      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (out) => {
          if (typeof source !== "string") URL.revokeObjectURL(objectUrl);
          if (out) resolve(out);
          else reject(new Error("Não foi possível comprimir a imagem"));
        },
        "image/webp",
        STORAGE_JPEG_QUALITY,
      );
    };
    img.onerror = () => {
      if (typeof source !== "string") URL.revokeObjectURL(objectUrl);
      reject(new Error("Não foi possível processar a imagem"));
    };
    img.src = objectUrl;
  });
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
