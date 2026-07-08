/** Liga enforcement App Check nas callables sensíveis (activar após período MONITOR). */
export const ENFORCE_APP_CHECK = process.env.ENFORCE_APP_CHECK === "true";

export const REGION = "europe-west1";

export function callableBase(extra?: Record<string, unknown>) {
  return {
    region: REGION,
    enforceAppCheck: ENFORCE_APP_CHECK,
    ...extra,
  };
}
