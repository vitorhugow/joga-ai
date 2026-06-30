import type { SavedPostMatch } from "./postMatchStorage";

export function linkPlayersInRoster<T extends { id: string; userId?: string; isMe?: boolean }>(
  roster: T[],
  authUserId: string,
): T[] {
  if (!authUserId) return roster;
  return roster.map((player) => {
    const isLinked = player.id === authUserId || player.userId === authUserId;
    return {
      ...player,
      isMe: Boolean(player.isMe || isLinked),
      userId: player.userId ?? (player.id === authUserId ? authUserId : player.userId),
    };
  });
}

export function applyAuthToMatchData(
  remote: SavedPostMatch,
  authUserId: string,
): SavedPostMatch {
  if (!authUserId) return remote;
  const players = linkPlayersInRoster(remote.players ?? [], authUserId);
  const me = players.find((p) => p.id === authUserId || p.userId === authUserId);
  return {
    ...remote,
    players,
    currentPlayerId: me?.id ?? remote.currentPlayerId,
  };
}
