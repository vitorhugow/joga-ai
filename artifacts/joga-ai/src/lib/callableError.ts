/** Mensagem legível de erros de Cloud Functions (httpsCallable). */
export function callableErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === "object") {
    const e = err as {
      message?: string;
      code?: string;
      details?: { message?: string } | string;
    };
    const detail =
      typeof e.details === "string"
        ? e.details.trim()
        : e.details?.message?.trim();
    if (detail && detail.length < 400) return detail;

    const msg = e.message?.trim();
    if (msg && msg !== "INTERNAL" && !/^internal$/i.test(msg) && msg.length < 400) {
      return msg;
    }
  }
  return fallback;
}
