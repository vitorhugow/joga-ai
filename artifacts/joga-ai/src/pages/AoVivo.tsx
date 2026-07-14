import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { ChevronLeft, MoreVertical, Pause, Play, RotateCcw, StopCircle, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { loadPreMatch, type SavedPreMatch } from "@/lib/preMatchStorage";
import type { SavedPostMatch } from "@/lib/postMatchStorage";
import {
  loadMatchFromFirestore,
  saveMatchToFirestoreOrThrow,
  getMatchReturnPath,
  subscribeToMatch,
} from "@/lib/matchRepository";
import { findRecentDuplicateEvent, isUserLiveController } from "@/lib/liveControllerUtils";
import { ManageLiveControllersDialog } from "@/components/ManageLiveControllersDialog";
import { resetMatchFlowSession, resolveMatchId } from "@/lib/matchFlowStorage";
import { getCurrentUserId } from "@/lib/auth";
import {
  addLiveEvent as addLiveEventSubcollection,
  saveMiniGame,
  finalizeMiniGame,
} from "@/lib/liveMatchRepository";
import {
  subscribeToSetup,
  subscribeToLive,
  computeElapsedSeconds,
  formatLiveTime,
  loadCachedLive,
  toggleClock,
  resetClock,
  setNextTeams,
  confirmNextMiniGame,
  endMiniGame,
  markLiveEnded,
  addLiveEventAction,
  undoLastEvent,
  ensureSetupMigrated,
  requestServerSetupMigration,
  type ParsedMatchLiveState,
  type MatchSetupState,
} from "@/lib/matchStateRepository";
import { useMatchPhaseGuard } from "@/hooks/useMatchPhaseGuard";
import { useAuth } from "@/contexts/AuthContext";
import { JogaButton, JogaCard, JogaPage } from "@/components/joga";
import { toast } from "@/hooks/use-toast";
import { useJogaConfirm } from "@/hooks/useJogaConfirm";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

type TeamKey = "A" | "B" | "C" | "D" | "BENCH";
type EventType = "golo" | "assistencia" | "defesa" | "cartao_amarelo" | "falta";

type LivePlayer = {
  id: string;
  name: string;
  position: string;
  overall?: number;
};

type LiveEvent = {
  id: string;
  type: EventType;
  playerId: string;
  playerName: string;
  team: TeamKey;
  time: string;
};

type MiniGame = {
  id: string;
  title: string;
  scoreA: number;
  scoreB: number;
  homeTeam: TeamKey;
  awayTeam: TeamKey;
  events: LiveEvent[];
  winner: string;
};

const defaultTeamNames: Record<TeamKey, string> = {
  A: "Time A",
  B: "Time B",
  C: "Time C",
  D: "Time D",
  BENCH: "Banco",
};

const teamColors: Record<TeamKey, string> = {
  A: "#4ade80",
  B: "#60a5fa",
  C: "#fbbf24",
  D: "#fb7185",
  BENCH: "#94a3b8",
};

const eventTypes: { key: EventType; label: string; emoji: string }[] = [
  { key: "golo", label: "Golo", emoji: "⚽" },
  { key: "assistencia", label: "Assist.", emoji: "🎯" },
  { key: "defesa", label: "Defesa", emoji: "🧤" },
  { key: "cartao_amarelo", label: "Cartão", emoji: "🟨" },
  { key: "falta", label: "Falta", emoji: "⚠️" },
];

function formatTime(seconds: number) {
  return formatLiveTime(seconds);
}

export default function AoVivo() {
  useDocumentTitle("Ao Vivo");
  const { confirm, ConfirmDialog } = useJogaConfirm();
  const { userId } = useAuth();
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/partida/:id/ao-vivo");
  const matchId = resolveMatchId({ routeMatchId: params?.id });
  const returnTo = getMatchReturnPath();
  const { ready: phaseReady } = useMatchPhaseGuard(matchId, "ao-vivo");

  const [setupState, setSetupState] = useState<MatchSetupState | null>(null);
  const [hasSetupDoc, setHasSetupDoc] = useState(false);
  const [organizerId, setOrganizerId] = useState<string | null | undefined>(undefined);
  const [liveControllerIds, setLiveControllerIds] = useState<string[]>([]);
  const [controllersDialogOpen, setControllersDialogOpen] = useState(false);
  const isOrganizer = Boolean(userId && organizerId && userId === organizerId);
  const isLiveController = isUserLiveController(userId, {
    liveControllerIds,
    organizerId,
  });
  const [remoteMatch, setRemoteMatch] = useState<SavedPostMatch | null>(null);
  const [liveState, setLiveState] = useState<ParsedMatchLiveState | null>(() => loadCachedLive(matchId));
  const [clockTick, setClockTick] = useState(0);
  const [showResumo, setShowResumo] = useState(false);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const lastEventClickRef = useRef(0);

  const live = liveState;
  const scoreA = live?.scoreA ?? 0;
  const scoreB = live?.scoreB ?? 0;
  const isRunning = live?.status === "running";
  const seconds = useMemo(() => computeElapsedSeconds(live), [live, clockTick]);
  const activeHomeTeam = ((live?.activeHomeTeam as TeamKey) || "A") as TeamKey;
  const activeAwayTeam = ((live?.activeAwayTeam as TeamKey) || "B") as TeamKey;
  const nextHomeTeam = ((live?.nextHomeTeam as TeamKey) || "A") as TeamKey;
  const nextAwayTeam = ((live?.nextAwayTeam as TeamKey) || "B") as TeamKey;
  const showNextGamePicker = live?.showNextGamePicker ?? true;
  const events = (live?.events ?? []) as LiveEvent[];
  const miniGames = (live?.miniGames ?? []) as MiniGame[];

  const preMatch = useMemo((): SavedPreMatch | null => {
    const cached = loadPreMatch(matchId);
    const players = remoteMatch?.players ?? cached?.players ?? [];
    if (!players.length && !setupState && !cached) return null;

    return {
      version: 1,
      matchId,
      gameMode: setupState?.gameMode ?? remoteMatch?.gameMode ?? cached?.gameMode ?? "fut5",
      teamCount: setupState?.teamCount ?? remoteMatch?.teamCount ?? cached?.teamCount ?? 2,
      teamNames: setupState?.teamNames ??
        remoteMatch?.teamNames ??
        cached?.teamNames ?? { A: "Time A", B: "Time B", C: "Time C", D: "Time D" },
      players,
      playerTeams: setupState?.playerTeams ?? remoteMatch?.playerTeams ?? cached?.playerTeams ?? {},
      assignments: setupState?.assignments ?? remoteMatch?.assignments ?? cached?.assignments ?? {},
      savedAt: cached?.savedAt ?? new Date().toISOString(),
    };
  }, [matchId, setupState, remoteMatch]);

  const playerTeams = preMatch?.playerTeams ?? {};

  useEffect(() => {
    if (!phaseReady) return;

    if (preMatch) {
      const first =
        preMatch.players.find((player) => playerTeams[player.id] === "A") ||
        preMatch.players.find((player) => playerTeams[player.id] === "B") ||
        preMatch.players[0];
      setSelectedPlayerId((current) => current ?? first?.id ?? null);
    }

    document.body.classList.add("joga-ai-ao-vivo-page");
    return () => document.body.classList.remove("joga-ai-ao-vivo-page");
  }, [phaseReady, preMatch, playerTeams]);

  useEffect(() => {
    if (!phaseReady) return;

    const unsubMatch = subscribeToMatch(matchId, (meta) => {
      setOrganizerId(meta.organizerId);
      setLiveControllerIds(meta.liveControllerIds);
      setRemoteMatch(meta.match);
      if (meta.organizerId && userId === meta.organizerId) {
        void ensureSetupMigrated(matchId, meta.organizerId, meta.match?.players ?? []);
      } else if (userId) {
        void requestServerSetupMigration(matchId).catch(console.warn);
      }
    });

    const unsubSetup = subscribeToSetup(matchId, (setup) => {
      setSetupState(setup);
      setHasSetupDoc(Boolean(setup));
    });

    const unsubLive = subscribeToLive(matchId, setLiveState);

    return () => {
      unsubMatch();
      unsubSetup();
      unsubLive();
    };
  }, [matchId, phaseReady, userId]);

  useEffect(() => {
    if (live?.status !== "running") return;
    const interval = window.setInterval(() => setClockTick((v) => v + 1), 1000);
    return () => window.clearInterval(interval);
  }, [live?.status]);

  const players = preMatch?.players || [];
  const activeTeamCount = preMatch?.teamCount || 2;

  const teamNames = useMemo(() => ({
    ...defaultTeamNames,
    ...(preMatch?.teamNames || {}),
  }), [preMatch]);

  const visibleTeams = (["A", "B", "C", "D"] as TeamKey[]).slice(0, activeTeamCount);
  const activeTeamsForGame: TeamKey[] = [activeHomeTeam, activeAwayTeam];

  const selectedPlayer = players.find((player) => player.id === selectedPlayerId) || null;
  const selectedTeam = selectedPlayer ? playerTeams[selectedPlayer.id] || "BENCH" : "BENCH";

  const homeWinning = scoreA > scoreB;
  const awayWinning = scoreB > scoreA;
  const timeProgress = Math.min(100, (seconds / 600) * 100);
  const canRegisterEvent = isRunning;

  const playersByTeam = useMemo(() => {
    const map: Record<TeamKey, LivePlayer[]> = { A: [], B: [], C: [], D: [], BENCH: [] };

    for (const player of players) {
      const team = playerTeams[player.id] || "BENCH";
      map[team].push(player);
    }

    return map;
  }, [players, playerTeams]);

  const allColumns: TeamKey[] = [activeHomeTeam, activeAwayTeam];

  const allEventsForDay = useMemo(() => {
    return [...miniGames.flatMap((game) => game.events), ...events];
  }, [events, miniGames]);

  const topScorers = useMemo(() => {
    const goals = allEventsForDay
      .filter((event) => event.type === "golo")
      .reduce<Record<string, { name: string; goals: number }>>((acc, event) => {
        acc[event.playerId] ||= { name: event.playerName, goals: 0 };
        acc[event.playerId].goals += 1;
        return acc;
      }, {});

    return Object.values(goals).sort((a, b) => b.goals - a.goals);
  }, [allEventsForDay]);

  const eventWeight = (event: LiveEvent) => {
    if (event.type === "golo") return 36;
    if (event.type === "assistencia") return 18;
    if (event.type === "defesa") return 12;
    if (event.type === "falta") return -8;
    if (event.type === "cartao_amarelo") return -16;
    return 0;
  };

  const homePressure = 50 + scoreA * 18 + events.filter((event) => event.team === activeHomeTeam).reduce((sum, event) => sum + eventWeight(event), 0);
  const awayPressure = 50 + scoreB * 18 + events.filter((event) => event.team === activeAwayTeam).reduce((sum, event) => sum + eventWeight(event), 0);
  const pressureTotal = Math.max(1, homePressure + awayPressure);
  const homePressureWidth = Math.max(18, Math.min(82, (homePressure / pressureTotal) * 100));

  function addEvent(type: EventType) {
    if (!isLiveController) return;

    if (!canRegisterEvent) {
      toast({ title: "O cronómetro precisa estar a correr para marcar eventos.", variant: "destructive" });
      return;
    }

    if (!selectedPlayer) return;

    const team = playerTeams[selectedPlayer.id] || "BENCH";

    if (!activeTeamsForGame.includes(team)) return;

    const miniGameId = live?.currentMiniGameId ?? `current-${activeHomeTeam}-vs-${activeAwayTeam}`;
    const clickBucket = Math.floor(Date.now() / 400);
    if (Date.now() - lastEventClickRef.current < 400 && type === "golo") return;
    lastEventClickRef.current = Date.now();

    const duplicate = findRecentDuplicateEvent(events, {
      miniGameId,
      type,
      playerId: selectedPlayer.id,
      team,
    });
    if (duplicate) {
      toast({
        title: type === "golo" ? "Este golo já foi registado." : "Este evento já foi registado.",
      });
      return;
    }

    const eventId = `${miniGameId}-${type}-${selectedPlayer.id}-${clickBucket}`;

    void addLiveEventAction(matchId, {
      eventId,
      type,
      playerId: selectedPlayer.id,
      playerName: selectedPlayer.name,
      team,
      time: formatTime(seconds),
      miniGameId,
    }).then((result) => {
      if (result === "duplicate") {
        toast({
          title: type === "golo" ? "Este golo já foi registado." : "Este evento já foi registado.",
        });
        return;
      }
      if (result !== "added") return;
      addLiveEventSubcollection(matchId, {
        type,
        playerId: selectedPlayer.id,
        playerName: selectedPlayer.name,
        team,
        time: formatTime(seconds),
        miniGameId,
      }).catch(console.warn);
    });
  }

  function undoLastEventAction() {
    if (!isLiveController) return;
    void undoLastEvent(matchId);
  }

  function removeEvent(_eventId: string) {
    undoLastEventAction();
  }

  async function reiniciarCronometro() {
    const ok = await confirm({
      description: "Reiniciar o cronómetro deste mini jogo? O tempo volta a 00:00.",
      confirmLabel: "Reiniciar",
    });
    if (!ok) return;
    await resetClock(matchId);
  }

  async function toggleTimer() {
    if (showNextGamePicker) {
      toast({ title: "Escolhe primeiro quais equipas vão jogar este mini jogo.", variant: "destructive" });
      return;
    }
    await toggleClock(matchId);
  }

  async function finalizarMiniJogo() {
    if (showNextGamePicker) {
      toast({ title: "Escolhe as equipas antes de finalizar o mini jogo.", variant: "destructive" });
      return;
    }

    const ok = await confirm("Finalizar apenas este mini jogo? A pelada continuará aberta.");
    if (!ok) return;

    const ended = await endMiniGame(matchId, teamNames);
    if (ended) {
      saveMiniGame(matchId, {
        id: ended.id,
        title: ended.title,
        homeTeam: ended.homeTeam,
        awayTeam: ended.awayTeam,
        scoreA: ended.scoreA,
        scoreB: ended.scoreB,
        winner: ended.winner,
        order: Date.now(),
      }).catch(console.warn);
      finalizeMiniGame(matchId, ended.id, {
        scoreA: ended.scoreA,
        scoreB: ended.scoreB,
        winner: ended.winner,
      }).catch(console.warn);
    }
  }

  async function confirmarProximoJogo() {
    if (nextHomeTeam === nextAwayTeam) {
      toast({ title: "Escolhe duas equipas diferentes.", variant: "destructive" });
      return;
    }

    await confirmNextMiniGame(matchId, nextHomeTeam, nextAwayTeam);

    const firstPlayer =
      players.find((player) => playerTeams[player.id] === nextHomeTeam) ||
      players.find((player) => playerTeams[player.id] === nextAwayTeam);

    setSelectedPlayerId(firstPlayer?.id || null);
  }

  async function terminarPelada() {
    const ok = await confirm({
      description:
        "Terminar a pelada e abrir o resumo? Quem está no plantel recebe +1 Físico automaticamente.",
      confirmLabel: "Terminar pelada",
    });
    if (!ok) return;

    await markLiveEnded(matchId);

    const shouldSaveCurrentGame =
      !showNextGamePicker &&
      (events.length > 0 || scoreA > 0 || scoreB > 0 || seconds > 0);

    const currentMiniGame = shouldSaveCurrentGame
      ? {
          id: `game-final-${Date.now()}`,
          title: `${teamNames[activeHomeTeam]} ${scoreA} x ${scoreB} ${teamNames[activeAwayTeam]}`,
          scoreA,
          scoreB,
          homeTeam: activeHomeTeam,
          awayTeam: activeAwayTeam,
          events,
          winner:
            scoreA === scoreB
              ? "Empate"
              : scoreA > scoreB
                ? teamNames[activeHomeTeam]
                : teamNames[activeAwayTeam],
        }
      : null;

    const finalMiniGames = currentMiniGame ? [...miniGames, currentMiniGame] : miniGames;
    const mePlayer = players.find((player) => player.isMe) || players[0];

    const existing = await loadMatchFromFirestore(matchId);

    const postMatchData = {
      version: 1 as const,
      matchId,
      status: "aguardando_auditoria" as const,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      expiresAt: existing?.expiresAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      gameMode: preMatch?.gameMode || existing?.gameMode || "fut5",
      teamCount: preMatch?.teamCount || existing?.teamCount || 2,
      teamNames: {
        A: teamNames.A,
        B: teamNames.B,
        C: teamNames.C,
        D: teamNames.D,
      },
      players,
      playerTeams,
      assignments: existing?.assignments ?? {},
      currentPlayerId: mePlayer?.id || existing?.currentPlayerId || "",
      miniGames: finalMiniGames,
      savedAt: new Date().toISOString(),
      title: existing?.title,
      communityId: existing?.communityId,
      organizerId: existing?.organizerId ?? getCurrentUserId(),
      votedUserIds: existing?.votedUserIds,
      waitlist: existing?.waitlist,
    } as const;

    try {
      await saveMatchToFirestoreOrThrow(
        matchId,
        postMatchData as Parameters<typeof saveMatchToFirestoreOrThrow>[1],
      );
      resetMatchFlowSession(matchId);
      window.location.href = `/partida/${matchId}/pos-jogo`;
    } catch (err) {
      console.warn("[AoVivo] terminarPelada:", err);
      toast({
        title: "Não foi possível terminar a pelada.",
        description: "Verifica a tua ligação e tenta novamente.",
        variant: "destructive",
      });
    }
  }


  if (!phaseReady) {
    return (
      <JogaPage theme="arena" padded className="py-6" bottomSpace={false} hideFooterCredit>
        <JogaCard variant="arena" padding="lg" className="text-center">
          <p className="text-white/45 text-sm">A carregar partida…</p>
        </JogaCard>
      </JogaPage>
    );
  }

  if (organizerId === undefined) {
    return (
      <JogaPage theme="arena" padded className="py-6" bottomSpace={false} hideFooterCredit>
        <JogaCard variant="arena" padding="lg" className="text-center">
          <p className="text-white/45 text-sm">A carregar partida…</p>
        </JogaCard>
      </JogaPage>
    );
  }

  // Modo leitura: quem não é o controlador ao vivo vê tudo em tempo real.
  if (!isLiveController) {
    const viewPlayers = remoteMatch?.players ?? preMatch?.players ?? [];
    const viewTeamNames: Record<TeamKey, string> = {
      ...defaultTeamNames,
      ...((setupState?.teamNames || remoteMatch?.teamNames || preMatch?.teamNames || {}) as Partial<Record<TeamKey, string>>),
    };
    const liveHomeTeam = activeHomeTeam;
    const liveAwayTeam = activeAwayTeam;
    const liveScoreA = scoreA;
    const liveScoreB = scoreB;
    const liveEvents = events;
    const liveMiniGames = miniGames;
    const liveHomeWinning = liveScoreA > liveScoreB;
    const liveAwayWinning = liveScoreB > liveScoreA;
    const viewPlayerTeams = setupState?.playerTeams ?? remoteMatch?.playerTeams ?? preMatch?.playerTeams ?? {};
    const liveTeamsByKey = viewPlayers.reduce<Record<TeamKey, LivePlayer[]>>(
      (map, player) => {
        const team = ((viewPlayerTeams[player.id] as TeamKey) || "BENCH") as TeamKey;
        map[team] = map[team] || [];
        map[team].push(player);
        return map;
      },
      { A: [], B: [], C: [], D: [], BENCH: [] },
    );

    return (
      <JogaPage theme="arena" padded={false} bottomSpace={false} className="pb-8" hideFooterCredit>
        <div className="flex items-center justify-between px-4 pt-5 pb-3">
          <button
            type="button"
            className="w-12 h-12 rounded-2xl flex items-center justify-center joga-live-button"
            style={{ background: "rgba(239,68,68,0.18)", border: "1px solid rgba(239,68,68,0.34)" }}
            onClick={() => setLocation(returnTo)}
            aria-label="Voltar"
          >
            <ChevronLeft className="w-6 h-6 text-red-100" />
          </button>

          <div className="text-center">
            <p className="text-white/35 text-[10px] font-black uppercase tracking-[0.22em]">Ao Vivo · A acompanhar</p>
            <p className="text-white font-display font-black text-base">
              {viewTeamNames[liveHomeTeam]} x {viewTeamNames[liveAwayTeam]}
            </p>
          </div>

          <div className="w-12" />
        </div>

        <div className="px-4 space-y-4">
          {!live && (
            <JogaCard variant="arena" padding="lg" className="text-center">
              <p className="text-white/45 text-sm">A aguardar o organizador iniciar o jogo…</p>
            </JogaCard>
          )}

          <section
            className="relative overflow-hidden rounded-[30px] p-5 text-center"
            style={{
              background:
                "radial-gradient(circle at 50% 0%, rgba(74,222,128,0.18), transparent 45%), linear-gradient(160deg, rgba(255,255,255,0.09), rgba(255,255,255,0.035))",
              border: "1px solid rgba(255,255,255,0.12)",
              boxShadow: "0 18px 45px rgba(0,0,0,0.28)",
            }}
          >
            <div className="absolute inset-x-0 top-0 h-1" style={{ background: `linear-gradient(90deg, ${teamColors[liveHomeTeam]}, rgba(255,255,255,0.16), ${teamColors[liveAwayTeam]})` }} />

            <div className="flex items-center justify-between gap-3">
              <div className="flex-1 rounded-3xl py-4" style={{ background: `${teamColors[liveHomeTeam]}14`, border: `1px solid ${teamColors[liveHomeTeam]}33` }}>
                <p className="font-black text-[11px] uppercase tracking-wide" style={{ color: teamColors[liveHomeTeam] }}>{viewTeamNames[liveHomeTeam]}</p>
                <p
                  className="font-display font-black text-6xl leading-none mt-1"
                  style={{ color: liveHomeWinning ? teamColors[liveHomeTeam] : "white" }}
                >
                  {liveScoreA}
                </p>
              </div>

              <div className="px-2">
                <p className="font-display font-black text-white text-4xl leading-none">{formatTime(seconds)}</p>
                <p className="text-white/35 text-[11px] font-black uppercase mt-2">{isRunning ? "Rodando" : "Parado"}</p>
              </div>

              <div className="flex-1 rounded-3xl py-4" style={{ background: `${teamColors[liveAwayTeam]}14`, border: `1px solid ${teamColors[liveAwayTeam]}33` }}>
                <p className="font-black text-[11px] uppercase tracking-wide" style={{ color: teamColors[liveAwayTeam] }}>{viewTeamNames[liveAwayTeam]}</p>
                <p
                  className="font-display font-black text-6xl leading-none mt-1"
                  style={{ color: liveAwayWinning ? teamColors[liveAwayTeam] : "white" }}
                >
                  {liveScoreB}
                </p>
              </div>
            </div>
          </section>

          {(showNextGamePicker) && (
            <JogaCard variant="arena" padding="md" className="text-center">
              <p className="text-white/55 text-sm">O organizador está a escolher o próximo mini jogo…</p>
            </JogaCard>
          )}

          {[liveHomeTeam, liveAwayTeam].some((team) => (liveTeamsByKey[team] || []).length > 0) && (
            <section className="rounded-3xl overflow-hidden" style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.07)" }}>
              <div className="grid grid-cols-2">
                {[liveHomeTeam, liveAwayTeam].map((team) => (
                  <div key={team} style={{ borderRight: "1px solid rgba(255,255,255,0.06)" }}>
                    <div className="px-3 py-2.5" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                      <p className="text-[10px] font-black uppercase tracking-[0.18em]" style={{ color: teamColors[team] }}>
                        {viewTeamNames[team]}
                      </p>
                    </div>

                    {(liveTeamsByKey[team] || []).map((player) => (
                      <div key={player.id} className="w-full flex items-center gap-2.5 px-3 py-2.5" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                        <span className="w-7 h-7 rounded-lg flex items-center justify-center font-black text-white text-[10px]" style={{ background: `${teamColors[team]}22` }}>
                          {player.position}
                        </span>
                        <span className="text-xs font-semibold truncate text-white/70">{player.name.split(" ")[0]}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="rounded-3xl p-4" style={{ background: "rgba(255,255,255,0.045)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <p className="text-[10px] font-black text-white/25 uppercase tracking-[0.22em] mb-3">Eventos do jogo actual</p>

            {liveEvents.length === 0 ? (
              <p className="text-white/35 text-sm">Nenhum evento ainda.</p>
            ) : (
              <div className="space-y-2">
                {liveEvents.map((event) => (
                  <div
                    key={event.id}
                    className="flex items-center gap-2 text-sm rounded-xl px-2 py-2"
                    style={{ background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.05)" }}
                  >
                    <span className="text-white/75 flex-1">{event.time} · {event.playerName}</span>
                    <span style={{ color: teamColors[(event.team as TeamKey) || "BENCH"] }}>
                      {eventTypes.find((item) => item.key === event.type)?.emoji}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {liveMiniGames.length > 0 && (
            <section className="rounded-3xl p-4" style={{ background: "rgba(255,255,255,0.045)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <p className="text-[10px] font-black text-white/25 uppercase tracking-[0.22em] mb-3">Mini jogos anteriores</p>

              <div className="space-y-2">
                {liveMiniGames.map((game, index) => (
                  <div key={game.id} className="rounded-2xl p-3" style={{ background: "rgba(255,255,255,0.045)" }}>
                    <p className="text-white font-black">Jogo {index + 1}: {game.title}</p>
                    <p className="text-white/45 text-xs mt-1">Vencedor: {game.winner}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          <p className="text-white/30 text-xs text-center">
            A acompanhar em tempo real — só os controladores podem alterar o jogo.
          </p>
        </div>
      </JogaPage>
    );
  }

  if (!preMatch && !hasSetupDoc && !(remoteMatch?.players?.length)) {
    return (
      <JogaPage theme="arena" padded className="py-6" bottomSpace={false} hideFooterCredit>
        <JogaCard variant="arena" padding="lg" className="text-center">
          <h1 className="font-display font-black text-white text-2xl">Nenhuma partida preparada</h1>
          <p className="text-white/45 text-sm mt-2">Configura equipas e jogadores no Pré-Jogo antes de iniciar o Ao Vivo.</p>
          <Link href={returnTo} className="block mt-4">
            <JogaButton variant="primary" size="md">Voltar ao início</JogaButton>
          </Link>
        </JogaCard>
      </JogaPage>
    );
  }

  if (showResumo) {
    return (
      <JogaPage theme="arena" padded className="py-5" bottomSpace={false} hideFooterCredit>
        <JogaButton variant="danger" size="md" className="mb-5 gap-2" onClick={() => setShowResumo(false)}>
          <ChevronLeft className="w-5 h-5" />
          Voltar ao jogo
        </JogaButton>

        <h1 className="font-display font-black text-white text-3xl">Resumo da Pelada</h1>

        <section className="mt-5 rounded-3xl p-4" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <p className="text-white/35 text-[10px] font-black uppercase tracking-[0.18em] mb-3">Mini jogos</p>

          {miniGames.length === 0 ? (
            <p className="text-white/45 text-sm">Nenhum mini jogo finalizado ainda.</p>
          ) : (
            <div className="space-y-2">
              {miniGames.map((game, index) => (
                <div key={game.id} className="rounded-2xl p-3" style={{ background: "rgba(255,255,255,0.045)" }}>
                  <p className="text-white font-black">Jogo {index + 1}: {game.title}</p>
                  <p className="text-white/45 text-xs mt-1">Vencedor: {game.winner}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="mt-4 rounded-3xl p-4" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <p className="text-white/35 text-[10px] font-black uppercase tracking-[0.18em] mb-3">Artilheiro do dia</p>

          {topScorers.length === 0 ? (
            <p className="text-white/45 text-sm">Nenhum golo registrado.</p>
          ) : (
            topScorers.map((item, index) => (
              <div key={item.name} className="flex justify-between py-2">
                <span className="text-white/80 font-bold">{index + 1}. {item.name}</span>
                <span className="text-emerald-300 font-black">{item.goals} golos</span>
              </div>
            ))
          )}
        </section>
      </JogaPage>
    );
  }

  return (
    <JogaPage theme="arena" padded={false} bottomSpace={false} className="pb-8" hideFooterCredit>
      <div className="flex items-center justify-between px-4 pt-5 pb-3">
        <button
          type="button"
          className="w-12 h-12 rounded-2xl flex items-center justify-center joga-live-button"
          style={{ background: "rgba(239,68,68,0.18)", border: "1px solid rgba(239,68,68,0.34)" }}
          onClick={() => setLocation(returnTo)}
          aria-label="Voltar"
        >
          <ChevronLeft className="w-6 h-6 text-red-100" />
        </button>

        <div className="text-center">
          <p className="text-white/35 text-[10px] font-black uppercase tracking-[0.22em]">Ao Vivo</p>
          <p className="text-white font-display font-black text-base">{teamNames[activeHomeTeam]} x {teamNames[activeAwayTeam]}</p>
          {liveControllerIds.length > 0 && (
            <p className="text-white/30 text-[10px] font-semibold mt-0.5">
              {liveControllerIds.length} controlador{liveControllerIds.length === 1 ? "" : "es"}
            </p>
          )}
        </div>

        <div className="w-12" />
      </div>

      <div className="px-4 space-y-4">
        <section
          className="relative overflow-hidden rounded-[30px] p-5 text-center"
          style={{
            background:
              "radial-gradient(circle at 50% 0%, rgba(74,222,128,0.18), transparent 45%), linear-gradient(160deg, rgba(255,255,255,0.09), rgba(255,255,255,0.035))",
            border: "1px solid rgba(255,255,255,0.12)",
            boxShadow: "0 18px 45px rgba(0,0,0,0.28)",
          }}
        >
          <div className="absolute inset-x-0 top-0 h-1" style={{ background: `linear-gradient(90deg, ${teamColors[activeHomeTeam]}, rgba(255,255,255,0.16), ${teamColors[activeAwayTeam]})` }} />

          <div className="flex items-center justify-between gap-3">
            <div className="flex-1 rounded-3xl py-4" style={{ background: `${teamColors[activeHomeTeam]}14`, border: `1px solid ${teamColors[activeHomeTeam]}33` }}>
              <p className="font-black text-[11px] uppercase tracking-wide" style={{ color: teamColors[activeHomeTeam] }}>{teamNames[activeHomeTeam]}</p>
              <p
                className={`font-display font-black text-6xl leading-none mt-1 joga-live-score-number ${homeWinning ? "joga-live-score-winning" : ""}`}
                style={{
                  color: homeWinning ? teamColors[activeHomeTeam] : "white",
                  textShadow: homeWinning ? `0 0 18px ${teamColors[activeHomeTeam]}AA, 0 0 34px ${teamColors[activeHomeTeam]}66` : "0 0 18px rgba(255,255,255,0.12)",
                }}
              >
                {scoreA}
              </p>
            </div>

            <div className="px-2">
              <p className="font-display font-black text-white text-4xl leading-none joga-live-clock-number">{formatTime(seconds)}</p>

              <div className="mt-3 w-24 h-2 rounded-full overflow-hidden mx-auto joga-live-time-track">
                <div className="h-full rounded-full joga-live-time-fill" style={{ width: `${timeProgress}%` }} />
              </div>

              <p className="text-white/35 text-[11px] font-black uppercase mt-2">{isRunning ? "Rodando" : "Parado"}</p>
              <div className="mt-3 mx-auto w-10 h-10 rounded-full flex items-center justify-center joga-live-tech-clock">
                <span className="text-xl">⏱</span>
              </div>
            </div>

            <div className="flex-1 rounded-3xl py-4" style={{ background: `${teamColors[activeAwayTeam]}14`, border: `1px solid ${teamColors[activeAwayTeam]}33` }}>
              <p className="font-black text-[11px] uppercase tracking-wide" style={{ color: teamColors[activeAwayTeam] }}>{teamNames[activeAwayTeam]}</p>
              <p
                className={`font-display font-black text-6xl leading-none mt-1 joga-live-score-number ${awayWinning ? "joga-live-score-winning" : ""}`}
                style={{
                  color: awayWinning ? teamColors[activeAwayTeam] : "white",
                  textShadow: awayWinning ? `0 0 18px ${teamColors[activeAwayTeam]}AA, 0 0 34px ${teamColors[activeAwayTeam]}66` : "0 0 18px rgba(255,255,255,0.12)",
                }}
              >
                {scoreB}
              </p>
            </div>
          </div>

          <div className="relative z-10 mt-4">
            <div
              className="joga-live-momentum-embedded rounded-2xl px-3 py-2"
              style={{
                background: "linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03))",
                border: "1px solid rgba(255,255,255,0.08)",
                boxShadow: "0 10px 24px rgba(0,0,0,0.18)",
              }}
            >
              <div className="flex items-center justify-between text-[9px] font-black uppercase tracking-[0.16em] mb-2">
                <span style={{ color: teamColors[activeHomeTeam] }}>{teamNames[activeHomeTeam]}</span>
                <span className="text-white/25">VS</span>
                <span style={{ color: teamColors[activeAwayTeam] }}>{teamNames[activeAwayTeam]}</span>
              </div>

              <div
                className="relative h-3 rounded-full overflow-hidden flex joga-live-pressure-track"
                style={{
                  background: "rgba(255,255,255,0.08)",
                  boxShadow: "inset 0 0 10px rgba(0,0,0,0.35)",
                }}
              >
                <div
                  className="h-full joga-live-pressure-fill"
                  style={{
                    width: `${homePressureWidth}%`,
                    background: `linear-gradient(90deg, ${teamColors[activeHomeTeam]}, rgba(255,255,255,0.18))`,
                  }}
                />
                <div
                  className="h-full joga-live-pressure-fill"
                  style={{
                    width: `${100 - homePressureWidth}%`,
                    background: `linear-gradient(90deg, rgba(255,255,255,0.18), ${teamColors[activeAwayTeam]})`,
                  }}
                />
                <div className="absolute inset-y-0 left-1/2 w-[2px] bg-white/35" />
              </div>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-[1fr_1fr_auto] gap-2 px-4">
          <JogaButton
            variant={showNextGamePicker ? "ghost" : isRunning ? "gold" : "primary"}
            onClick={toggleTimer}
            disabled={showNextGamePicker}
            className="gap-2"
          >
            {isRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            {seconds === 0 && !isRunning ? "Iniciar" : isRunning ? "Pausar" : "Retomar"}
          </JogaButton>

          <JogaButton variant="arena" onClick={finalizarMiniJogo}>
            Finalizar jogo
          </JogaButton>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <JogaButton variant="ghost" size="icon" aria-label="Mais opções da pelada">
                <MoreVertical className="w-5 h-5" />
              </JogaButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[200px]">
              {isOrganizer && (
                <DropdownMenuItem onClick={() => setControllersDialogOpen(true)} className="gap-2 cursor-pointer">
                  Gerir controladores
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={reiniciarCronometro} className="gap-2 cursor-pointer">
                <RotateCcw className="w-4 h-4" />
                Reiniciar cronómetro
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={terminarPelada}
                className="gap-2 cursor-pointer text-red-500 focus:text-red-500"
              >
                <StopCircle className="w-4 h-4" />
                Terminar pelada
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {showNextGamePicker && (
          <section
            className="rounded-3xl p-4"
            style={{
              background: "linear-gradient(135deg, rgba(0,255,136,0.14) 0%, rgba(0,212,255,0.10) 50%, rgba(168,85,247,0.12) 100%)",
              border: "2px solid rgba(0,255,170,0.55)",
              boxShadow: "0 0 28px rgba(0,255,170,0.25), 0 0 60px rgba(0,212,255,0.12), inset 0 0 24px rgba(0,255,170,0.06)",
            }}
          >
            <p
              className="text-[11px] font-black uppercase tracking-[0.22em] mb-3"
              style={{
                color: "#5dffa8",
                textShadow: "0 0 12px rgba(93,255,168,0.8)",
              }}
            >
              {miniGames.length === 0 && events.length === 0 && scoreA === 0 && scoreB === 0 ? "⚡ Escolher jogo inicial" : "⚡ Escolher próximo mini jogo"}
            </p>

            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="block text-cyan-200/80 text-[10px] font-black uppercase mb-1">Casa</span>
                <select value={nextHomeTeam} onChange={(e) => void setNextTeams(matchId, e.target.value, nextAwayTeam)} className="w-full rounded-2xl p-3 bg-black/35 text-white border border-cyan-400/35 font-black" style={{ boxShadow: "0 0 12px rgba(34,211,238,0.15)" }}>
                  {visibleTeams.map((team) => <option key={team} value={team}>{teamNames[team]}</option>)}
                </select>
              </label>

              <label className="block">
                <span className="block text-fuchsia-200/80 text-[10px] font-black uppercase mb-1">Fora</span>
                <select value={nextAwayTeam} onChange={(e) => void setNextTeams(matchId, nextHomeTeam, e.target.value)} className="w-full rounded-2xl p-3 bg-black/35 text-white border border-fuchsia-400/35 font-black" style={{ boxShadow: "0 0 12px rgba(232,121,249,0.15)" }}>
                  {visibleTeams.map((team) => <option key={team} value={team}>{teamNames[team]}</option>)}
                </select>
              </label>
            </div>

            <button
              type="button"
              className="mt-3 w-full rounded-2xl py-3.5 font-display font-black text-base transition-transform active:scale-[0.98] cursor-pointer"
              style={{
                background: "linear-gradient(90deg, #00ff88 0%, #00d4ff 50%, #a855f7 100%)",
                color: "#04120a",
                border: "2px solid rgba(255,255,255,0.35)",
                boxShadow: "0 0 24px rgba(0,255,136,0.55), 0 0 48px rgba(0,212,255,0.25)",
                textShadow: "0 1px 0 rgba(255,255,255,0.35)",
              }}
              onClick={confirmarProximoJogo}
            >
              {miniGames.length === 0 && events.length === 0 && scoreA === 0 && scoreB === 0 ? "▶ Começar jogo" : "▶ Começar próximo jogo"}
            </button>
          </section>
        )}

        <section className="rounded-3xl overflow-hidden" style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.07)" }}>
          <div className="px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/25 mb-2">Registar ação para</p>

            {selectedPlayer && (
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center font-black text-white" style={{ background: `${teamColors[selectedTeam]}33`, border: `1px solid ${teamColors[selectedTeam]}66` }}>
                  {selectedPlayer.position}
                </div>

                <span className="font-display font-bold text-white text-base">{selectedPlayer.name}</span>

                <span className="ml-auto px-2.5 py-1 rounded-full text-[10px] font-black" style={{ background: `${teamColors[selectedTeam]}22`, color: teamColors[selectedTeam] }}>
                  {teamNames[selectedTeam]}
                </span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2">
            {allColumns.map((team) => {
              const isTeamActive = activeTeamsForGame.includes(team);

              return (
                <div key={team} style={{ borderRight: "1px solid rgba(255,255,255,0.06)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <div className="px-3 py-2.5" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    <p className="text-[10px] font-black uppercase tracking-[0.18em]" style={{ color: teamColors[team] }}>
                      {teamNames[team]}
                    </p>
                  </div>

                  {(playersByTeam[team] || []).map((player) => {
                    const isSelected = selectedPlayerId === player.id;

                    return (
                      <button
                        key={player.id}
                        onClick={() => {
                          if (!isTeamActive) return;
                          setSelectedPlayerId(player.id);
                        }}
                        disabled={!isTeamActive}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left"
                        style={{
                          background: isSelected ? `${teamColors[team]}18` : "transparent",
                          borderBottom: "1px solid rgba(255,255,255,0.04)",
                          opacity: isTeamActive ? 1 : 0.42,
                          cursor: isTeamActive ? "pointer" : "not-allowed",
                        }}
                      >
                        <span className="w-7 h-7 rounded-lg flex items-center justify-center font-black text-white text-[10px]" style={{ background: isSelected ? teamColors[team] : `${teamColors[team]}22` }}>
                          {player.position}
                        </span>

                        <span className="text-xs font-semibold truncate" style={{ color: isSelected ? teamColors[team] : "rgba(255,255,255,0.65)" }}>
                          {player.name.split(" ")[0]}
                        </span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </section>

        <section>
          <p className="text-[10px] font-black text-white/25 uppercase tracking-[0.22em] mb-3">Registar evento</p>

          <div className="grid grid-cols-5 gap-2.5">
            {eventTypes.map((event) => (
              <button
                key={event.key}
                onClick={() => addEvent(event.key)}
                className="flex flex-col items-center justify-center gap-1.5 py-4 rounded-2xl joga-live-action-btn"
                style={{
                  background: `${teamColors[selectedTeam]}22`,
                  border: `1px solid ${teamColors[selectedTeam]}44`,
                  opacity: canRegisterEvent ? 1 : 0.42,
                  cursor: canRegisterEvent ? "pointer" : "not-allowed",
                }}
              >
                <span className="text-2xl">{event.emoji}</span>
                <span className="text-white font-black text-[10px]">{event.label}</span>
              </button>
            ))}
          </div>

          {events.length > 0 && (
            <JogaButton
              variant="ghost"
              size="md"
              className="w-full mt-3 gap-2 border border-red-400/25 text-red-200"
              onClick={undoLastEventAction}
            >
              <RotateCcw className="w-4 h-4" />
              Desfazer último evento
            </JogaButton>
          )}
        </section>

        <section className="rounded-3xl p-4" style={{ background: "rgba(255,255,255,0.045)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <p className="text-[10px] font-black text-white/25 uppercase tracking-[0.22em] mb-3">Eventos do mini jogo</p>

          {events.length === 0 ? (
            <p className="text-white/35 text-sm">Nenhum evento ainda.</p>
          ) : (
            <div className="space-y-2">
              {events.map((event) => (
                <div
                  key={event.id}
                  className="flex items-center gap-2 text-sm rounded-xl px-2 py-2"
                  style={{ background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.05)" }}
                >
                  <span className="text-white/75 flex-1">{event.time} · {event.playerName}</span>
                  <span style={{ color: teamColors[event.team] }}>{eventTypes.find((item) => item.key === event.type)?.emoji}</span>
                  <button
                    onClick={() => removeEvent(event.id)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center font-black cursor-pointer joga-live-button"
                    style={{ background: "rgba(239,68,68,0.12)", color: "#fca5a5", border: "1px solid rgba(239,68,68,0.22)" }}
                    aria-label="Apagar evento"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {organizerId && (
        <ManageLiveControllersDialog
          open={controllersDialogOpen}
          onOpenChange={setControllersDialogOpen}
          matchId={matchId}
          organizerId={organizerId}
          liveControllerIds={liveControllerIds}
          players={players}
          onControllersChange={setLiveControllerIds}
        />
      )}

      {ConfirmDialog}
    </JogaPage>
  );
}
