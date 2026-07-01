import { JogaCard } from "@/components/joga";
import { PlayerMiniCard } from "@/components/PlayerMiniCard";
import type { CommunityPlayerStats, CommunityRivalry } from "@/lib/communityStatsRepository";

type CommunityDuelProps = {
  playerA: CommunityPlayerStats;
  playerB: CommunityPlayerStats;
};

function StatRow({ label, a, b }: { label: string; a: number | string; b: number | string }) {
  return (
    <div className="grid grid-cols-3 items-center gap-2 py-2 border-b border-white/6 last:border-0">
      <p className="text-right font-display font-black text-emerald-300 text-lg">{a}</p>
      <p className="text-center text-[10px] font-bold uppercase tracking-wider text-white/35">{label}</p>
      <p className="text-left font-display font-black text-blue-300 text-lg">{b}</p>
    </div>
  );
}

export function CommunityDuel({ playerA, playerB }: CommunityDuelProps) {
  return (
    <JogaCard variant="arena" padding="md" data-testid="community-duel">
      <div className="grid grid-cols-2 gap-3 mb-4">
        <PlayerMiniCard
          name={playerA.name}
          position="JOG"
          overall={Math.round(playerA.avgRating * 10) || 50}
          subtitle={`${playerA.goals} golos`}
        />
        <PlayerMiniCard
          name={playerB.name}
          position="JOG"
          overall={Math.round(playerB.avgRating * 10) || 50}
          subtitle={`${playerB.goals} golos`}
        />
      </div>

      <StatRow label="Golos" a={playerA.goals} b={playerB.goals} />
      <StatRow label="Assist." a={playerA.assists} b={playerB.assists} />
      <StatRow label="Jogos" a={playerA.matches} b={playerB.matches} />
      <StatRow label="MVP" a={playerA.mvpCount} b={playerB.mvpCount} />
      <StatRow
        label="Nota"
        a={playerA.avgRating > 0 ? playerA.avgRating.toFixed(1) : "—"}
        b={playerB.avgRating > 0 ? playerB.avgRating.toFixed(1) : "—"}
      />
    </JogaCard>
  );
}

export function RivalryCard({ rivalry, currentUserId }: { rivalry: CommunityRivalry; currentUserId?: string }) {
  const isA = currentUserId === rivalry.userIdA;
  const myGoals = isA ? rivalry.goalsA : rivalry.goalsB;
  const theirGoals = isA ? rivalry.goalsB : rivalry.goalsA;
  const opponent = isA ? rivalry.nameB : rivalry.nameA;
  const leading = myGoals > theirGoals ? "Tu" : theirGoals > myGoals ? opponent : "Empate";

  return (
    <JogaCard variant="arena" padding="md">
      <p className="text-white/35 text-[10px] font-black uppercase tracking-wider">Rivalidade</p>
      <p className="font-display font-black text-white text-lg mt-1">
        Tu vs {opponent}
      </p>
      <p className="text-white/50 text-xs mt-1">
        {rivalry.matchesTogether} jogos juntos · {myGoals}-{theirGoals} em golos
      </p>
      <p className="text-emerald-300 text-sm font-bold mt-2">
        {leading === "Empate" ? "Equilibrado" : `${leading} à frente`}
      </p>
    </JogaCard>
  );
}
