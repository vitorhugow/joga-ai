/** URL para exibir capa/foto — não acrescenta query params a data URLs */
export function imageDisplaySrc(url?: string, size = "500"): string {
  if (!url) return "";
  if (url.startsWith("data:")) return url;
  return `${url}?w=${size}&h=200&fit=crop`;
}
