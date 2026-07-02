import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { loadPostMatch, isPostMatchExpired, type SavedPostMatch } from "@/lib/postMatchStorage";
import {
  saveMatchToFirestore,
  updateMatchStatus,
  loadMatchFromFirestore,
  deleteMatch,
} from "@/lib/matchRepository";
import {
  registerAuditor,
  confirmAuditor,
  submitVote,
  watchAuditors,
  watchVotes,
} from "@/lib/auditRepository";
import {
  createMatchFlowStore,
  currentMatchUserId,
  hasUserVotedInSession,
  resetMatchFlowSession,
  resolveMatchId,
} from "@/lib/matchFlowStorage";
import {
  buildEvolutionRecord,
  saveEvolutionRecord,
} from "@/lib/evolutionStorage";
import { applyMatchResultToProfile } from "@/lib/userRepository";
import { useAuth } from "@/contexts/AuthContext";
import {
  saveMatchResult,
  saveUserMatchHistory,
  hasVoteEvolutionApplied,
  hasParticipationApplied,
  loadMatchResult,
} from "@/lib/matchHistoryRepository";
import { getVotes } from "@/lib/auditRepository";
import {
  buildMatchResultPayload,
  releaseMatchRatings,
} from "@/lib/ratingsRelease";
import type { MatchVoteRecord } from "@/lib/matchFlowStorage";
import { checkAndCloseExpiredMatch } from "@/lib/matchAutoClose";
import {
  collectAllEvents,
  computePlayerGains,
  computePlayerMatchStats,
  computeTopScorers,
  computeRatingByPlayer,
  averageRatingsForPlayer,
  collectLinkedPlayerUserIds,
  isPlayerTopScorer,
  type EvolutionGain,
} from "@/lib/evolutionUtils";
import { applyAuthToMatchData } from "@/lib/matchPlayerUtils";
import { JogaButton, JogaCard, JogaEvolutionBadge, JogaHero, JogaPage } from "@/components/joga";
import { PlayerCard } from "@/components/PlayerCard";
import { EvolutionGainsSummary } from "@/components/EvolutionGainsSummary";
import { profileToPlayerCard, getLastMatchAttributeDeltas } from "@/lib/userRepository";
import {
  formatEvolutionDisplayFromProfile,
  summarizeGainsForDisplay,
} from "@/lib/evolutionDisplay";
import { useUserProfile } from "@/hooks/useUserProfile";
import { generateMatchNarrative } from "@/lib/matchNarrative";
import { exportPlayerCardPng, shareOrDownloadPng } from "@/lib/cardExportUtils";
import { toast } from "@/hooks/use-toast";
import { useJogaConfirm } from "@/hooks/useJogaConfirm";

const eventLabels: Record<string, string> = {
  golo: "Golo",
  assistencia: "Assistência",
  defesa: "Defesa/intervenção",
  falta: "Falta",
  cartao_amarelo: "Cartão amarelo",
};

function labelEvent(type: string) {
  return eventLabels[type] || type;
}

function gameKey(game: any, index: number) {
  return String(game?.id || "game-" + index);
}

function eventKey(event: any, index: number) {
  return String(event?.id || "event-" + index);
}

function normalizeTeamKey(value: any) {
  const raw = String(value || "").trim().toUpperCase();

  if (raw === "A" || raw.includes("TIME A") || raw.includes("EQUIPA A")) return "A";
  if (raw === "B" || raw.includes("TIME B") || raw.includes("EQUIPA B")) return "B";
  if (raw === "C" || raw.includes("TIME C") || raw.includes("EQUIPA C")) return "C";
  if (raw === "D" || raw.includes("TIME D") || raw.includes("EQUIPA D")) return "D";

  return "";
}

function parseGameTitleTeams(title: string) {
  const match = String(title || "").match(/^(.*?)\s+\d+\s*x\s*\d+\s+(.*?)$/i);

  if (!match) {
    return null;
  }

  const homeLabel = match[1].trim();
  const awayLabel = match[2].trim();

  return {
    homeLabel,
    awayLabel,
    homeTeam: normalizeTeamKey(homeLabel),
    awayTeam: normalizeTeamKey(awayLabel),
  };
}

function getPlayerTeam(data: any, playerId: string) {
  const player = data?.players?.find((item: any) => item.id === playerId);

  return normalizeTeamKey(
    data?.playerTeams?.[playerId] ||
      player?.team ||
      player?.teamKey ||
      player?.teamId ||
      player?.playerTeam
  );
}

function getGameTeams(game: any, data?: SavedPostMatch | null) {
  const parsed = parseGameTitleTeams(game?.title || "");
  const teamNameMap = data?.teamNames || {};

  const homeTeam =
    normalizeTeamKey(game?.homeTeam) ||
    normalizeTeamKey(game?.homeTeamKey) ||
    normalizeTeamKey(game?.activeHomeTeam) ||
    normalizeTeamKey(game?.teamA) ||
    parsed?.homeTeam ||
    "A";

  const awayTeam =
    normalizeTeamKey(game?.awayTeam) ||
    normalizeTeamKey(game?.awayTeamKey) ||
    normalizeTeamKey(game?.activeAwayTeam) ||
    normalizeTeamKey(game?.teamB) ||
    parsed?.awayTeam ||
    "B";

  return {
    homeTeam,
    awayTeam,
    homeLabel: teamNameMap[homeTeam as keyof typeof teamNameMap] || parsed?.homeLabel || `Time ${homeTeam}`,
    awayLabel: teamNameMap[awayTeam as keyof typeof teamNameMap] || parsed?.awayLabel || `Time ${awayTeam}`,
  };
}

