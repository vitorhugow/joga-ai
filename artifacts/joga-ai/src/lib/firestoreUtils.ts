import type { LivePlayer } from "./preMatchStorage";

/** Remove chaves undefined (Firestore rejeita undefined em writes). */
function isFirestoreFieldValue(value: unknown): boolean {
  return Boolean(value && typeof value === "object" && "_methodName" in (value as object));
}

/** Converte Timestamp/string do Firestore para ISO — evita parseSavedAt=0 no merge. */
export function coerceFirestoreTimestampToIso(value: unknown): string {
  if (!value) return new Date().toISOString();
  if (typeof value === "string") {
    const time = new Date(value).getTime();
    return Number.isNaN(time) ? new Date().toISOString() : value;
  }
  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof (value as { toDate: () => Date }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return new Date().toISOString();
}

export function firestoreTimestampToMs(value: unknown): number {
  const iso = coerceFirestoreTimestampToIso(value);
  const time = new Date(iso).getTime();
  return Number.isNaN(time) ? 0 : time;
}

export function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;

    if (Array.isArray(value)) {
      out[key] = value.map((item) =>
        item && typeof item === "object" && !Array.isArray(item) && !isFirestoreFieldValue(item)
          ? stripUndefined(item as Record<string, unknown>)
          : item,
      );
      continue;
    }

    if (value && typeof value === "object" && !isFirestoreFieldValue(value)) {
      out[key] = stripUndefined(value as Record<string, unknown>);
      continue;
    }

    out[key] = value;
  }

  return out as T;
}

/** Jogador de plantel sem campos undefined — seguro para setDoc/updateDoc. */
export function sanitizeLivePlayer(player: LivePlayer): Record<string, unknown> {
  return stripUndefined({
    id: player.id,
    name: player.name,
    position: player.position,
    overall: player.overall,
    paid: player.paid,
    paidVia: player.paidVia,
    isMe: player.isMe,
    manual: player.manual,
    userId: player.userId,
    guestId: player.guestId,
    loanCard: player.loanCard,
  });
}

export function sanitizeLivePlayers(players: LivePlayer[]): Record<string, unknown>[] {
  return players.map(sanitizeLivePlayer);
}
