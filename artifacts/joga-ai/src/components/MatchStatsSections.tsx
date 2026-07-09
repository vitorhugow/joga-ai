import { useMemo } from "react";
import { hasPlayerPro } from "@/lib/entitlements";
import { computePlayerMatchStats, type MatchEvent } from "@/lib/evolutionUtils";
import type { UserProfile } from "@/lib/userRepository";
import { MatchPlayerRecap } from "@/components/MatchPlayerRecap";
import { AdvancedMatchStats } from "@/components/AdvancedMatchStats";
import { ProLockedOverlay } from "@/components/ProLockedOverlay";

type MatchStatsSectionsProps = {
  players: Array<{ id: string; name: string; position?: string; userId?: string }>;
  events: MatchEvent[];
  currentPlayer: { id: string; name: string; position?: string } | null | undefined;
  profile: UserProfile | null | undefined;
  matchId?: string;
  receivedRating?: number | null;
};

export function MatchStatsSections({
  players,
  events,
  currentPlayer,
  profile,
  matchId,
  receivedRating = null,
}: MatchStatsSectionsProps) {
  const playerPro = hasPlayerPro(profile?.entitlements);

  const ownStats = useMemo(
    () => (currentPlayer ? computePlayerMatchStats(currentPlayer.id, events) : null),
    [currentPlayer, events],
  );

  if (!currentPlayer || !ownStats) return null;

  const advanced = (
    <AdvancedMatchStats
      players={players}
      events={events}
      currentPlayer={currentPlayer}
      profile={profile}
      matchId={matchId}
    />
  );

  return (
    <section className="mt-4 space-y-3" data-testid="match-stats-sections">
      <MatchPlayerRecap
        playerName={currentPlayer.name}
        goals={ownStats.goals}
        assists={ownStats.assists}
        saves={ownStats.saves}
        rating={receivedRating}
      />

      {playerPro ? (
        advanced
      ) : (
        <ProLockedOverlay
          feature="advanced_match_stats"
          title="Estatísticas avançadas"
          subtitle="Compara-te com a média da pelada e vê os teus acumulados."
        >
          {advanced}
        </ProLockedOverlay>
      )}
    </section>
  );
}
