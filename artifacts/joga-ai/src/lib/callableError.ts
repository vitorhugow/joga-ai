/** Mensagem legível de erros de Cloud Functions (httpsCallable). */
export function callableErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === "object") {
    const e = err as { message?: string; details?: { message?: string } };
    const msg = e.message?.trim();
    if (msg && !msg.includes("internal") && msg.length < 280) return msg;
    const detail = e.details?.message?.trim();
    if (detail) return detail;
  }
  return fallback;
}