function countGameGoals(game: any, data?: SavedPostMatch | null) {
  const { homeTeam, awayTeam, homeLabel, awayLabel } = getGameTeams(game);

  let homeGoals = 0;
  let awayGoals = 0;

  for (const event of game?.events || []) {
    if (event?.type !== "golo") continue;

    const eventTeam =
      normalizeTeamKey(event?.team) ||
      normalizeTeamKey(event?.teamKey) ||
      normalizeTeamKey(event?.playerTeam) ||
      getPlayerTeam(data, event?.playerId);

    if (eventTeam === homeTeam) {
      homeGoals += 1;
    }

    if (eventTeam === awayTeam) {
      awayGoals += 1;
    }
  }

  return { homeGoals, awayGoals, homeLabel, awayLabel };
}

function getGameScoreTitle(game: any, data?: SavedPostMatch | null) {
  const { homeGoals, awayGoals, homeLabel, awayLabel } = countGameGoals(game, data);
  return `${homeLabel} ${homeGoals} x ${awayGoals} ${awayLabel}`;
}

function getGameWinner(game: any, data?: SavedPostMatch | null) {
  const { homeGoals, awayGoals, homeLabel, awayLabel } = countGameGoals(game, data);

  if (homeGoals === awayGoals) {
    return "Empate";
  }

  return homeGoals > awayGoals ? homeLabel : awayLabel;
}


