import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { loadPostMatch, isPostMatchExpired, type SavedPostMatch } from "@/lib/postMatchStorage";
import {
  saveMatchToFirestore,
  updateMatchStatus,
  loadMatchFromFirestore,
  deleteMatch,
  markUserVoted,
  subscribeMatchStatus,
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
import { markNotificationRead } from "@/lib/notificationsRepository";
import { loadCommunity } from "@/lib/communityRepository";
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
import { trackEvent } from "@/lib/analytics";
import { useJogaConfirm } from "@/hooks/useJogaConfirm";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { SponsorSlot } from "@/components/SponsorSlot";
import { generateResultImage } from "@/lib/resultImage";
import { useMatchPhaseGuard } from "@/hooks/useMatchPhaseGuard";

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
  useMatchPhaseGuard(matchId, "pos-jogo");
  const [data, setData] = useState<SavedPostMatch | null>(() => {
    const local = loadPostMatch(matchId);
    if (!local || !authUserId) return local;
    return applyAuthToMatchData(local, authUserId);
  });
  useDocumentTitle(data?.title || "Pós-jogo");

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

  // Escuta o status em tempo real: se a pelada for finalizada por outra
  // pessoa (ou noutro dispositivo) enquanto esta página está aberta, o
  // ecrã de votação/resumo tem de reagir na hora — ninguém pode continuar
  // a votar ou a mexer numa pelada que acabou de ser concluída.
  useEffect(() => {
    if (!matchId || matchId === "default") return;
    const unsub = subscribeMatchStatus(matchId, (status) => {
      setData((current) => {
        if (!current || current.status === status) return current;
        return { ...current, status: status as SavedPostMatch["status"] };
      });
    });
    return unsub;
  }, [matchId]);

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

  // O rascunho de voto (estrelas ainda por submeter) é isolado por
  // matchId + userId — várias pessoas costumam votar no mesmo telemóvel,
  // uma a seguir à outra, e sem isto a próxima pessoa via as estrelas que a
  // anterior tinha marcado (ou já submetido).
  const flow = useMemo(() => createMatchFlowStore(matchId, userId), [matchId, userId]);

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
    return createMatchFlowStore(id, userId).readVoteDraft();
  });

  // Se o userId só ficar disponível depois do primeiro render (ex: auth
  // ainda a resolver), recarrega o rascunho já com o dono certo, para nunca
  // ficar preso às estrelas do UUID local genérico.
  useEffect(() => {
    setRatings(flow.readVoteDraft());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow]);
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
  const [isCommunityAdmin, setIsCommunityAdmin] = useState(false);

  // O admin da comunidade também deve poder finalizar/administrar a
  // votação, não só o organizador — útil quando o organizador não está
  // disponível para fechar a pelada.
  useEffect(() => {
    const communityId = data?.communityId;
    if (!communityId || !userId) {
      setIsCommunityAdmin(false);
      return;
    }
    let cancelled = false;
    void loadCommunity(communityId, userId).then((community) => {
      if (!cancelled) setIsCommunityAdmin(Boolean(community?.adminId === userId));
    });
    return () => {
      cancelled = true;
    };
  }, [data?.communityId, userId]);

  const expiresAt = data?.expiresAt ? new Date(data.expiresAt).getTime() : Date.now() + 24 * 60 * 60 * 1000;
  const isExpired = isPostMatchExpired(data) || Date.now() > expiresAt;
  const players: any[] = data?.players || [];
  const games: any[] = data?.miniGames || [];

  const allEvents = useMemo(() => collectAllEvents(games), [games]);
  const topScorers = useMemo(() => computeTopScorers(allEvents), [allEvents]);

  async function handleShareResult() {
    if (!data) return;
    try {
      const teamA = data.teamNames?.A ?? "Time A";
      const teamB = data.teamNames?.B ?? "Time B";
      let scoreA = 0;
      let scoreB = 0;
      for (const g of games) {
        scoreA += Number(g?.scoreA ?? 0);
        scoreB += Number(g?.scoreB ?? 0);
      }
      const top = topScorers[0];
      const blob = await generateResultImage({
        title: data.title || "Pelada",
        dateLabel: new Date(data.savedAt || data.createdAt || Date.now()).toLocaleDateString(
          "pt-PT",
          { weekday: "long", day: "numeric", month: "long" },
        ),
        teamAName: teamA,
        teamBName: teamB,
        scoreA,
        scoreB,
        gamesCount: games.length,
        topScorerName: top?.name,
        topScorerGoals: top?.goals,
      });
      await shareOrDownloadPng(
        blob,
        "resultado-joga-ai.png",
        "Resultado da pelada",
        "Resultado final da pelada — feito com Joga AI (jogaai.pt)",
      );
    } catch (err) {
      console.warn("[PosJogo] partilhar resultado:", err);
    }
  }
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

  useEffect(() => {
    if (!data) return;
    const isVoting =
      data.status === "aguardando_auditoria" || data.status === "auditada";
    // Organizador e admin da comunidade também têm de votar primeiro, como
    // qualquer outro jogador — só depois de votarem (gainsMode) é que veem
    // o painel de administração da votação no resumo. Antes disto, o
    // organizador via logo o painel "Finalizar pelada e votação" ao abrir a
    // partida, sem nunca ser convidado a votar.
    if (isVoting && !gainsMode && !hasUserVotedInSession(userId, matchId)) {
      setVoteMode(true);
    }
  }, [data, gainsMode, userId, matchId]);

  // Se a pelada for finalizada (por outra pessoa, noutro dispositivo, ou
  // por expiração de 24h) enquanto este utilizador está no ecrã de
  // votação, tira-o de lá imediatamente — depois de "concluida" já não se
  // pode votar em mais nada.
  useEffect(() => {
    if (voteMode && data?.status === "concluida") {
      setVoteMode(false);
      toast({
        title: "Esta pelada já foi finalizada",
        description: "Já não é possível votar — as estatísticas ficam disponíveis na comunidade e no teu perfil.",
      });
    }
  }, [voteMode, data?.status]);

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
  // Admin da comunidade pode finalizar/administrar a votação, mas não
  // apagar a pelada — isso continua exclusivo do organizador.
  const canFinalize = isOrganizer || isCommunityAdmin;
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
    if (!data || ratingsReleased) return;

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

    // Status primeiro: esta escrita (só campos status/savedAt/votedUserIds)
    // nunca é negada pelas rules, seja quem for a finalizar. Isto garante
    // que a pelada sai da votação mesmo que o fan-out de notas abaixo falhe
    // parcialmente — o efeito de reparação (status "concluida" sem
    // ratingsReleased) trata do resto depois.
    await saveMatchResult(payload);
    await updateMatchStatus(data.matchId, "concluida");
    updateData({ ...data, status: "concluida", votedUserIds });

    try {
      await releaseMatchRatings(data.matchId, reason);
    } catch (err) {
      console.warn("[PosJogo] releaseMatchRatings:", err);
    }
    setRatingsReleased(true);
  }

  async function handleOrganizerFinalizeVoting() {
    if (!data || !canFinalize || ratingsReleased || finalizeBusy) return;
    const ok = await confirm({
      description:
        votedUserIds.length === 0
          ? "Finalizar a pelada e a votação agora, mesmo sem nenhum voto? As notas ficam pendentes para quem não votou."
          : "Finalizar a pelada e a votação agora e publicar as notas com os votos actuais?",
      confirmLabel: "Finalizar",
    });
    if (!ok) return;

    setFinalizeBusy(true);
    try {
      await persistMatchResultAndMaybeReleaseRatings("organizer");
    } catch (err) {
      console.warn("[PosJogo] finalize voting:", err);
      toast({
        title: "Não foi possível finalizar a pelada.",
        description: "Verifica a tua ligação e tenta novamente.",
        variant: "destructive",
      });
    } finally {
      setFinalizeBusy(false);
    }
  }

  // Auto-finalização: assim que todos os votos obrigatórios estiverem
  // reunidos, fecha a pelada (status -> "concluida" + notas publicadas) para
  // QUALQUER pessoa que tenha esta página aberta nesse momento — organizador,
  // último votante ou apenas alguém a rever o resumo. Isto evita partidas
  // presas em "auditada" quando o dispositivo de quem votou por último fechou
  // a app antes da finalização terminar.
  const autoFinalizeInFlightRef = useRef(false);
  useEffect(() => {
    if (!data || isExpired || ratingsReleased || finalizeBusy) return;
    if (data.status === "concluida") return;
    if (!allVoted) return;
    if (autoFinalizeInFlightRef.current) return;

    autoFinalizeInFlightRef.current = true;
    void (async () => {
      try {
        // Confirma com a fonte autoritativa (subcoleção votes) antes de
        // finalizar — evita disparar cedo demais com um snapshot desatualizado.
        const freshVotes = await getVotes(matchId);
        const freshVotedIds = new Set(freshVotes.map((v) => v.userId));
        const allRequiredVoted =
          requiredVoters.length === 0 ||
          requiredVoters.every((uid) => freshVotedIds.has(uid));
        if (allRequiredVoted) {
          await persistMatchResultAndMaybeReleaseRatings("all_voted");
        }
      } catch (err) {
        console.warn("[PosJogo] auto-finalização da votação:", err);
      } finally {
        autoFinalizeInFlightRef.current = false;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.matchId, data?.status, isExpired, ratingsReleased, finalizeBusy, allVoted, matchId]);

  // Rede de segurança: se as notas já foram publicadas (summary com
  // ratingsReleased=true) mas o campo status do match ficou por atualizar
  // (ex: a escrita anterior falhou a meio), corrige só o status — sem
  // reprocessar votos/atributos/badges outra vez.
  const statusFixInFlightRef = useRef(false);
  useEffect(() => {
    if (!data || data.status === "concluida") return;
    if (!ratingsReleased) return;
    if (statusFixInFlightRef.current) return;

    statusFixInFlightRef.current = true;
    updateMatchStatus(matchId, "concluida")
      .then(() => updateData({ ...data, status: "concluida" }))
      .catch((err) => console.warn("[PosJogo] correção de status pós-votação:", err))
      .finally(() => {
        statusFixInFlightRef.current = false;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.matchId, data?.status, ratingsReleased, matchId]);

  // Rede de segurança inversa (repara peladas já afectadas pelo bug antigo):
  // se o status já está "concluida" mas as notas nunca chegaram a ser
  // publicadas (ex: quem votou por último fechou a app antes do resumo/
  // ratings serem gravados), repõe o pipeline completo em vez de deixar a
  // pelada "fechada" para sempre sem estatísticas.
  const missingRatingsFixInFlightRef = useRef(false);
  useEffect(() => {
    if (!data || isExpired || finalizeBusy) return;
    if (data.status !== "concluida" || ratingsReleased) return;
    if (missingRatingsFixInFlightRef.current) return;

    missingRatingsFixInFlightRef.current = true;
    void persistMatchResultAndMaybeReleaseRatings("all_voted")
      .catch((err) => console.warn("[PosJogo] reparação de notas em falta:", err))
      .finally(() => {
        missingRatingsFixInFlightRef.current = false;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.matchId, data?.status, ratingsReleased, matchId]);

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

    // Última barreira: uma pelada já finalizada nunca aceita novos votos,
    // mesmo que a UI tenha ficado momentaneamente desatualizada.
    if (data.status === "concluida") {
      setVoteMode(false);
      toast({
        title: "Esta pelada já foi finalizada",
        description: "Já não é possível votar — as estatísticas ficam disponíveis na comunidade e no teu perfil.",
      });
      return;
    }

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
    trackEvent("vote_submitted", { matchId });
    submitVote(matchId, voteRecord).catch(console.warn);
    markUserVoted(matchId, userId).catch(console.warn);
    // O voto já está submetido (local + servidor) — limpa o rascunho para
    // não sobrar nada que possa reaparecer para a próxima pessoa a votar
    // neste dispositivo.
    flow.clearVoteDraft();
    // Já votou: o lembrete de "falta votar" deixa de fazer sentido.
    void markNotificationRead(userId, `vote-${matchId}`);

    // `votedUserIds` (memoizado) já incorpora os votos em tempo real de outros
    // jogadores via `voteRecords` — usar isto (em vez de `data.votedUserIds`
    // isolado) evita perder votantes quando dois votos chegam quase ao mesmo
    // tempo (cada cliente só via o seu próprio snapshot desatualizado).
    const nextVotedUserIds = [...new Set([...votedUserIds, userId])];
    const nextAllVoted =
      requiredVoters.length === 0 ||
      requiredVoters.every((uid) => nextVotedUserIds.includes(uid));

    // NUNCA marcar "concluida" aqui directamente: isso saltava por completo
    // a publicação de notas/badges/resumo (persistMatchResultAndMaybeReleaseRatings),
    // porque o efeito de auto-finalização vê `status === "concluida"` e desiste
    // logo — a pelada ficava com o status certo mas sem notas/estatísticas
    // publicadas para ninguém. Deixa o status como está; o efeito de
    // auto-finalização (abaixo) observa `allVoted`/`votedUserIds`, confirma
    // com a fonte autoritativa de votos e só então publica tudo e muda o
    // status para "concluida".
    updateData({ ...data, votedUserIds: nextVotedUserIds, status: data.status ?? "auditada" });

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

      // Confirmação final a partir da fonte autoritativa (subcoleção `votes`,
      // onde cada jogador escreve o seu próprio documento sem risco de
      // sobrescrita) — evita não finalizar quando o listener local ainda não
      // tinha recebido o voto de outro jogador no momento do clique.
      try {
        const freshVotes = await getVotes(data.matchId);
        const freshVotedIds = new Set(freshVotes.map((v) => v.userId));
        freshVotedIds.add(userId);
        const allRequiredVoted =
          requiredVoters.length === 0 ||
          requiredVoters.every((uid) => freshVotedIds.has(uid));

        if (allRequiredVoted) {
          await persistMatchResultAndMaybeReleaseRatings("all_voted");
        }
      } catch (err) {
        console.warn("[PosJogo] verificação final de votos:", err);
        if (nextAllVoted) {
          await persistMatchResultAndMaybeReleaseRatings("all_voted");
        }
      }
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

        {canFinalize && data.status !== "concluida" && (
          <JogaButton
            variant="outline"
            size="lg"
            className="mt-4"
            onClick={() => setGainsMode(false)}
            data-testid="gains-manage-voting"
          >
            Gerir votação da pelada
          </JogaButton>
        )}

        <JogaButton
          variant="primary"
          size="lg"
          className="mt-4"
          disabled={shareEvolutionBusy || !profile.profileComplete}
          onClick={() => void shareEvolutionCard()}
        >
          Partilhar evolução
        </JogaButton>

        <button
          type="button"
          onClick={() => void handleShareResult()}
          className="mt-2 w-full rounded-2xl py-3.5 font-black text-sm text-white flex items-center justify-center gap-2"
          style={{ background: "#10b981" }}
          data-testid="button-share-result"
        >
          📤 Partilhar resultado no grupo
        </button>

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

        <SponsorSlot className="mt-4" />
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

      <button
        type="button"
        onClick={() => void handleShareResult()}
        className="mt-4 w-full rounded-2xl py-3.5 font-black text-sm text-white flex items-center justify-center gap-2"
        style={{ background: "#10b981" }}
        data-testid="button-share-result"
      >
        📤 Partilhar resultado no grupo
      </button>

      <SponsorSlot className="mt-4" />

      {canFinalize && (
        <section
          className="mt-4 rounded-3xl p-4"
          style={{ background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.22)" }}
          data-testid="organizer-voting-panel"
        >
          <p className="text-blue-200/70 text-[10px] font-black uppercase tracking-[0.2em]">
            {isOrganizer ? "Admin da pelada" : "Admin da comunidade"}
          </p>
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
              disabled={finalizeBusy}
              onClick={() => void handleOrganizerFinalizeVoting()}
              data-testid="organizer-finalize-match"
            >
              {finalizeBusy ? "A finalizar…" : "Finalizar pelada e votação"}
            </JogaButton>
          )}
          {!ratingsReleased && votedUserIds.length === 0 && (
            <p className="text-white/35 text-xs mt-2 text-center">
              Como {isOrganizer ? "organizador" : "admin da comunidade"}, podes finalizar a qualquer momento — mesmo sem votos.
            </p>
          )}
          {allVoted && !ratingsReleased && (
            <p className="text-emerald-300 text-xs mt-2 text-center font-semibold">
              Todos votaram — a pelada está a ser finalizada automaticamente.
            </p>
          )}

          {isOrganizer && (
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
          )}
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
        ) : data.status === "concluida" ? (
          <div
            className="rounded-2xl py-4 px-4 text-center"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <p className="text-white/60 text-sm font-semibold">
              Esta pelada já foi finalizada — já não é possível votar.
            </p>
            <p className="text-white/35 text-xs mt-1">
              As estatísticas ficam disponíveis na comunidade e no teu perfil.
            </p>
          </div>
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
