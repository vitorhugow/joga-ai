/**
 * Apelidos automáticos pós-pelada — exclusivo PRO Jogador.
 * Dispara quando as notas são publicadas (summary/result ratingsReleased).
 */

import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { hasPlayerProEntitlements } from "./entitlementsUtils";

const REGION = "europe-west1";

const POSITIVE_ROTATION = ["Espírito de Equipa", "Presença de Ouro", "Sempre Presente"] as const;

type SummaryPlayer = {
  userId?: string;
  playerId?: string;
  name?: string;
  goals?: number;
  assists?: number;
  saves?: number;
  rating?: number;
};

type PlayerContext = {
  userId: string;
  goals: number;
  assists: number;
  saves: number;
  rating: number;
  position: string;
  team: string;
  goalsConceded: number;
};

function stableIndex(seed: string, length: number): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return length > 0 ? hash % length : 0;
}

function pickUniqueWinner(
  players: PlayerContext[],
  score: (p: PlayerContext) => number,
  minScore = 1,
): string | null {
  const eligible = players.filter((p) => score(p) >= minScore);
  if (!eligible.length) return null;
  const top = Math.max(...eligible.map(score));
  const tied = eligible
    .filter((p) => score(p) === top)
    .sort((a, b) => a.userId.localeCompare(b.userId));
  return tied[0]?.userId ?? null;
}

function computeGoalsConcededByTeam(
  players: PlayerContext[],
): Map<string, number> {
  const goalsByTeam = new Map<string, number>();
  for (const p of players) {
    goalsByTeam.set(p.team, (goalsByTeam.get(p.team) ?? 0) + p.goals);
  }

  const conceded = new Map<string, number>();
  const teams = [...new Set(players.map((p) => p.team))];
  for (const team of teams) {
    let against = 0;
    for (const [t, g] of goalsByTeam) {
      if (t !== team) against += g;
    }
    conceded.set(team, against);
  }
  return conceded;
}

function computeNickname(
  player: PlayerContext,
  all: PlayerContext[],
  matchId: string,
): string {
  const artilheiroId = pickUniqueWinner(all, (p) => p.goals);
  if (artilheiroId === player.userId) return "Artilheiro";

  const maestroId = pickUniqueWinner(all, (p) => p.assists);
  if (maestroId === player.userId) return "O Maestro";

  const gks = all.filter((p) => p.position === "GR");
  if (gks.length > 0 && player.position === "GR" && player.saves > 0) {
    const minConceded = Math.min(...gks.map((g) => g.goalsConceded));
    const paredaoCandidates = gks
      .filter((g) => g.goalsConceded === minConceded && g.saves > 0)
      .sort((a, b) => a.userId.localeCompare(b.userId));
    if (
      paredaoCandidates[0]?.userId === player.userId &&
      player.goalsConceded <= 3
    ) {
      return "O Paredão";
    }
  }

  const craqueId = pickUniqueWinner(all, (p) => p.rating, 0.1);
  if (craqueId === player.userId && player.rating > 0) {
    return "Craque do Jogo";
  }

  const topRating = Math.max(...all.map((p) => p.rating));
  if (player.rating >= 7 && player.rating > 0 && player.rating < topRating) {
    return "Craque da Pelada";
  }

  return POSITIVE_ROTATION[stableIndex(`${player.userId}:${matchId}`, POSITIVE_ROTATION.length)];
}

function nicknameEmoji(label: string): string {
  switch (label) {
    case "Artilheiro":
      return "⚽";
    case "O Maestro":
      return "🎼";
    case "O Paredão":
      return "🧤";
    case "Craque do Jogo":
      return "⭐";
    case "Craque da Pelada":
      return "🏅";
    case "Espírito de Equipa":
      return "🤝";
    case "Presença de Ouro":
      return "✨";
    case "Sempre Presente":
      return "👟";
    default:
      return "⚽";
  }
}

export const onMatchRatingsReleasedNicknames = onDocumentUpdated(
  { document: "matches/{matchId}/summary/result", region: REGION },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!after?.ratingsReleased) return;
    if (before?.ratingsReleased === true) return;

    const matchId = event.params.matchId;
    const db = getFirestore();
    const earnedAt =
      typeof after.ratingsReleasedAt === "string"
        ? after.ratingsReleasedAt
        : new Date().toISOString();

    const summaryPlayers: SummaryPlayer[] = Array.isArray(after.players)
      ? after.players
      : [];

    const linked = summaryPlayers
      .map((p) => ({
        userId: p.userId ? String(p.userId) : "",
        playerId: String(p.playerId ?? ""),
        goals: Number(p.goals ?? 0),
        assists: Number(p.assists ?? 0),
        saves: Number(p.saves ?? 0),
        rating: Number(p.rating ?? 0),
      }))
      .filter((p) => p.userId);

    if (!linked.length) return;

    const matchSnap = await db.doc(`matches/${matchId}`).get();
    const matchData = matchSnap.data() ?? {};
    const playerTeams: Record<string, string> =
      matchData.playerTeams && typeof matchData.playerTeams === "object"
        ? (matchData.playerTeams as Record<string, string>)
        : {};

    const rosterPlayers: Array<{ id?: string; userId?: string }> = Array.isArray(
      matchData.players,
    )
      ? matchData.players
      : [];

    const contexts: PlayerContext[] = [];

    for (const p of linked) {
      const roster = rosterPlayers.find(
        (r) => r.userId === p.userId || r.id === p.playerId,
      );
      const rosterId = roster?.id ?? p.playerId ?? p.userId;
      const team = playerTeams[rosterId] ?? playerTeams[p.userId] ?? "BENCH";

      let position = "MEI";
      try {
        const userSnap = await db.doc(`users/${p.userId}`).get();
        position = String(userSnap.data()?.position ?? "MEI");
      } catch {
        /* fallback */
      }

      contexts.push({
        userId: p.userId,
        goals: p.goals,
        assists: p.assists,
        saves: p.saves,
        rating: p.rating,
        position,
        team: team === "BENCH" ? "A" : team,
        goalsConceded: 0,
      });
    }

    const concededByTeam = computeGoalsConcededByTeam(contexts);
    for (const ctx of contexts) {
      ctx.goalsConceded = concededByTeam.get(ctx.team) ?? 0;
    }

    await Promise.allSettled(
      contexts.map(async (ctx) => {
        const userRef = db.doc(`users/${ctx.userId}`);
        const userSnap = await userRef.get();
        const entitlements = userSnap.data()?.entitlements as
          | Record<string, unknown>
          | undefined;

        if (!hasPlayerProEntitlements(entitlements)) return;

        const label = computeNickname(ctx, contexts, matchId);
        await userRef.set(
          {
            lastMatchNickname: {
              label,
              emoji: nicknameEmoji(label),
              matchId,
              earnedAt,
            },
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      }),
    );
  },
);
