import { useEffect, useState } from "react";
import { Trophy, User } from "lucide-react";
import { loadPublicProfiles, type PublicUserProfile } from "@/lib/userRepository";

export type RankingBoardEntry = {
  id: string;
  userId?: string;
  name: string;
  value: number | string;
};

type PlayerRankingBoardProps = {
  entries: RankingBoardEntry[];
  valueLabel: string;
};

const PODIUM_SIZES = [64, 88, 64] as const; // [2º, 1º, 3º]
const PODIUM_RING = ["rgba(255,255,255,0.35)", "#fbbf24", "#b45309"];
const PODIUM_ORDER = [1, 0, 2] as const; // índice em `top3` a mostrar em cada slot visual

function Avatar({
  photoUrl,
  name,
  size,
  ringColor,
}: {
  photoUrl?: string;
  name: string;
  size: number;
  ringColor?: string;
}) {
  return (
    <div
      className="rounded-full flex items-center justify-center overflow-hidden shrink-0"
      style={{
        width: size,
        height: size,
        background: "rgba(255,255,255,0.08)",
        border: ringColor ? `2px solid ${ringColor}` : "1px solid rgba(255,255,255,0.1)",
      }}
    >
      {photoUrl ? (
        <img src={photoUrl} alt={name} className="w-full h-full object-cover" />
      ) : (
        <User className="text-white/30" style={{ width: size * 0.5, height: size * 0.5 }} />
      )}
    </div>
  );
}

export function PlayerRankingBoard({ entries, valueLabel }: PlayerRankingBoardProps) {
  const [profiles, setProfiles] = useState<Map<string, PublicUserProfile>>(new Map());

  useEffect(() => {
    const userIds = entries.map((e) => e.userId).filter((v): v is string => Boolean(v));
    if (userIds.length === 0) {
      setProfiles(new Map());
      return;
    }
    let cancelled = false;
    loadPublicProfiles(userIds).then((map) => {
      if (!cancelled) setProfiles(map);
    });
    return () => {
      cancelled = true;
    };
  }, [entries]);

  if (entries.length === 0) {
    return <p className="text-white/40 text-sm text-center py-6">Ainda sem dados para mostrar.</p>;
  }

  const top3 = entries.slice(0, 3);

  return (
    <div data-testid="player-ranking-board">
      <div className="flex items-end justify-center gap-3 px-2">
        {PODIUM_ORDER.map((slotIndex, visualIndex) => {
          const entry = top3[slotIndex];
          if (!entry) return <div key={`empty-${visualIndex}`} className="flex-1" />;
          const profile = entry.userId ? profiles.get(entry.userId) : undefined;
          const place = slotIndex + 1;
          return (
            <div key={entry.id} className="flex-1 flex flex-col items-center gap-1">
              {place === 1 && <Trophy className="w-5 h-5 text-amber-400 mb-0.5" />}
              <Avatar
                photoUrl={profile?.photoUrl}
                name={entry.name}
                size={PODIUM_SIZES[visualIndex]}
                ringColor={PODIUM_RING[visualIndex]}
              />
              <p className="font-display font-bold text-white text-xs text-center truncate max-w-full px-1 mt-1">
                {entry.name}
              </p>
              <p
                className="font-display font-black text-sm leading-none"
                style={{ color: PODIUM_RING[visualIndex] }}
              >
                {entry.value}
              </p>
            </div>
          );
        })}
      </div>

      <div
        className="mt-4 rounded-2xl border overflow-hidden"
        style={{ background: "rgba(255,255,255,0.045)", borderColor: "rgba(255,255,255,0.08)" }}
      >
        {entries.map((entry, idx) => {
          const profile = entry.userId ? profiles.get(entry.userId) : undefined;
          return (
            <div
              key={entry.id}
              className="flex items-center gap-3 px-4 py-3"
              style={{ borderTop: idx > 0 ? "1px solid rgba(255,255,255,0.05)" : undefined }}
              data-testid={`ranking-entry-${idx + 1}`}
            >
              <span
                className="font-display font-bold text-lg w-6 text-center shrink-0"
                style={{ color: idx < 3 ? PODIUM_RING[idx === 0 ? 1 : idx === 1 ? 0 : 2] : "rgba(255,255,255,0.4)" }}
              >
                {idx + 1}
              </span>
              <Avatar photoUrl={profile?.photoUrl} name={entry.name} size={36} />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-white text-sm truncate">{entry.name}</p>
                <p className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
                  {profile?.position ?? "—"}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-display font-bold text-white text-lg leading-none">{entry.value}</p>
                <p className="text-[10px] uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.35)" }}>
                  {valueLabel}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