export default function PosJogo() {
  const { confirm, ConfirmDialog } = useJogaConfirm();
  useEffect(() => {
    document.body.classList.add("pos-jogo-open");
    return () => document.body.classList.remove("pos-jogo-open");
  }, []);

  const [, params] = useRoute("/partida/:id/pos-jogo");
  const { userId: authUserId } = useAuth();
  const userId = authUserId || currentMatchUserId();
  const matchId = resolveMatchId({ routeMatchId: params?.id });
  const [data, setData] = useState<SavedPostMatch | null>(() => {
    const local = loadPostMatch(matchId);
    if (!local || !authUserId) return local;
    return applyAuthToMatchData(local, authUserId);
  });

  // Hidrata dados do Firestore em background (não bloqueia render)
  // e verifica se a partida já expirou
  useEffect(() => {
    checkAndCloseExpiredMatch();
    if (!matchId || matchId === "default") return;
    loadMatchFromFirestore(matchId).then((remote) => {
      if (!remote) return;
      setData((current) => {
        const applied = authUserId ? applyAuthToMatchData(remote, authUserId) : remote;
        if (!current?.miniGames?.length) return applied;
        const currentEvents = collectAllEvents(current.miniGames).length;
        const remoteEvents = collectAllEvents(applied.miniGames ?? []).length;
        if (currentEvents > remoteEvents) {
          return { ...applied, miniGames: current.miniGames };
        }
        return applied;
      });
    });
  }, [matchId, authUserId]);

  useEffect(() => {
    if (!matchId) return;
    loadMatchResult(matchId).then((result) => {
      if (result?.ratingsReleased) setRatingsReleased(true);
    });
  }, [matchId]);

  useEffect(() => {
    if (!data || !authUserId) return;
    void hasParticipationApplied(authUserId, data.matchId).then(setParticipationApplied);
  }, [data?.matchId, authUserId]);

  useEffect(() => {
    if (!authUserId) return;
    setData((current) => (current ? applyAuthToMatchData(current, authUserId) : current));
  }, [authUserId]);

  const flow = useMemo(() => createMatchFlowStore(matchId), [matchId]);

  const [auditors, setAuditors] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState<string[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [voteMode, setVoteMode] = useState(false);
  const [gainsMode, setGainsMode] = useState(() => {
    const id = resolveMatchId({ routeMatchId: params?.id });
    return hasUserVotedInSession(currentMatchUserId(), id);
  });
  const [displayGains, setDisplayGains] = useState<EvolutionGain[] | null>(null);
  const [ratings, setRatings] = useState<Record<string, number>>(() => {
    const id = resolveMatchId({ routeMatchId: params?.id });
    return createMatchFlowStore(id).readVoteDraft();
  });
  const [selectedGameId, setSelectedGameId] = useState("");
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [selectedEventType, setSelectedEventType] = useState("golo");
  const [voteRecords, setVoteRecords] = useState<MatchVoteRecord[]>([]);
  const [ratingsReleased, setRatingsReleased] = useState(false);
  const [finalizeBusy, setFinalizeBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [, setLocation] = useLocation();
  const [participationApplied, setParticipationApplied] = useState(false);
  const { profile, refresh } = useUserProfile();
  const evolutionCardRef = useRef<HTMLDivElement>(null);
  const [shareEvolutionBusy, setShareEvolutionBusy] = useState(false);

  const expiresAt = data?.expiresAt ? new Date(data.expiresAt).getTime() : Date.now() + 24 * 60 * 60 * 1000;
  const isExpired = isPostMatchExpired(data) || Date.now() > expiresAt;
  const players: any[] = data?.players || [];
  const games: any[] = data?.miniGames || [];

  const allEvents = useMemo(() => collectAllEvents(games), [games]);
  const topScorers = useMemo(() => computeTopScorers(allEvents), [allEvents]);
  const matchNarrative = useMemo(
    () =>
      generateMatchNarrative({
        matchResult: data
          ? {
              title: data.title ?? `Pelada ${matchId}`,
              topScorers,
              players: players.map((p: { id: string; name: string; userId?: string }) => ({
                playerId: p.id,
                name: p.name,
                userId: p.userId,
                goals: 0,
                assists: 0,
                saves: 0,
                rating: 0,
              })),
            }
          : null,
        events: allEvents,
        miniGames: games,
      }),
    [data, topScorers, players, allEvents, games],
  );
  const hasVoted = hasUserVotedInSession(userId, matchId);

  const currentPlayer = useMemo(() => {
    return (
      players.find((player: any) => player.id === data?.currentPlayerId) ||
      players.find((player: any) => player.isMe) ||
      players[0]
    );
  }, [players, data]);

  const receivedRating = useMemo(() => {
    if (!ratingsReleased || !currentPlayer) return null;
    const ratingByPlayer = computeRatingByPlayer(voteRecords);
    const avg = averageRatingsForPlayer(ratingByPlayer, currentPlayer.id);
    return avg > 0 ? avg : null;
  }, [ratingsReleased, currentPlayer, voteRecords]);

  useEffect(() => {
    if (!gainsMode || !currentPlayer || displayGains) return;
    const isTopScorer = isPlayerTopScorer(topScorers, currentPlayer);
    setDisplayGains(
      computePlayerGains(currentPlayer, allEvents, {
        isTopScorer,
        hasVoted: true,
        participationApplied,
        receivedRating,
      }),
    );
  }, [
    gainsMode,
    currentPlayer,
    displayGains,
    allEvents,
    topScorers,
    participationApplied,
    receivedRating,
  ]);

  // Registo de auditor e listeners em tempo real (Firestore + localStorage fallback)
  useEffect(() => {
    if (!data || isExpired) return;

    // Registo via Firestore (com fallback localStorage)
    registerAuditor(matchId, userId).then(({ success, auditors: remoteAuditors }) => {
      if (success && remoteAuditors.length > 0) {
        setAuditors(remoteAuditors.map((a) => a.userId));
        flow.saveAuditors(remoteAuditors.map((a) => a.userId));
      } else {
        // Fallback localStorage
        const list = flow.readAuditors();
        if (!list.includes(userId) && list.length < 3) {
          const next = [...list, userId];
          flow.saveAuditors(next);
          setAuditors(next);
        } else {
          setAuditors(list);
        }
      }
    });

    setConfirmed(flow.readConfirmed());

    // Listener em tempo real para auditores
    const unsubAuditors = watchAuditors(matchId, (records) => {
      setAuditors(records.map((r) => r.userId));
      setConfirmed(
        records.filter((r) => r.confirmed).map((r) => r.userId),
      );
      flow.saveAuditors(records.map((r) => r.userId));
      flow.saveConfirmed(records.filter((r) => r.confirmed).map((r) => r.userId));
    });

    // Listener em tempo real para votos — não apagar votos locais com snapshot vazio do Firestore
    const unsubVotes = watchVotes(matchId, (remoteVotes) => {
      const merged = flow.mergeRemoteVotes(remoteVotes);
      setVoteRecords(merged);
      if (merged.some((vote) => vote.userId === userId)) {
        setGainsMode(true);
        setVoteMode(false);
      }
    });

    return () => {
      unsubAuditors();
      unsubVotes();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId, isExpired]);

  const gains = useMemo(() => {
    const isTopScorer = isPlayerTopScorer(topScorers, currentPlayer ?? { id: "" });
    return (
      displayGains ??
      computePlayerGains(currentPlayer, allEvents, {
        isTopScorer,
        hasVoted: hasVoted || gainsMode,
        participationApplied,
        receivedRating,
      })
    );
  }, [
    allEvents,
    currentPlayer,
    displayGains,
    topScorers,
    hasVoted,
    gainsMode,
    participationApplied,
    receivedRating,
  ]);

  const evolutionItems = useMemo(() => {
    const fromProfile = formatEvolutionDisplayFromProfile(profile, data?.matchId);
    if (fromProfile.length > 0) return fromProfile;
    const source = displayGains ?? gains;
    return summarizeGainsForDisplay(source);
  }, [profile, data?.matchId, displayGains, gains]);

  const matchAttributeDeltas = useMemo(
    () => getLastMatchAttributeDeltas(profile, data?.matchId),
    [profile, data?.matchId],
  );

  async function shareEvolutionCard() {
    const node = evolutionCardRef.current;
    if (!node) return;
    setShareEvolutionBusy(true);
    try {
      const blob = await exportPlayerCardPng(node);
      await shareOrDownloadPng(blob, `joga-ai-evolucao-${matchId}.png`, "Evolução Joga AI");
      toast({ title: "Evolução partilhada!" });
    } catch {
      toast({ title: "Erro ao exportar", variant: "destructive" });
    } finally {
      setShareEvolutionBusy(false);
    }
  }

  const isAuditor = auditors.includes(userId);
  const hasConfirmed = confirmed.includes(userId);
  const auditClosed = isExpired || confirmed.length >= 3;
  const mustAuditBeforeVote = isAuditor && !hasConfirmed && !auditClosed;
  const isOrganizer = Boolean(data?.organizerId && userId === data.organizerId);
  const requiredVoters = useMemo(
    () => collectLinkedPlayerUserIds(players, data?.organizerId),
    [players, data?.organizerId],
  );
  const votedUserIds = useMemo(() => {
    const ids = new Set<string>(data?.votedUserIds ?? []);
    voteRecords.forEach((vote) => ids.add(vote.userId));
    return [...ids];
  }, [data?.votedUserIds, voteRecords]);
  const allVoted =
    requiredVoters.length === 0 ||
    requiredVoters.every((uid) => votedUserIds.includes(uid));

  async function persistMatchResultAndMaybeReleaseRatings(
    reason: "all_voted" | "organizer",
  ) {
    if (!data) return;

    const votes = await getVotes(matchId);
    const completedAt = new Date().toISOString();
    const payload = await buildMatchResultPayload({
      matchId: data.matchId,
      title: data.title ?? `Pelada ${data.matchId}`,
      completedAt,
      communityId: data.communityId,
      organizerId: data.organizerId,
      teamNames: data.teamNames,
      players,
      events: allEvents,
      votes,
    });

    await saveMatchResult(payload);
    await releaseMatchRatings(data.matchId, reason);
    await updateMatchStatus(data.matchId, "concluida");
    setRatingsReleased(true);
    updateData({ ...data, status: "concluida", votedUserIds });
  }

  async function handleOrganizerFinalizeVoting() {
    if (!data || !isOrganizer || ratingsReleased || finalizeBusy) return;
    const ok = await confirm("Finalizar a votação agora e publicar as notas com os votos actuais?");
    if (!ok) return;

    setFinalizeBusy(true);
    try {
      await persistMatchResultAndMaybeReleaseRatings("organizer");
    } catch (err) {
      console.warn("[PosJogo] finalize voting:", err);
    } finally {
      setFinalizeBusy(false);
    }
  }

  async function handleDeleteMatch() {
    if (!data || !isOrganizer || deleteBusy || !userId) return;
    const ok = await confirm({
      title: "Excluir pelada",
      description:
        "Remove esta pelada e reverte todos os ganhos de atributos e estatísticas para todos os jogadores.",
      confirmLabel: "Excluir",
      destructive: true,
    });
    if (!ok) return;

    setDeleteBusy(true);
    try {
      await deleteMatch(data.matchId, userId);
      resetMatchFlowSession(matchId);
      setLocation("/jogos");
    } catch (err) {
      console.warn("[PosJogo] delete match:", err);
      toast({ title: "Não foi possível excluir a pelada.", variant: "destructive" });
    } finally {
      setDeleteBusy(false);
    }
  }

  function updateData(updated: SavedPostMatch) {
    setData(updated);
    saveMatchToFirestore(updated.matchId, updated).catch(console.warn);
  }

  function confirmStats() {
    if (!isAuditor || hasConfirmed) return;

    const next = [...confirmed, userId].slice(0, 3);
    setConfirmed(next);
    flow.saveConfirmed(next);

    // Escreve confirmação no Firestore
    confirmAuditor(matchId, userId).catch(console.warn);

    if (next.length >= 3 && data) {
      updateData({ ...data, status: "auditada" });
      updateMatchStatus(data.matchId, "auditada").catch(console.warn);
    }

    setEditMode(false);
    setVoteMode(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function removeEvent(gameId: string, eventId: string) {
    if (!data) return;

    const updated = {
      ...data,
      miniGames: games.map((game: any, gameIndex: number) => {
        if (gameKey(game, gameIndex) !== gameId) return game;

        return {
          ...game,
          events: (game.events || []).filter((event: any, eventIndex: number) => eventKey(event, eventIndex) !== eventId),
        };
      }),
    };

    updateData(updated);
  }

  function addSelectedEvent() {
    if (!data || players.length === 0 || games.length === 0) return;

    const gameId = selectedGameId || gameKey(games[0], 0);
    const playerId = selectedPlayerId || players[0]?.id;

    const player = players.find((item: any) => item.id === playerId);
    const game = games.find((item: any, index: number) => gameKey(item, index) === gameId);

    if (!player || !game) return;

    const newEvent = {
      id: "event-edit-" + Date.now(),
      type: selectedEventType,
      playerId: player.id,
      playerName: player.name,
      team: getPlayerTeam(data, player.id) || data.playerTeams?.[player.id] || "BENCH",
      time: "Pós-jogo",
    };

    const updated = {
      ...data,
      miniGames: games.map((item: any, index: number) => {
        if (gameKey(item, index) !== gameId) return item;

        return {
          ...item,
          events: [...(item.events || []), newEvent],
        };
      }),
    };

    updateData(updated);
  }

  function setPlayerRating(playerId: string, value: number) {
    const next = { ...ratings, [playerId]: value };
    setRatings(next);
    flow.saveVoteDraft(next);
  }

  function saveVote() {
    if (!data || !currentPlayer) return;

    if (hasUserVotedInSession(userId, matchId)) {
      setVoteMode(false);
      setGainsMode(true);
      return;
    }

    const missing = players.some(
      (player: { id: string }) => ratings[player.id] === undefined || ratings[player.id] < 1,
    );

    if (missing) {
      toast({
        title: "Faltam notas",
        description: "Dá nota de 1 a 10 para todos os jogadores antes de concluir.",
        variant: "destructive",
      });
      return;
    }

    const voteRecord = { userId, ratings, createdAt: new Date().toISOString() };
    flow.upsertVote(voteRecord);
    submitVote(matchId, voteRecord).catch(console.warn);

    const nextVotedUserIds = [...new Set([...(data.votedUserIds ?? []), userId])];
    const nextAllVoted =
      requiredVoters.length === 0 ||
      requiredVoters.every((uid) => nextVotedUserIds.includes(uid));
    const nextStatus = nextAllVoted ? "concluida" : data.status ?? "auditada";

    updateData({ ...data, votedUserIds: nextVotedUserIds, status: nextStatus });

    if (nextAllVoted) {
      updateMatchStatus(data.matchId, "concluida").catch(console.warn);
    }

    setVoteMode(false);
    setGainsMode(true);
    window.scrollTo({ top: 0, behavior: "smooth" });

    void (async () => {
      const stats = computePlayerMatchStats(currentPlayer.id, allEvents);
      const isTopScorer = isPlayerTopScorer(topScorers, currentPlayer);
      const gainsWithEvents = computePlayerGains(currentPlayer, allEvents, {
        isTopScorer,
        hasVoted: true,
        participationApplied: true,
      });
      setDisplayGains(gainsWithEvents);

      const alreadyVoted = await hasVoteEvolutionApplied(userId, data.matchId);
      if (!alreadyVoted) {
        const record = buildEvolutionRecord({
          matchId,
          player: { id: currentPlayer.id, name: currentPlayer.name },
          gains: gainsWithEvents,
          stats: {
            ...stats,
            miniGames: games.length,
          },
          topScorers,
          miniGames: games,
        });

        saveEvolutionRecord(record, userId);

        await applyMatchResultToProfile(userId, {
          matchId: data.matchId,
          goals: stats.goals,
          assists: stats.assists,
          saves: stats.saves,
          fouls: stats.fouls,
          yellowCards: stats.cards,
          mvp: false,
          deferRating: true,
          position: currentPlayer.position,
          voted: true,
          isTopScorer,
        });

        await saveUserMatchHistory(userId, {
          matchId: data.matchId,
          title: data.title ?? `Pelada ${data.matchId}`,
          date: new Date().toISOString(),
          rating: 0,
          ratingPending: true,
          ratingReleased: false,
          goals: stats.goals,
          assists: stats.assists,
          communityId: data.communityId,
          participationApplied: true,
          voteEvolutionApplied: true,
        });
      }

      await refresh();

      if (!nextAllVoted) return;

      await persistMatchResultAndMaybeReleaseRatings("all_voted");
    })();
  }

  if (!data) {
    return (
      <JogaPage theme="dark" className="py-6">
        <JogaCard variant="arena" padding="lg" className="text-center">
          <h1 className="font-display font-black text-white text-2xl">Resumo da Pelada</h1>
          <p className="text-white/45 text-sm mt-2">Nenhuma pelada pendente encontrada.</p>
          <div className="mt-4 space-y-2">
            <Link href="/jogos" className="block">
              <JogaButton variant="primary" size="md">Ver jogos</JogaButton>
            </Link>
            <Link href="/perfil/evolucao" className="block">
              <JogaButton variant="ghost" size="md">Ver evolução no Perfil</JogaButton>
            </Link>
          </div>
        </JogaCard>
      </JogaPage>
    );
  }

  if (gainsMode) {
    return (
      <JogaPage theme="dark" className="py-6">
        <JogaHero theme="arena" className="p-5 text-center">
          <JogaEvolutionBadge />
          <p className="text-emerald-300 text-[10px] font-black uppercase tracking-[0.22em]">Evolução registrada</p>
          <h1 className="font-display font-black text-white text-3xl mt-2">Atributos ganhos</h1>
          <p className="text-white/55 text-sm mt-2">
            {currentPlayer?.name || "Jogador"}, estes ganhos já entram no perfil.
            A nota dos colegas sai quando todos votarem, o organizador finalizar, ou 24h após o fim.
          </p>
        </JogaHero>

        <div className="mt-4">
          <EvolutionGainsSummary items={evolutionItems} />
        </div>

        <div
          ref={evolutionCardRef}
          className="fixed left-0 top-0 -z-50 opacity-0 pointer-events-none w-[340px]"
          aria-hidden
        >
          {profile.profileComplete && (
            <PlayerCard
              {...profileToPlayerCard(profile)}
              size="profile"
              attributeDeltas={matchAttributeDeltas}
            />
          )}
        </div>

        <JogaButton
          variant="primary"
          size="lg"
          className="mt-4"
          disabled={shareEvolutionBusy || !profile.profileComplete}
          onClick={() => void shareEvolutionCard()}
        >
          Partilhar evolução
        </JogaButton>

        <JogaButton
          variant="gold"
          size="lg"
          className="mt-2"
          onClick={() => {
            window.location.href = "/perfil/evolucao";
          }}
        >
          Ver no Perfil
        </JogaButton>
        <Link href="/" className="block mt-2">
          <JogaButton variant="ghost" size="md">
            Ir para Home
          </JogaButton>
        </Link>
      </JogaPage>
    );
  }

  if (voteMode) {
    return (
      <JogaPage theme="dark" className="py-6">
        <JogaHero theme="arena" className="p-5">
          <p className="text-white/45 text-[10px] font-black uppercase tracking-[0.22em]">Votação Pendente</p>
          <h1 className="font-display font-black text-white text-3xl mt-2">Votar nos jogadores</h1>
          <p className="text-white/55 text-sm mt-2">Toca nas estrelas. A 10ª estrela é vermelha e representa atuação absurda.</p>
        </JogaHero>

        <div className="mt-4 space-y-3">
          {players.map((player: any) => {
            const rating = ratings[player.id];

            return (
              <JogaCard key={player.id} variant="arena">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-display font-black text-white text-lg">{player.name}</p>
                    <p className="text-white/35 text-xs">{player.position} · OVER {player.overall || 50}</p>
                  </div>
                  <p className="text-amber-300 font-display font-black text-2xl">{rating ?? "—"}/10</p>
                </div>

                <div className="grid grid-cols-10 gap-1.5 mt-4">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((star) => {
                    const active = rating !== undefined && rating >= star;
                    const isTen = star === 10;
                    const activeColor = isTen ? "#ef4444" : "#fbbf24";
                    const glow = isTen ? "0 0 16px rgba(239,68,68,0.85)" : "0 0 16px rgba(251,191,36,0.65)";
                    const idleColor = isTen ? "rgba(239,68,68,0.42)" : "rgba(255,255,255,0.18)";
                    const idleBorder = isTen ? "1px solid rgba(239,68,68,0.22)" : "1px solid rgba(255,255,255,0.06)";

                    return (
                      <button
                        key={star}
                        onClick={() => setPlayerRating(player.id, star)}
                        className="rounded-xl py-2 text-lg font-black transition-transform active:scale-90 cursor-pointer hover:scale-105"
                        style={{
                          background: active ? (isTen ? "rgba(239,68,68,0.12)" : "rgba(251,191,36,0.10)") : "rgba(255,255,255,0.035)",
                          color: active ? activeColor : idleColor,
                          border: active ? (isTen ? "1px solid rgba(239,68,68,0.35)" : "1px solid rgba(251,191,36,0.24)") : idleBorder,
                          textShadow: active ? glow : "none",
                          boxShadow: active ? glow : "none",
                        }}
                      >
                        ★
                      </button>
                    );
                  })}
                </div>

                <div className="flex justify-between mt-2 text-[10px] font-black uppercase">
                  <span className="text-white/30">1 estrela</span>
                  <span style={{ color: "#ef4444", textShadow: "0 0 10px rgba(239,68,68,0.65)" }}>10 estrelas</span>
                </div>
              </JogaCard>
            );
          })}
        </div>

        <section className="mt-4 space-y-3">
          <JogaButton variant="gold" size="lg" onClick={saveVote}>
            Concluir votação
          </JogaButton>

          <JogaButton variant="ghost" onClick={() => setVoteMode(false)}>
            Voltar ao resumo
          </JogaButton>
        </section>
      </JogaPage>
    );
  }

  return (
    <JogaPage theme="dark" className="py-6">
      <JogaHero theme="arena" className="p-5">
        <p className="text-white/45 text-[10px] font-black uppercase tracking-[0.22em]">Resumo</p>
        <h1 className="font-display font-black text-white text-3xl mt-2">Resumo da Pelada</h1>
        <p className="text-white/55 text-sm mt-2">
          Confere o que aconteceu antes de votar. As notas saem quando todos votam, o organizador finaliza, ou após 24h.
        </p>
      </JogaHero>

      {matchNarrative && (
        <section
          className="mt-4 rounded-3xl p-4"
          style={{ background: "rgba(74,222,128,0.06)", border: "1px solid rgba(74,222,128,0.18)" }}
          data-testid="match-narrative"
        >
          <p className="text-emerald-300/80 text-[10px] font-black uppercase tracking-[0.2em]">Relato</p>
          <p className="text-white/75 text-sm mt-2 leading-relaxed">{matchNarrative}</p>
        </section>
      )}

      {mustAuditBeforeVote && (
        <section className="mt-4 rounded-3xl p-4" style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.22)" }}>
          <p className="text-amber-300 text-[10px] font-black uppercase tracking-[0.2em]">Auditoria obrigatória</p>
          <h2 className="font-display font-black text-white text-xl mt-1">Confirma ou altera os dados</h2>
          <p className="text-white/45 text-xs mt-1">
            Tu és um dos 3 primeiros a abrir o resumo. Antes de votar, precisas confirmar ou corrigir as estatísticas.
          </p>
        </section>
      )}

      <div className="grid grid-cols-3 gap-2 mt-4">
        <div className="rounded-2xl py-3 text-center" style={{ background: "rgba(74,222,128,0.12)", border: "1px solid rgba(74,222,128,0.25)" }}>
          <p className="font-display font-black text-white text-xl">{games.length}</p>
          <p className="text-[9px] font-black uppercase text-emerald-300">Jogos</p>
        </div>

        <div className="rounded-2xl py-3 text-center" style={{ background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.25)" }}>
          <p className="font-display font-black text-white text-xl">{confirmed.length}/3</p>
          <p className="text-[9px] font-black uppercase text-amber-300">Auditoria</p>
        </div>

        <div className="rounded-2xl py-3 text-center" style={{ background: "rgba(96,165,250,0.12)", border: "1px solid rgba(96,165,250,0.25)" }}>
          <p className="font-display font-black text-white text-xl">{players.length}</p>
          <p className="text-[9px] font-black uppercase text-blue-300">Jogadores</p>
        </div>
      </div>

      {topScorers.length > 0 && (
        <section className="mt-4 rounded-3xl p-4" style={{ background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.20)" }}>
          <p className="text-white/35 text-[10px] font-black uppercase">
            {topScorers.length > 1 ? "Artilheiros do dia" : "Artilheiro do dia"}
          </p>

          <div className="mt-2 space-y-2">
            {topScorers.map((scorer) => (
              <div key={scorer.name} className="flex items-center justify-between">
                <p className="font-display font-black text-white text-lg">{scorer.name}</p>
                <p className="text-emerald-300 font-black">{scorer.goals} golos</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {isOrganizer && (
        <section
          className="mt-4 rounded-3xl p-4"
          style={{ background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.22)" }}
          data-testid="organizer-voting-panel"
        >
          <p className="text-blue-200/70 text-[10px] font-black uppercase tracking-[0.2em]">Admin da pelada</p>
          <h2 className="font-display font-black text-white text-xl mt-1">Estado da votação</h2>
          <p className="text-white/45 text-xs mt-1">
            {votedUserIds.length}/{requiredVoters.length || players.length} jogadores com conta já votaram
            {ratingsReleased ? " · Notas publicadas" : ""}
          </p>

          <div className="mt-3 space-y-2">
            {players
              .filter((player: { userId?: string; id: string }) =>
                player.userId || player.id === data.organizerId,
              )
              .map((player: { id: string; name: string; userId?: string }) => {
                const voterId = player.userId ?? (player.id === data.organizerId ? data.organizerId : "");
                const voted = voterId ? votedUserIds.includes(voterId) : false;
                return (
                  <div
                    key={player.id}
                    className="flex items-center justify-between rounded-2xl px-3 py-2"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
                  >
                    <span className="text-white text-sm font-semibold">{player.name}</span>
                    <span
                      className="text-xs font-black px-2 py-1 rounded-full"
                      style={
                        voted
                          ? { background: "rgba(74,222,128,0.15)", color: "#4ade80" }
                          : { background: "rgba(251,191,36,0.12)", color: "#fbbf24" }
                      }
                    >
                      {voted ? "Votou" : "Pendente"}
                    </span>
                  </div>
                );
              })}
          </div>

          {!ratingsReleased && (
            <JogaButton
              variant="primary"
              size="md"
              className="w-full mt-4"
              disabled={finalizeBusy || votedUserIds.length === 0}
              onClick={() => void handleOrganizerFinalizeVoting()}
            >
              {finalizeBusy ? "A finalizar…" : "Finalizar votação e publicar notas"}
            </JogaButton>
          )}
          {!ratingsReleased && votedUserIds.length === 0 && (
            <p className="text-white/35 text-xs mt-2 text-center">
              Precisa de pelo menos 1 voto para finalizar manualmente.
            </p>
          )}
          {allVoted && !ratingsReleased && (
            <p className="text-emerald-300 text-xs mt-2 text-center font-semibold">
              Todos votaram — as notas serão publicadas automaticamente.
            </p>
          )}

          <JogaButton
            variant="danger"
            size="md"
            className="w-full mt-4"
            disabled={deleteBusy}
            onClick={() => void handleDeleteMatch()}
            data-testid="organizer-delete-match"
          >
            {deleteBusy ? "A excluir…" : "Excluir pelada e reverter estatísticas"}
          </JogaButton>
        </section>
      )}

      <section className="mt-4 space-y-3">
        {games.map((game: any, index: number) => (
          <div key={gameKey(game, index)} className="rounded-3xl p-4" style={{ background: "rgba(255,255,255,0.045)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <p className="text-white/35 text-[10px] font-black uppercase tracking-[0.2em]">Jogo {index + 1}</p>
            <h2 className="font-display font-black text-white text-xl mt-1">
              {getGameScoreTitle(game, data)}
            </h2>
            <p className="text-white/45 text-xs mt-1">Vencedor: {getGameWinner(game, data)}</p>

            <div className="mt-3 space-y-2">
              {(game.events || []).length === 0 ? (
                <p className="text-white/35 text-sm">Nenhum evento registrado neste jogo.</p>
              ) : (
                (game.events || []).map((event: any, eventIndex: number) => (
                  <div key={eventKey(event, eventIndex)} className="rounded-2xl px-3 py-3 flex items-center justify-between gap-3" style={{ background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <div className="min-w-0">
                      <p className="text-white font-black truncate">{event.playerName}</p>
                      <p className="text-white/35 text-xs">{event.time} · {labelEvent(event.type)}</p>
                    </div>

                    {editMode && mustAuditBeforeVote && (
                      <button
                        onClick={() => removeEvent(gameKey(game, index), eventKey(event, eventIndex))}
                        className="rounded-xl px-3 py-2 text-xs font-black"
                        style={{ background: "rgba(239,68,68,0.12)", color: "#fca5a5", border: "1px solid rgba(239,68,68,0.25)" }}
                      >
                        Excluir
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        ))}
      </section>

      {editMode && mustAuditBeforeVote && (
        <section className="mt-4 rounded-3xl p-4" style={{ background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.20)" }}>
          <p className="text-blue-200/70 text-[10px] font-black uppercase tracking-[0.2em]">Alterar dados</p>
          <h2 className="font-display font-black text-white text-xl mt-1">Adicionar estatística</h2>

          <div className="grid gap-2 mt-3">
            <select
              value={selectedGameId || gameKey(games[0], 0) || ""}
              onChange={(event) => setSelectedGameId(event.target.value)}
              className="rounded-2xl px-3 py-3 text-sm font-black"
              style={{ background: "rgba(255,255,255,0.08)", color: "white", border: "1px solid rgba(255,255,255,0.10)" }}
            >
              {games.map((game: any, index: number) => (
                <option key={gameKey(game, index)} value={gameKey(game, index)}>
                  Jogo {index + 1} · {getGameScoreTitle(game, data)}
                </option>
              ))}
            </select>

            <select
              value={selectedPlayerId || players[0]?.id || ""}
              onChange={(event) => setSelectedPlayerId(event.target.value)}
              className="rounded-2xl px-3 py-3 text-sm font-black"
              style={{ background: "rgba(255,255,255,0.08)", color: "white", border: "1px solid rgba(255,255,255,0.10)" }}
            >
              {players.map((player: any) => (
                <option key={player.id} value={player.id}>{player.name} · {player.position}</option>
              ))}
            </select>

            <select
              value={selectedEventType}
              onChange={(event) => setSelectedEventType(event.target.value)}
              className="rounded-2xl px-3 py-3 text-sm font-black"
              style={{ background: "rgba(255,255,255,0.08)", color: "white", border: "1px solid rgba(255,255,255,0.10)" }}
            >
              <option value="golo">Golo</option>
              <option value="assistencia">Assistência</option>
              <option value="defesa">Defesa/intervenção</option>
              <option value="falta">Falta</option>
              <option value="cartao_amarelo">Cartão amarelo</option>
            </select>

            <button
              onClick={addSelectedEvent}
              className="rounded-2xl py-3 font-display font-black"
              style={{ background: "rgba(96,165,250,0.18)", color: "#bfdbfe", border: "1px solid rgba(96,165,250,0.30)" }}
            >
              Adicionar estatística
            </button>

            <button
              onClick={confirmStats}
              className="rounded-2xl py-3 font-display font-black"
              style={{ background: "rgba(74,222,128,0.16)", color: "#86efac", border: "1px solid rgba(74,222,128,0.30)" }}
            >
              Salvar alterações e ir para votação
            </button>
          </div>
        </section>
      )}

      <section className="mt-4 space-y-3">
        {mustAuditBeforeVote ? (
          <div className="grid grid-cols-2 gap-2">
            <JogaButton variant="outline" onClick={confirmStats}>
              Confirmar estatísticas
            </JogaButton>

            <JogaButton variant="arena" onClick={() => setEditMode((current) => !current)}>
              {editMode ? "Fechar edição" : "Alterar dados"}
            </JogaButton>
          </div>
        ) : hasVoted ? (
          <JogaButton variant="gold" size="lg" onClick={() => setGainsMode(true)}>
            Ver evolução desta pelada
          </JogaButton>
        ) : (
          <JogaButton variant="gold" size="lg" onClick={() => setVoteMode(true)}>
            Ir para votação
          </JogaButton>
        )}
      </section>
      {ConfirmDialog}
    </JogaPage>
  );
}
