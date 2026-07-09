/**
 * Controladores ao vivo — retrocompatível com liveControllerId (string).
 */

export type MatchControllerFields = {
  liveControllerIds?: string[] | null;
  liveControllerId?: string | null;
  organizerId?: string | null;
};

/** Resolve a lista efectiva de controladores, garantindo o organizador. */
export function resolveControllerIds(match: MatchControllerFields): string[] {
  let ids: string[];

  if (Array.isArray(match.liveControllerIds) && match.liveControllerIds.length > 0) {
    ids = [...match.liveControllerIds];
  } else if (match.liveControllerId) {
    ids = [match.liveControllerId];
  } else if (match.organizerId) {
    ids = [match.organizerId];
  } else {
    ids = [];
  }

  const organizerId = match.organizerId;
  if (organizerId && !ids.includes(organizerId)) {
    ids = [organizerId, ...ids];
  }

  return ids;
}

export function isUserLiveController(
  userId: string | null | undefined,
  match: MatchControllerFields,
): boolean {
  if (!userId) return false;
  return resolveControllerIds(match).includes(userId);
}

export type LiveEventLike = {
  id: string;
  type: string;
  playerId: string;
  team: string;
  miniGameId: string;
};

export type LiveEventInput = {
  miniGameId: string;
  type: string;
  playerId: string;
  team: string;
};

const DUPLICATE_WINDOW_MS = 10_000;
const CLICK_BUCKET_MS = 400;

/** Extrai o bucket temporal do eventId (último segmento numérico). */
function eventBucketMs(eventId: string): number | null {
  const bucket = Number(eventId.split("-").pop());
  return Number.isFinite(bucket) ? bucket * CLICK_BUCKET_MS : null;
}

/** Verifica duplicado recente com base no estado local (onSnapshot). */
export function findRecentDuplicateEvent(
  events: LiveEventLike[],
  input: LiveEventInput,
  windowMs = DUPLICATE_WINDOW_MS,
): LiveEventLike | null {
  const now = Date.now();

  for (const event of events) {
    if (
      event.miniGameId !== input.miniGameId ||
      event.type !== input.type ||
      event.playerId !== input.playerId ||
      event.team !== input.team
    ) {
      continue;
    }

    const bucketMs = eventBucketMs(event.id);
    if (bucketMs === null) continue;
    if (now - bucketMs <= windowMs) return event;
  }

  return null;
}
