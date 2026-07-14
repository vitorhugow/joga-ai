import type { LivePlayer } from "./preMatchStorage";

/** Remove chaves undefined (Firestore rejeita undefined em writes). */
function isFirestoreFieldValue(value: unknown): boolean {
  return Boolean(value && typeof value === "object" && "_methodName" in (value as object));
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
