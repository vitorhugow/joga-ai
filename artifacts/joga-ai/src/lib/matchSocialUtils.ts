export type MatchConfirmedPlayer = {
  userId?: string;
  name: string;
  photoUrl?: string;
};

export type KnownGoingDisplay =
  | {
      mode: "known";
      label: string;
      avatars: Array<{ name: string; photoUrl?: string }>;
    }
  | {
      mode: "count";
      label: string;
    };

/**
 * "Conhecidos" = jogadores confirmados que pertencem a comunidades em comum.
 * Sem conhecidos → só contagem total.
 */
export function buildKnownGoingDisplay(
  players: MatchConfirmedPlayer[] | undefined,
  peerUserIds: Set<string>,
  currentUserId?: string,
): KnownGoingDisplay | null {
  const confirmed = (players ?? []).filter((p) => p.name?.trim());
  if (confirmed.length === 0) return null;

  const known = confirmed.filter(
    (p) => p.userId && p.userId !== currentUserId && peerUserIds.has(p.userId),
  );

  if (known.length === 0) {
    return {
      mode: "count",
      label: `${confirmed.length} confirmado${confirmed.length !== 1 ? "s" : ""}`,
    };
  }

  const firstNames = known.map((p) => p.name.split(" ")[0]);
  const shown = firstNames.slice(0, 2);
  const extra = known.length - shown.length;
  const label =
    extra > 0
      ? `${shown.join(", ")} +${extra} vão`
      : shown.length === 2
        ? `${shown.join(", ")} vão`
        : `${shown[0]} vai`;

  return {
    mode: "known",
    label,
    avatars: known.slice(0, 4).map((p) => ({
      name: p.name,
      photoUrl: p.photoUrl,
    })),
  };
}
