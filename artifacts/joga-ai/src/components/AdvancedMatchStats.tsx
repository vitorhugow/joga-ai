import { useMemo } from "react";
import { JogaCard } from "@/components/joga";
import {
  computePlayerMatchStats,
  type MatchEvent,
} from "@/lib/evolutionUtils";
import type { PlayerAttributes } from "@/lib/cardUtils";
import type { UserProfile } from "@/lib/userRepository";
import { getLastMatchAttributeDeltas } from "@/lib/userRepository";

type MatchPlayer = {
  id: string;
  name: string;
  position?: string;
  userId?: string;
};

type AdvancedMatchStatsProps = {
  players: MatchPlayer[];
  events: MatchEvent[];
  currentPlayer: MatchPlayer | null | undefined;
  profile: UserProfile | null | undefined;
  matchId?: string;
  communityLabel?: string;
};

const ATTR_LABELS: Record<keyof PlayerAttributes, string> = {
  ritmo: "Ritmo",
  fisico: "Físico",
  finalizacao: "Finalização",
  passe: "Passe",
  defesa: "Defesa",
  drible: "Drible",
};

function avg(nums: number[]): number {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function AdvancedMatchStats({
  players,
  events,
  currentPlayer,
  profile,
  matchId,
  communityLabel,
}: AdvancedMatchStatsProps) {
  const playerStats = useMemo(
    () =>
      players.map((p) => ({
        ...p,
        stats: computePlayerMatchStats(p.id, events),
      })),
    [players, events],
  );

  const matchAvg = useMemo(() => {
    if (!playerStats.length) return { goals: 0, assists: 0, saves: 0 };
    return {
      goals: avg(playerStats.map((p) => p.stats.goals)),
      assists: avg(playerStats.map((p) => p.stats.assists)),
      saves: avg(playerStats.map((p) => p.stats.saves)),
    };
  }, [playerStats]);

  const positionAverages = useMemo(() => {
    const byPos = new Map<string, { goals: number[]; assists: number[]; count: number }>();
    for (const p of playerStats) {
      const pos = p.position || "MEI";
      const bucket = byPos.get(pos) ?? { goals: [], assists: [], count: 0 };
      bucket.goals.push(p.stats.goals);
      bucket.assists.push(p.stats.assists);
      bucket.count += 1;
      byPos.set(pos, bucket);
    }
    return [...byPos.entries()].map(([position, data]) => ({
      position,
      players: data.count,
      goals: avg(data.goals),
      assists: avg(data.assists),
    }));
  }, [playerStats]);

  const mine = currentPlayer
    ? playerStats.find((p) => p.id === currentPlayer.id)
    : undefined;

  const season = profile?.seasonStats;
  const attrDeltas = profile && matchId ? getLastMatchAttributeDeltas(profile, matchId) : undefined;
  const attrBreakdown = attrDeltas
    ? (Object.keys(ATTR_LABELS) as (keyof PlayerAttributes)[])
        .map((key) => ({ key, label: ATTR_LABELS[key], delta: attrDeltas[key] ?? 0 }))
        .filter((row) => row.delta !== 0)
    : [];

  if (!players.length) return null;

  return (
    <div className="space-y-3">
      {mine && (
        <JogaCard variant="arena">
          <p className="text-white/35 text-[10px] font-black uppercase tracking-[0.2em]">
            Comparação com a pelada
          </p>
          <div className="mt-2 grid grid-cols-3 gap-2 text-center">
            {(
              [
                { label: "Golos", mine: mine.stats.goals, avg: matchAvg.goals },
                { label: "Assist.", mine: mine.stats.assists, avg: matchAvg.assists },
                { label: "Defesas", mine: mine.stats.saves, avg: matchAvg.saves },
              ] as const
            ).map((row) => (
              <div
                key={row.label}
                className="rounded-xl py-2 px-1"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
              >
                <p className="text-[9px] font-black uppercase text-white/40">{row.label}</p>
                <p className="font-display font-black text-white text-lg">{row.mine}</p>
                <p className="text-[10px] text-white/35">méd. {row.avg.toFixed(1)}</p>
              </div>
            ))}
          </div>
        </JogaCard>
      )}

      {positionAverages.length > 0 && (
        <JogaCard variant="arena">
          <p className="text-white/35 text-[10px] font-black uppercase tracking-[0.2em]">
            Médias por posição
          </p>
          <div className="mt-2 space-y-2">
            {positionAverages.map((row) => (
              <div key={row.position} className="flex items-center justify-between text-sm">
                <span className="text-white font-semibold">
                  {row.position} <span className="text-white/35 text-xs">({row.players})</span>
                </span>
                <span className="text-white/55 text-xs">
                  {row.goals.toFixed(1)}G · {row.assists.toFixed(1)}A
                </span>
              </div>
            ))}
          </div>
        </JogaCard>
      )}

      {season && (
        <JogaCard variant="arena">
          <p className="text-white/35 text-[10px] font-black uppercase tracking-[0.2em]">
            Acumulados {communityLabel ? `· ${communityLabel}` : "da época"}
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
            <div className="text-white/70">
              <span className="text-white/40">Jogos:</span> {season.matches}
            </div>
            <div className="text-white/70">
              <span className="text-white/40">Golos:</span> {season.goals}
            </div>
            <div className="text-white/70">
              <span className="text-white/40">Assist.:</span> {season.assists}
            </div>
            <div className="text-white/70">
              <span className="text-white/40">Nota média:</span>{" "}
              {season.averageRating != null && season.averageRating > 0
                ? season.averageRating.toFixed(1)
                : "—"}
            </div>
          </div>
        </JogaCard>
      )}

      {attrBreakdown.length > 0 && (
        <JogaCard variant="arena">
          <p className="text-white/35 text-[10px] font-black uppercase tracking-[0.2em]">
            Breakdown por atributo
          </p>
          <div className="mt-2 space-y-1.5">
            {attrBreakdown.map((row) => (
              <div key={row.key} className="flex items-center justify-between text-sm">
                <span className="text-white/75">{row.label}</span>
                <span
                  className="font-display font-black"
                  style={{ color: row.delta > 0 ? "#4ade80" : "#f87171" }}
                >
                  {row.delta > 0 ? "+" : ""}
                  {row.delta}
                </span>
              </div>
            ))}
          </div>
        </JogaCard>
      )}
    </div>
  );
}
