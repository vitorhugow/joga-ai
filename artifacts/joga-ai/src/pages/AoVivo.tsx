import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { ChevronLeft, Pause, Play, RotateCcw, StopCircle, X } from "lucide-react";
import { loadPreMatch, type SavedPreMatch } from "@/lib/preMatchStorage";
import { loadMatchFromFirestore, saveMatchToFirestore, getMatchReturnPath } from "@/lib/matchRepository";
import { resetMatchFlowSession, resolveMatchId } from "@/lib/matchFlowStorage";
import { getCurrentUserId } from "@/lib/auth";
import {
  addLiveEvent,
  finalizeMiniGame,
  saveMiniGame,
} from "@/lib/liveMatchRepository";
import { useMatchPhaseGuard } from "@/hooks/useMatchPhaseGuard";
import { JogaButton, JogaCard, JogaPage } from "@/components/joga";
import { toast } from "@/hooks/use-toast";
import { useJogaConfirm } from "@/hooks/useJogaConfirm";

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
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const secs = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${secs}`;
}

export default function AoVivo() {
  const { confirm, ConfirmDialog } = useJogaConfirm();
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/partida/:id/ao-vivo");
  const matchId = resolveMatchId({ routeMatchId: params?.id });
  const returnTo = getMatchReturnPath();
  const { ready: phaseReady } = useMatchPhaseGuard(matchId, "ao-vivo");
  const [preMatch, setPreMatch] = useState<SavedPreMatch | null>(null);

  const [seconds, setSeconds] = useState(0);
  const [isRunning, setIsRunning] = useState(false);

  const [activeHomeTeam, setActiveHomeTeam] = useState<TeamKey>("A");
  const [activeAwayTeam, setActiveAwayTeam] = useState<TeamKey>("B");
  const [nextHomeTeam, setNextHomeTeam] = useState<TeamKey>("A");
  const [nextAwayTeam, setNextAwayTeam] = useState<TeamKey>("B");
  const [showNextGamePicker, setShowNextGamePicker] = useState(true);

  const [scoreA, setScoreA] = useState(0);
  const [scoreB, setScoreB] = useState(0);

  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [miniGames, setMiniGames] = useState<MiniGame[]>([]);
  const [showResumo, setShowResumo] = useState(false);

  const [playerTeams, setPlayerTeams] = useState<Record<string, TeamKey>>({});
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

  const [subTeam, setSubTeam] = useState<TeamKey>("A");
  const [subOut, setSubOut] = useState("");
  const [subIn, setSubIn] = useState("");

  useEffect(() => {
    if (!phaseReady) return;

    const data = loadPreMatch(matchId);
    setPreMatch(data);

    if (data) {
      setPlayerTeams(data.playerTeams as Record<string, TeamKey>);

      const first =
        data.players.find((player) => data.playerTeams[player.id] === "A") ||
        data.players.find((player) => data.playerTeams[player.id] === "B") ||
        data.players[0];

      setSelectedPlayerId(first?.id || null);
    }

    document.body.classList.add("joga-ai-ao-vivo-page");
    return () => document.body.classList.remove("joga-ai-ao-vivo-page");
  }, [matchId, phaseReady]);

  useEffect(() => {
    if (!isRunning) return;

    const interval = window.setInterval(() => {
      setSeconds((value) => value + 1);
    }, 1000);

    return () => window.clearInterval(interval);
  }, [isRunning]);

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
    if (!canRegisterEvent) {
      toast({ title: "O cronómetro precisa estar a correr para marcar eventos.", variant: "destructive" });
      return;
    }

    if (!selectedPlayer) return;

    const team = playerTeams[selectedPlayer.id] || "BENCH";

    if (!activeTeamsForGame.includes(team)) return;

    const event: LiveEvent = {
      id: `event-${Date.now()}`,
      type,
      playerId: selectedPlayer.id,
      playerName: selectedPlayer.name,
      team,
      time: formatTime(seconds),
    };

    setEvents((current) => [event, ...current]);

    if (type === "golo") {
      if (team === activeHomeTeam) setScoreA((value) => value + 1);
      if (team === activeAwayTeam) setScoreB((value) => value + 1);
    }

    // Persiste evento no Firestore (fire-and-forget)
    addLiveEvent(matchId, {
      type,
      playerId: selectedPlayer.id,
      playerName: selectedPlayer.name,
      team,
      time: event.time,
      miniGameId: `current-${activeHomeTeam}-vs-${activeAwayTeam}`,
    }).catch(console.warn);
  }

  function removeEvent(eventId: string) {
    const target = events.find((event) => event.id === eventId);
    if (!target) return;

    if (target.type === "golo") {
      if (target.team === activeHomeTeam) setScoreA((value) => Math.max(0, value - 1));
      if (target.team === activeAwayTeam) setScoreB((value) => Math.max(0, value - 1));
    }

    setEvents((current) => current.filter((event) => event.id !== eventId));
  }

  function resetTimer() {
    setSeconds(0);
    setIsRunning(false);
  }

  function toggleTimer() {
    if (showNextGamePicker) {
      toast({ title: "Escolhe primeiro quais equipas vão jogar este mini jogo.", variant: "destructive" });
      return;
    }

    setIsRunning((value) => !value);
  }

  async function finalizarMiniJogo() {
    if (showNextGamePicker) {
      toast({ title: "Escolhe as equipas antes de finalizar o mini jogo.", variant: "destructive" });
      return;
    }

    const ok = await confirm("Finalizar apenas este mini jogo? A pelada continuará aberta.");
    if (!ok) return;

    const winner = scoreA === scoreB ? "Empate" : scoreA > scoreB ? teamNames[activeHomeTeam] : teamNames[activeAwayTeam];
    const miniGameId = `game-${Date.now()}`;

    setMiniGames((current) => [
      ...current,
      {
        id: miniGameId,
        title: `${teamNames[activeHomeTeam]} ${scoreA} x ${scoreB} ${teamNames[activeAwayTeam]}`,
        scoreA,
        scoreB,
        homeTeam: activeHomeTeam,
        awayTeam: activeAwayTeam,
        events,
        winner,
      },
    ]);

    // Persiste mini-game no Firestore
    saveMiniGame(matchId, {
      id: miniGameId,
      title: `${teamNames[activeHomeTeam]} ${scoreA} x ${scoreB} ${teamNames[activeAwayTeam]}`,
      homeTeam: activeHomeTeam,
      awayTeam: activeAwayTeam,
      scoreA,
      scoreB,
      winner,
      order: Date.now(),
    }).catch(console.warn);
    finalizeMiniGame(matchId, miniGameId, { scoreA, scoreB, winner }).catch(console.warn);

    setScoreA(0);
    setScoreB(0);
    setEvents([]);
    setSeconds(0);
    setIsRunning(false);
    setNextHomeTeam(activeHomeTeam);
    setNextAwayTeam(activeAwayTeam);
    setShowNextGamePicker(true);
  }

  function confirmarProximoJogo() {
    if (nextHomeTeam === nextAwayTeam) {
      toast({ title: "Escolhe duas equipas diferentes.", variant: "destructive" });
      return;
    }

    setActiveHomeTeam(nextHomeTeam);
    setActiveAwayTeam(nextAwayTeam);
    setSubTeam(nextHomeTeam);
    setSubOut("");
    setSubIn("");

    const firstPlayer =
      players.find((player) => playerTeams[player.id] === nextHomeTeam) ||
      players.find((player) => playerTeams[player.id] === nextAwayTeam);

    setSelectedPlayerId(firstPlayer?.id || null);
    setShowNextGamePicker(false);
  }

  async function terminarPelada() {
    const ok = await confirm({
      description:
        "Terminar a pelada e abrir o resumo? Quem está no plantel recebe +1 Físico automaticamente.",
      confirmLabel: "Terminar pelada",
    });
    if (!ok) return;

    setIsRunning(false);

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

    resetMatchFlowSession(matchId);

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
      currentPlayerId: mePlayer?.id || existing?.currentPlayerId || "",
      miniGames: finalMiniGames,
      savedAt: new Date().toISOString(),
      title: existing?.title,
      communityId: existing?.communityId,
      organizerId: existing?.organizerId ?? getCurrentUserId(),
      votedUserIds: existing?.votedUserIds,
      waitlist: existing?.waitlist,
    } as const;

    await saveMatchToFirestore(
      matchId,
      postMatchData as Parameters<typeof saveMatchToFirestore>[1],
    );

    window.location.href = `/partida/${matchId}/pos-jogo`;
  }





  function confirmarSubstituicao() {
    if (!subOut || !subIn || subOut === subIn) return;

    const teamOfIncomingPlayer = playerTeams[subIn] || "BENCH";

    setPlayerTeams((current) => ({
      ...current,
      [subOut]: teamOfIncomingPlayer,
      [subIn]: subTeam,
    }));

    setSelectedPlayerId(subIn);
    setSubOut("");
    setSubIn("");
  }

  if (!phaseReady) {
    return (
      <JogaPage theme="arena" padded className="py-6" bottomSpace={false}>
        <JogaCard variant="arena" padding="lg" className="text-center">
          <p className="text-white/45 text-sm">A carregar partida…</p>
        </JogaCard>
      </JogaPage>
    );
  }

  if (!preMatch) {
    return (
      <JogaPage theme="arena" padded className="py-6" bottomSpace={false}>
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
      <JogaPage theme="arena" padded className="py-5" bottomSpace={false}>
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
    <JogaPage theme="arena" padded={false} bottomSpace={false} className="pb-8">
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

        <div className="grid grid-cols-2 gap-2 px-4">
          <JogaButton
            variant={showNextGamePicker ? "ghost" : isRunning ? "gold" : "primary"}
            onClick={toggleTimer}
            disabled={showNextGamePicker}
            className="gap-2"
          >
            {isRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            {seconds === 0 && !isRunning ? "Iniciar" : isRunning ? "Pausar" : "Retomar"}
          </JogaButton>

          <JogaButton variant="danger" onClick={resetTimer} className="gap-2">
            <RotateCcw className="w-4 h-4" />
            Reiniciar
          </JogaButton>

          <JogaButton variant="arena" onClick={finalizarMiniJogo}>
            Finalizar jogo
          </JogaButton>

          <JogaButton variant="danger" onClick={terminarPelada} className="gap-2">
            <StopCircle className="w-4 h-4" />
            Terminar pelada
          </JogaButton>
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
                <select value={nextHomeTeam} onChange={(e) => setNextHomeTeam(e.target.value as TeamKey)} className="w-full rounded-2xl p-3 bg-black/35 text-white border border-cyan-400/35 font-black" style={{ boxShadow: "0 0 12px rgba(34,211,238,0.15)" }}>
                  {visibleTeams.map((team) => <option key={team} value={team}>{teamNames[team]}</option>)}
                </select>
              </label>

              <label className="block">
                <span className="block text-fuchsia-200/80 text-[10px] font-black uppercase mb-1">Fora</span>
                <select value={nextAwayTeam} onChange={(e) => setNextAwayTeam(e.target.value as TeamKey)} className="w-full rounded-2xl p-3 bg-black/35 text-white border border-fuchsia-400/35 font-black" style={{ boxShadow: "0 0 12px rgba(232,121,249,0.15)" }}>
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
        </section>

        <section className="rounded-3xl p-4" style={{ background: "rgba(255,255,255,0.045)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <p className="text-[10px] font-black text-white/25 uppercase tracking-[0.22em] mb-3">Substituição</p>

          <div className="grid grid-cols-3 gap-2">
            <select
              value={subTeam}
              onChange={(e) => {
                setSubTeam(e.target.value as TeamKey);
                setSubOut("");
                setSubIn("");
              }}
              className="rounded-xl p-2 bg-white/5 text-white border border-white/10"
            >
              {activeTeamsForGame.map((team) => <option key={team} value={team}>{teamNames[team]}</option>)}
            </select>

            <select value={subOut} onChange={(e) => setSubOut(e.target.value)} className="rounded-xl p-2 bg-white/5 text-white border border-white/10">
              <option value="">Sai</option>
              {(playersByTeam[subTeam] || []).map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}
            </select>

            <select value={subIn} onChange={(e) => setSubIn(e.target.value)} className="rounded-xl p-2 bg-white/5 text-white border border-white/10">
              <option value="">Entra</option>
              {players
                .filter((player) => playerTeams[player.id] !== subTeam)
                .map((player) => {
                  const currentTeam = playerTeams[player.id] || "BENCH";
                  return (
                    <option key={player.id} value={player.id}>
                      {player.name} · {teamNames[currentTeam]}
                    </option>
                  );
                })}
            </select>
          </div>

          <p className="text-white/35 text-xs mt-2">
            O jogador que sai vai para a equipa de onde veio o jogador que entrou.
          </p>

          <JogaButton variant="outline" className="mt-3" onClick={confirmarSubstituicao}>
            Confirmar substituição
          </JogaButton>
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
      {ConfirmDialog}
    </JogaPage>
  );
}
