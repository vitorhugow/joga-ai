import { useEffect, useMemo, useState } from "react";
import { useLocation, useRoute } from "wouter";
import {
  AlertTriangle,
  CheckCircle,
  ChevronLeft,
  CreditCard,
  Plus,
  Play,
  Shuffle,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { mockData } from "@/data/mockData";
import { calculateOverall } from "@/lib/cardUtils";
import { savePreMatch } from "@/lib/preMatchStorage";
import { clearPostMatch } from "@/lib/postMatchStorage";
import { resetMatchFlowSession, resolveMatchId } from "@/lib/matchFlowStorage";
import { loadMatchDetails, type MatchDetails } from "@/lib/matchRepository";
import { JogaButton, JogaPage } from "@/components/joga";

const levelLabels: Record<string, string> = {
  recreativo: "Recreativo",
  misto: "Misto",
  competitivo: "Competitivo",
};

const gameTypeLabels: Record<string, string> = {
  futsal: "Futsal",
  fut5: "Fut 5",
  fut7: "Fut 7",
  futebol11: "Fut 11",
};

type GameMode = "fut5" | "fut7";
type TeamKey = "A" | "B" | "C" | "D";
type PlayerStatus = TeamKey | "BENCH";
type SortMode = "teams" | "az" | "over" | "paid";

type Player = {
  id: string;
  name: string;
  position: string;
  overall: number;
  paid: boolean;
  isMe?: boolean;
  manual?: boolean;
};

const isOrganizer = true;

const teamNames: Record<TeamKey, string> = {
  A: "Time A",
  B: "Time B",
  C: "Time C",
  D: "Time D",
};

const teamColors: Record<PlayerStatus, string> = {
  A: "#4ade80",
  B: "#60a5fa",
  C: "#fbbf24",
  D: "#fb7185",
  BENCH: "#94a3b8",
};

const posColors: Record<string, string> = {
  AVA: "#22c55e",
  DEF: "#60a5fa",
  MEI: "#c084fc",
  GR: "#fbbf24",
};

const initialPlayers: Player[] = [
  { id: "1", name: "Diogo Ferreira", position: "AVA", overall: calculateOverall(mockData.currentPlayer.attributes), paid: true, isMe: true },
  { id: "2", name: "João Silva", position: "DEF", overall: 65, paid: true },
  { id: "3", name: "Pedro Santos", position: "MEI", overall: 70, paid: false },
  { id: "4", name: "Miguel Costa", position: "GR", overall: 68, paid: true },
  { id: "5", name: "Rui Patrício", position: "AVA", overall: 62, paid: false },
  { id: "6", name: "Bruno Fernandes", position: "MEI", overall: 74, paid: true },
  { id: "7", name: "Carlos Sousa", position: "DEF", overall: 60, paid: true },
  { id: "8", name: "André Lima", position: "MEI", overall: 63, paid: false },
  { id: "9", name: "Tiago Rocha", position: "DEF", overall: 61, paid: true },
  { id: "10", name: "Nuno Alves", position: "AVA", overall: 64, paid: true },
  { id: "11", name: "Fábio Martins", position: "MEI", overall: 66, paid: false },
];

const communityPlayers: Player[] = [
  { id: "c1", name: "Gonçalo Pereira", position: "DEF", overall: 58, paid: false },
  { id: "c2", name: "Márcio Oliveira", position: "MEI", overall: 61, paid: false },
  { id: "c3", name: "Leandro Gomes", position: "AVA", overall: 64, paid: false },
  { id: "c4", name: "Samuel Costa", position: "GR", overall: 60, paid: false },
];

const formations = {
  fut5: {
    label: "Fut 5",
    slots: [
      { id: "gr", label: "GR", x: 12, y: 50 },
      { id: "def1", label: "DEF", x: 34, y: 28 },
      { id: "def2", label: "DEF", x: 34, y: 72 },
      { id: "mei", label: "MEI", x: 58, y: 50 },
      { id: "ava", label: "AVA", x: 82, y: 50 },
    ],
  },
  fut7: {
    label: "Fut 7",
    slots: [
      { id: "gr", label: "GR", x: 9, y: 50 },
      { id: "def1", label: "DEF", x: 28, y: 30 },
      { id: "def2", label: "DEF", x: 28, y: 70 },
      { id: "mei1", label: "MEI", x: 52, y: 25 },
      { id: "mei2", label: "MEI", x: 52, y: 50 },
      { id: "mei3", label: "MEI", x: 52, y: 75 },
      { id: "ava", label: "AVA", x: 80, y: 50 },
    ],
  },
} as const;

function makeSlot(team: TeamKey, slot: string) {
  return `${team}-${slot}`;
}

function getSlotTeam(slotId: string): TeamKey {
  return slotId.split("-")[0] as TeamKey;
}

function getPlayerSlot(assignments: Record<string, string | null>, playerId: string) {
  return Object.entries(assignments).find(([, value]) => value === playerId)?.[0] || null;
}

function getTeamSortRank(team?: PlayerStatus) {
  const order: Record<PlayerStatus, number> = {
    BENCH: 0,
    A: 1,
    B: 2,
    C: 3,
    D: 4,
  };

  return order[team || "BENCH"];
}

function PlayerBadge({ player }: { player: Player }) {
  const color = posColors[player.position] || "#9ca3af";

  return (
    <div className="flex items-center gap-2 min-w-0">
      <div
        className="w-10 h-10 rounded-xl flex flex-col items-center justify-center shrink-0"
        style={{ background: `${color}18`, border: `1.5px solid ${color}44` }}
      >
        <span className="font-display font-black leading-none text-white text-[0.95rem]">{player.overall}</span>
        <span className="font-bold text-[0.48rem] tracking-wider" style={{ color }}>{player.position}</span>
      </div>

      <div className="min-w-0">
        <div className="flex items-center gap-1">
          {!player.paid && <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />}
          <p className="text-sm font-bold text-white/85 truncate">{player.name}</p>
        </div>

        <p className={player.paid ? "text-[11px] font-bold text-emerald-300/80" : "text-[11px] font-black text-red-300"}>
          {player.paid ? "Pago" : "Pendente"}
        </p>
      </div>
    </div>
  );
}

function SlotPlayer({
  slotId,
  label,
  player,
  onClick,
  teamColor,
}: {
  slotId: string;
  label: string;
  player?: Player;
  onClick: () => void;
  teamColor: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={!isOrganizer}
      className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1 active:scale-95 transition-transform cursor-pointer"
      style={{ touchAction: "manipulation" }}
      data-testid={`slot-${slotId}`}
    >
      <div
        className="w-[46px] h-[58px] rounded-xl flex flex-col items-center justify-between px-1 py-1 text-[10px] font-black"
        style={{
          background: player
            ? `linear-gradient(180deg, ${teamColor}30, rgba(0,0,0,0.72))`
            : "rgba(255,255,255,0.06)",
          border: player ? `1.8px solid ${teamColor}` : "1.5px dashed rgba(255,255,255,0.35)",
          color: player ? "#ffffff" : "rgba(255,255,255,0.48)",
          boxShadow: player ? `0 0 16px ${teamColor}55` : "none",
        }}
      >
        <span className="font-display font-black text-base leading-none">
          {player ? player.overall : "+"}
        </span>
        <span className="w-full h-px" style={{ background: player ? `${teamColor}88` : "rgba(255,255,255,0.18)" }} />
        <span className="max-w-full truncate text-[9px] leading-none">
          {player ? player.name.split(" ")[0] : label}
        </span>
      </div>
    </button>
  );
}

function PlayerPicker({
  open,
  title,
  players,
  currentPlayerId,
  playerTeams,
  teamNamesMap,
  onPick,
  onClear,
  onClose,
}: {
  open: boolean;
  title: string;
  players: Player[];
  currentPlayerId?: string | null;
  playerTeams: Record<string, PlayerStatus>;
  teamNamesMap: Record<TeamKey, string>;
  onPick: (playerId: string) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end" style={{ background: "rgba(0,0,0,0.68)" }}>
      <div className="w-full rounded-t-[28px] p-4 max-h-[78vh] overflow-y-auto" style={{ background: "#0a0f1a", border: "1px solid rgba(255,255,255,0.10)" }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-white/35 text-[10px] font-black uppercase tracking-[0.22em]">Escolher jogador</p>
            <h3 className="font-display font-black text-white text-xl">{title}</h3>
          </div>

          <button onClick={onClose} className="w-10 h-10 rounded-2xl flex items-center justify-center cursor-pointer" style={{ background: "rgba(255,255,255,0.06)" }}>
            <X className="w-5 h-5 text-white/65" />
          </button>
        </div>

        {currentPlayerId && (
          <button
            onClick={() => {
              onClear();
              onClose();
            }}
            className="w-full mb-3 rounded-2xl px-4 py-3 flex items-center justify-center gap-2 font-black text-sm cursor-pointer"
            style={{ background: "rgba(239,68,68,0.12)", color: "#f87171", border: "1px solid rgba(239,68,68,0.2)" }}
          >
            <Trash2 className="w-4 h-4" />
            Remover desta posição
          </button>
        )}

        <div className="space-y-2">
          {players.map((player) => {
            const status = playerTeams[player.id] || "BENCH";
            const statusLabel = status === "BENCH" ? "Banco" : teamNamesMap[status];

            return (
              <button
                key={player.id}
                onClick={() => {
                  onPick(player.id);
                  onClose();
                }}
                className="w-full rounded-2xl px-4 py-3 flex items-center justify-between active:scale-[0.99] transition-transform cursor-pointer"
                style={{ background: "rgba(255,255,255,0.045)", border: "1px solid rgba(255,255,255,0.07)" }}
              >
                <PlayerBadge player={player} />
                <div className="text-right">
                  <span className="block text-[11px] font-black text-emerald-300">Escolher</span>
                  <span className="block text-[10px] font-bold mt-1" style={{ color: teamColors[status] }}>
                    {statusLabel}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function PreJogo() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/partida/:id/pre-jogo");
  const matchId = resolveMatchId({ routeMatchId: params?.id });
  const returnTo = new URLSearchParams(window.location.search).get("from") || "/jogos";
  const [matchDetails, setMatchDetails] = useState<MatchDetails | null>(null);

  useEffect(() => {
    setMatchDetails(loadMatchDetails(matchId));
  }, [matchId]);

  const [gameMode, setGameMode] = useState<GameMode>("fut5");
  const [teamCount, setTeamCount] = useState<2 | 3 | 4>(2);
  const [players, setPlayers] = useState<Player[]>(initialPlayers);
  const [manualName, setManualName] = useState("");
  const [showCommunityList, setShowCommunityList] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("teams");

  const activeTeams = (["A", "B", "C", "D"] as TeamKey[]).slice(0, teamCount);

  // Por padrão, todos ficam no Banco por fallback.
  const [playerTeams, setPlayerTeams] = useState<Record<string, PlayerStatus>>({});
  const [assignments, setAssignments] = useState<Record<string, string | null>>({});
  const [pickerSlot, setPickerSlot] = useState<string | null>(null);

  function rebuildField(mode: GameMode) {
    setGameMode(mode);

    setAssignments((current) => {
      const next: Record<string, string | null> = {};

      for (const team of ["A", "B"] as TeamKey[]) {
        for (const slot of formations[mode].slots) {
          const slotId = makeSlot(team, slot.id);
          next[slotId] = current[slotId] || null;
        }
      }

      return next;
    });
  }

  function changeTeamCount(count: 2 | 3 | 4) {
    setTeamCount(count);

    const allowedTeams = (["A", "B", "C", "D"] as TeamKey[]).slice(0, count);

    setPlayerTeams((current) => {
      const next = { ...current };

      for (const playerId of Object.keys(next)) {
        const status = next[playerId];

        if (status !== "BENCH" && !allowedTeams.includes(status)) {
          next[playerId] = "BENCH";
        }
      }

      return next;
    });
  }

  function assignPlayerToSlot(slotId: string, playerId: string) {
    const team = getSlotTeam(slotId);
    const previousPlayerId = assignments[slotId];

    setAssignments((current) => {
      const next = { ...current };

      for (const key of Object.keys(next)) {
        if (next[key] === playerId) next[key] = null;
      }

      next[slotId] = playerId;
      return next;
    });

    setPlayerTeams((current) => ({
      ...current,
      ...(previousPlayerId && previousPlayerId !== playerId ? { [previousPlayerId]: "BENCH" as PlayerStatus } : {}),
      [playerId]: team,
    }));
  }

  function clearSlot(slotId: string) {
    const currentPlayer = assignments[slotId];

    setAssignments((current) => ({
      ...current,
      [slotId]: null,
    }));

    if (currentPlayer) {
      setPlayerTeams((current) => ({
        ...current,
        [currentPlayer]: "BENCH",
      }));
    }
  }

  function moveToTeam(playerId: string, team: PlayerStatus) {
    const nextAssignments = { ...assignments };

    for (const key of Object.keys(nextAssignments)) {
      if (nextAssignments[key] === playerId) {
        nextAssignments[key] = null;
      }
    }

    if (team === "A" || team === "B") {
      const emptySlot = formations[gameMode].slots
        .map((slot) => makeSlot(team, slot.id))
        .find((slotId) => !nextAssignments[slotId]);

      if (emptySlot) {
        nextAssignments[emptySlot] = playerId;
      }
      // Sem vaga no campo: jogador fica na equipa como reserva (banco do time).
    }

    setAssignments(nextAssignments);

    setPlayerTeams((current) => ({
      ...current,
      [playerId]: team,
    }));
  }

  function addCommunityPlayer(player: Player) {
    if (players.some((item) => item.id === player.id)) return;

    setPlayers((current) => [...current, player]);

    setPlayerTeams((current) => ({
      ...current,
      [player.id]: "BENCH",
    }));

    setShowCommunityList(false);
    setManualName("");
  }

  function addManualPlayer() {
    const name = manualName.trim();
    if (!name) return;

    const id = `manual-${Date.now()}`;

    setPlayers((current) => [
      ...current,
      {
        id,
        name,
        position: "MEI",
        overall: 50,
        paid: false,
        manual: true,
      },
    ]);

    setPlayerTeams((current) => ({
      ...current,
      [id]: "BENCH",
    }));

    setManualName("");
  }

  function randomizeTeams() {
    const ok = window.confirm("Dividir jogadores em times completos e equilibrados?");
    if (!ok) return;

    const teams = activeTeams;
    const fieldSize = formations[gameMode].slots.length;

    const buckets: Record<TeamKey, Player[]> = { A: [], B: [], C: [], D: [] };
    const targetSizes: Record<TeamKey, number> = { A: 0, B: 0, C: 0, D: 0 };

    // 1) Primeiro decide quantos times completos existem.
    // A e B são prioridade porque começam no campo.
    // C só aparece se tiver jogador suficiente para completar.
    // D só aparece se também tiver jogador suficiente para completar.
    let remaining = players.length;

    const fixedOrder = (["A", "B", "C", "D"] as TeamKey[]).filter((team) => teams.includes(team));

    for (const team of fixedOrder) {
      if (remaining >= fieldSize) {
        targetSizes[team] = fieldSize;
        remaining -= fieldSize;
      }
    }

    // Se não der nem para completar A/B, divide o que tiver entre A e B.
    if (targetSizes.A === 0 && targetSizes.B === 0) {
      const starterTeams = (["A", "B"] as TeamKey[]).filter((team) => teams.includes(team));
      const base = Math.floor(players.length / starterTeams.length);
      const extra = players.length % starterTeams.length;

      starterTeams.forEach((team, index) => {
        targetSizes[team] = base + (index < extra ? 1 : 0);
      });

      remaining = 0;
    }

    const teamsWithTarget = teams.filter((team) => targetSizes[team] > 0);

    const shuffle = <T,>(items: T[]) => {
      return [...items]
        .map((item) => ({ item, random: Math.random() }))
        .sort((a, b) => a.random - b.random)
        .map(({ item }) => item);
    };

    const teamTotal = (team: TeamKey) => {
      return buckets[team].reduce((sum, player) => sum + player.overall, 0);
    };

    const teamAverage = (team: TeamKey) => {
      if (buckets[team].length === 0) return 0;
      return teamTotal(team) / buckets[team].length;
    };

    const hasPosition = (team: TeamKey, position: string) => {
      return buckets[team].some((player) => player.position === position);
    };

    const compensation = (team: TeamKey) => {
      let value = 0;

      // Time sem GR pode ser aproximadamente 1 ponto mais forte.
      if (!hasPosition(team, "GR")) value += 1;

      // DEF é mais importante no Fut 7, mas ainda conta no Fut 5.
      if (!hasPosition(team, "DEF")) value += gameMode === "fut7" ? 1 : 0.75;

      return value;
    };

    const effectiveAverage = (team: TeamKey) => {
      return teamAverage(team) - compensation(team);
    };

    const hasSpace = (team: TeamKey) => {
      return buckets[team].length < targetSizes[team];
    };

    const projectedScore = (team: TeamKey, player: Player, spreadPosition: boolean) => {
      const projectedPlayers = [...buckets[team], player];
      const projectedAverage = projectedPlayers.reduce((sum, item) => sum + item.overall, 0) / projectedPlayers.length;

      const wouldHaveGR = projectedPlayers.some((item) => item.position === "GR");
      const wouldHaveDEF = projectedPlayers.some((item) => item.position === "DEF");

      let projectedCompensation = 0;
      if (!wouldHaveGR) projectedCompensation += 1;
      if (!wouldHaveDEF) projectedCompensation += gameMode === "fut7" ? 1 : 0.75;

      const repeatPositionPenalty = spreadPosition && hasPosition(team, player.position) ? 0.65 : 0;
      const sizePressure = projectedPlayers.length / Math.max(1, targetSizes[team]);

      return projectedAverage - projectedCompensation + repeatPositionPenalty + sizePressure * 0.15;
    };

    const chooseBestTeamForPlayer = (player: Player, spreadPosition: boolean) => {
      const candidates = teamsWithTarget.filter((team) => hasSpace(team));
      if (candidates.length === 0) return null;

      return [...candidates]
        .map((team) => ({ team, random: Math.random() }))
        .sort((a, b) => {
          const scoreDiff = projectedScore(a.team, player, spreadPosition) - projectedScore(b.team, player, spreadPosition);
          if (Math.abs(scoreDiff) > 0.01) return scoreDiff;

          const totalDiff = teamTotal(a.team) - teamTotal(b.team);
          if (totalDiff !== 0) return totalDiff;

          const sizeDiff = buckets[a.team].length - buckets[b.team].length;
          if (sizeDiff !== 0) return sizeDiff;

          return a.random - b.random;
        })[0].team;
    };

    const assignedIds = new Set<string>();

    const assignPlayer = (player: Player, spreadPosition: boolean) => {
      if (assignedIds.has(player.id)) return;

      const team = chooseBestTeamForPlayer(player, spreadPosition);
      if (!team) return;

      buckets[team].push(player);
      assignedIds.add(player.id);
    };

    const assignPositionGroup = (position: string, spreadPosition: boolean) => {
      const group = shuffle(players.filter((player) => player.position === position && !assignedIds.has(player.id)))
        .sort((a, b) => b.overall - a.overall);

      for (const player of group) {
        assignPlayer(player, spreadPosition);
      }
    };

    // 2) Depois equilibra pensando dentro dos times já definidos.
    // Fut 5: GR primeiro, depois equilíbrio geral.
    // Fut 7: GR primeiro, DEF depois, depois equilíbrio geral.
    assignPositionGroup("GR", true);
    assignPositionGroup("DEF", true);
    assignPositionGroup("MEI", true);
    assignPositionGroup("AVA", true);

    const remainingPlayers = shuffle(players.filter((player) => !assignedIds.has(player.id)))
      .sort((a, b) => b.overall - a.overall);

    for (const player of remainingPlayers) {
      assignPlayer(player, true);
    }

    // 3) Pequena revisão final: tenta trocar jogadores entre times para reduzir diferença de média efetiva.
    const balanceScore = () => {
      if (teamsWithTarget.length <= 1) return 0;

      const averages = teamsWithTarget.map((team) => effectiveAverage(team));
      const maxAverage = Math.max(...averages);
      const minAverage = Math.min(...averages);

      return maxAverage - minAverage;
    };

    let improved = true;
    let guard = 0;

    while (improved && guard < 80) {
      improved = false;
      guard += 1;

      const currentScore = balanceScore();

      for (const teamA of teamsWithTarget) {
        for (const teamB of teamsWithTarget) {
          if (teamA === teamB) continue;

          for (let indexA = 0; indexA < buckets[teamA].length; indexA += 1) {
            for (let indexB = 0; indexB < buckets[teamB].length; indexB += 1) {
              const playerA = buckets[teamA][indexA];
              const playerB = buckets[teamB][indexB];

              buckets[teamA][indexA] = playerB;
              buckets[teamB][indexB] = playerA;

              const newScore = balanceScore();

              if (newScore + 0.15 < currentScore) {
                improved = true;
                break;
              }

              buckets[teamA][indexA] = playerA;
              buckets[teamB][indexB] = playerB;
            }

            if (improved) break;
          }

          if (improved) break;
        }

        if (improved) break;
      }
    }

    const nextPlayerTeams: Record<string, PlayerStatus> = {};

    // Quem não couber em time completo fica Banco.
    for (const player of players) {
      nextPlayerTeams[player.id] = "BENCH";
    }

    for (const team of teamsWithTarget) {
      for (const player of buckets[team]) {
        nextPlayerTeams[player.id] = team;
      }
    }

    const nextAssignments: Record<string, string | null> = {};

    for (const team of ["A", "B"] as TeamKey[]) {
      for (const slot of formations[gameMode].slots) {
        nextAssignments[makeSlot(team, slot.id)] = null;
      }
    }

    // A e B entram no campo automaticamente.
    for (const team of ["A", "B"] as TeamKey[]) {
      if (!teamsWithTarget.includes(team)) continue;

      const usedPlayerIds = new Set<string>();
      const teamPlayers = [...buckets[team]];

      for (const slot of formations[gameMode].slots) {
        const availablePlayers = teamPlayers.filter((player) => !usedPlayerIds.has(player.id));
        if (availablePlayers.length === 0) continue;

        const samePosition = availablePlayers.filter((player) => player.position === slot.label);
        const candidates = samePosition.length > 0 ? samePosition : availablePlayers;

        const chosen = [...candidates].sort((a, b) => b.overall - a.overall)[0];

        nextAssignments[makeSlot(team, slot.id)] = chosen.id;
        usedPlayerIds.add(chosen.id);
      }
    }

    setPlayerTeams(nextPlayerTeams);
    setAssignments(nextAssignments);
    setSortMode("teams");
  }

  function clearAllTeams() {
    const ok = window.confirm("Colocar todos os jogadores no Banco e limpar o campo?");
    if (!ok) return;

    setPlayerTeams(() => {
      const next: Record<string, PlayerStatus> = {};

      for (const player of players) {
        next[player.id] = "BENCH";
      }

      return next;
    });

    setAssignments((current) => {
      const next = { ...current };

      for (const key of Object.keys(next)) {
        next[key] = null;
      }

      return next;
    });

    setSortMode("teams");
  }

  function removePlayer(playerId: string) {
    setPlayers((current) => current.filter((player) => player.id !== playerId));

    setAssignments((current) => {
      const next = { ...current };

      for (const key of Object.keys(next)) {
        if (next[key] === playerId) next[key] = null;
      }

      return next;
    });

    setPlayerTeams((current) => {
      const next = { ...current };
      delete next[playerId];
      return next;
    });
  }

  function togglePaid(playerId: string) {
    setPlayers((current) =>
      current.map((player) =>
        player.id === playerId ? { ...player, paid: !player.paid } : player
      )
    );
  }

  const selectedSlot = pickerSlot;
  const selectedSlotPlayerId = selectedSlot ? assignments[selectedSlot] : null;

  const teamBuckets = useMemo(() => {
    const buckets: Record<PlayerStatus, Player[]> = { A: [], B: [], C: [], D: [], BENCH: [] };

    for (const player of players) {
      buckets[playerTeams[player.id] || "BENCH"].push(player);
    }

    return buckets;
  }, [players, playerTeams]);

  const pickerPlayers = useMemo(() => {
    return [...players].sort((a, b) => {
      const teamA = playerTeams[a.id] || "BENCH";
      const teamB = playerTeams[b.id] || "BENCH";

      return getTeamSortRank(teamA) - getTeamSortRank(teamB) || a.name.localeCompare(b.name);
    });
  }, [players, playerTeams]);

  const visiblePlayers = useMemo(() => {
    const list = [...players];

    if (sortMode === "teams") {
      return list.sort((a, b) => {
        const aTeam = playerTeams[a.id] || "BENCH";
        const bTeam = playerTeams[b.id] || "BENCH";

        return getTeamSortRank(aTeam) - getTeamSortRank(bTeam) || a.name.localeCompare(b.name);
      });
    }

    if (sortMode === "az") return list.sort((a, b) => a.name.localeCompare(b.name));
    if (sortMode === "over") return list.sort((a, b) => b.overall - a.overall);
    return list.sort((a, b) => Number(b.paid) - Number(a.paid));
  }, [players, playerTeams, sortMode]);

  const communityPlayersNotInMatch = communityPlayers.filter(
    (communityPlayer) =>
      !players.some((player) => player.id === communityPlayer.id) &&
      communityPlayer.name.toLowerCase().includes(manualName.toLowerCase())
  );

  const totalPaid = players.filter((player) => player.paid).length;
  const benchCount = teamBuckets.BENCH.length;
  const teamsWithPlayers = (["A", "B", "C", "D"] as TeamKey[]).filter((team) => teamBuckets[team].length > 0).length;

  return (
    <JogaPage theme="dark" padded={false}>
      <div className="relative overflow-hidden" style={{ background: "linear-gradient(155deg, #031408 0%, #052010 28%, #0a5a1e 65%, #0d6826 100%)" }}>
        <div className="relative flex items-center justify-between px-4 pt-5 pb-2">
          <button
            onClick={() => setLocation(returnTo)}
            className="w-10 h-10 rounded-2xl flex items-center justify-center cursor-pointer"
            style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)" }}
          >
            <ChevronLeft className="w-5 h-5 text-white" />
          </button>

          <p className="text-white/40 text-[10px] font-black uppercase tracking-[0.22em]">Pré-Jogo Editável</p>
          <div className="w-10" />
        </div>

        <div className="relative px-5 pb-8 pt-3">
          <h1 className="font-display font-black text-white text-2xl leading-tight tracking-tight">
            {matchDetails?.title || "Time A x Time B"}
          </h1>

          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className="text-white/50 text-sm">
              📍 {matchDetails?.location || "Local a definir"}
              {matchDetails?.city ? `, ${matchDetails.city}` : ""}
            </span>
            {matchDetails?.date && (
              <>
                <span className="text-white/25">·</span>
                <span className="text-white/50 text-sm">🕐 {matchDetails.date}</span>
              </>
            )}
          </div>

          {matchDetails && (
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className="text-[11px] font-semibold px-2.5 py-1 rounded-lg" style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.55)" }}>
                ⚽ {gameTypeLabels[matchDetails.gameType] || matchDetails.gameType}
              </span>
              <span className="text-[11px] font-semibold px-2.5 py-1 rounded-lg" style={{ background: "rgba(74,222,128,0.1)", color: "#4ade80" }}>
                {levelLabels[matchDetails.level] || matchDetails.level}
              </span>
              {matchDetails.price && (
                <span className="text-[11px] font-semibold px-2.5 py-1 rounded-lg" style={{ background: "rgba(96,165,250,0.1)", color: "#60a5fa" }}>
                  {matchDetails.price}{matchDetails.price.toLowerCase().includes("grát") ? "" : "/jogador"}
                </span>
              )}
              {matchDetails.spotsRemaining && (
                <span className="text-[11px] font-semibold px-2.5 py-1 rounded-lg" style={{ background: "rgba(251,191,36,0.1)", color: "#fbbf24" }}>
                  {matchDetails.spotsRemaining}
                </span>
              )}
            </div>
          )}

          {matchDetails?.organizerName && (
            <p className="text-white/40 text-xs mt-2">
              Organizador: <span className="text-white/60 font-semibold">{matchDetails.organizerName}</span>
              {matchDetails.openToExternal === false && " · Apenas comunidade"}
            </p>
          )}

          {matchDetails?.notes && (
            <p className="text-white/45 text-sm mt-2 leading-relaxed">{matchDetails.notes}</p>
          )}

          <div className="grid grid-cols-4 gap-2 mt-5">
            {[
              { value: players.length, label: "Confirmados", color: "#4ade80", bg: "rgba(74,222,128,0.12)", border: "rgba(74,222,128,0.25)", icon: <CheckCircle className="w-3.5 h-3.5" /> },
              { value: `${totalPaid}/${players.length}`, label: "Pagos", color: "#60a5fa", bg: "rgba(96,165,250,0.12)", border: "rgba(96,165,250,0.25)", icon: <CreditCard className="w-3.5 h-3.5" /> },
              { value: teamsWithPlayers, label: "Times", color: "#a78bfa", bg: "rgba(167,139,250,0.12)", border: "rgba(167,139,250,0.25)", icon: <Users className="w-3.5 h-3.5" /> },
              { value: benchCount, label: "Banco", color: "#fbbf24", bg: "rgba(251,191,36,0.12)", border: "rgba(251,191,36,0.25)", icon: <Users className="w-3.5 h-3.5" /> },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl py-3 flex flex-col items-center gap-1" style={{ background: item.bg, border: `1px solid ${item.border}` }}>
                <div style={{ color: item.color }}>{item.icon}</div>
                <p className="font-display font-black text-xl leading-none text-white">{item.value}</p>
                <p className="text-[8px] font-bold uppercase tracking-wide text-center" style={{ color: item.color, opacity: 0.8 }}>{item.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="px-4 space-y-5 pt-5">
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display font-black text-white text-lg">Tipo de jogo</h2>
            <span className="text-white/35 text-[11px] font-bold">Campo adapta posições</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {(["fut5", "fut7"] as GameMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => rebuildField(mode)}
                className="rounded-2xl py-3 font-black text-sm cursor-pointer"
                style={gameMode === mode
                  ? { background: "rgba(74,222,128,0.16)", color: "#4ade80", border: "1px solid rgba(74,222,128,0.28)" }
                  : { background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.4)", border: "1px solid rgba(255,255,255,0.07)" }
                }
              >
                {formations[mode].label}
              </button>
            ))}
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display font-black text-white text-lg">Quantos times?</h2>
            <span className="text-white/35 text-[11px] font-bold">Máximo 4</span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {([2, 3, 4] as const).map((count) => (
              <button
                key={count}
                onClick={() => changeTeamCount(count)}
                className="rounded-2xl py-3 font-black text-sm cursor-pointer"
                style={teamCount === count
                  ? { background: "rgba(74,222,128,0.16)", color: "#4ade80", border: "1px solid rgba(74,222,128,0.28)" }
                  : { background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.4)", border: "1px solid rgba(255,255,255,0.07)" }
                }
              >
                {count} times
              </button>
            ))}
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display font-black text-white text-lg">Campo</h2>
            <span className="text-xs font-bold px-2.5 py-1 rounded-full text-white/40" style={{ background: "rgba(255,255,255,0.06)" }}>
              Time A x Time B
            </span>
          </div>

          <div
            className="relative rounded-[28px] overflow-hidden h-[460px] mx-auto"
            style={{
              width: "min(100%, 560px)",
              background: "linear-gradient(180deg, rgba(22,101,52,0.98), rgba(5,46,22,0.98))",
              border: "1px solid rgba(255,255,255,0.11)",
            }}
          >
            <div className="absolute inset-y-0 left-1/2 w-[4px] bg-white/30" />
            <div className="absolute left-1/2 top-1/2 w-24 h-24 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white/22" />

            <div className="absolute left-0 top-1/2 w-[13%] h-[40%] -translate-y-1/2 border-y-[3px] border-r-[3px] border-white/28 rounded-r-2xl" />
            <div className="absolute right-0 top-1/2 w-[13%] h-[40%] -translate-y-1/2 border-y-[3px] border-l-[3px] border-white/28 rounded-l-2xl" />
            <div className="absolute left-0 top-1/2 w-[5%] h-[18%] -translate-y-1/2 border-y-[3px] border-r-[3px] border-white/32 rounded-r-xl" />
            <div className="absolute right-0 top-1/2 w-[5%] h-[18%] -translate-y-1/2 border-y-[3px] border-l-[3px] border-white/32 rounded-l-xl" />

            <div className="absolute top-3 left-[25%] -translate-x-1/2 text-white/45 text-[11px] font-black uppercase">Time A</div>
            <div className="absolute top-3 left-[75%] -translate-x-1/2 text-white/45 text-[11px] font-black uppercase">Time B</div>

            {(["A", "B"] as TeamKey[]).flatMap((team) => {
              return formations[gameMode].slots.map((slot) => {
                const slotId = makeSlot(team, slot.id);
                const playerId = assignments[slotId];
                const player = players.find((item) => item.id === playerId);

                const x = team === "A" ? 8 + slot.x * 0.38 : 92 - slot.x * 0.38;
                const y = slot.y;

                return (
                  <div key={slotId} style={{ position: "absolute", left: `${x}%`, top: `${y}%` }}>
                    <SlotPlayer
                      slotId={slotId}
                      label={slot.label}
                      player={player}
                      teamColor={teamColors[team]}
                      onClick={() => setPickerSlot(slotId)}
                    />
                  </div>
                );
              });
            })}
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display font-black text-white text-lg">Adicionar jogador</h2>
          </div>

          <div className="flex gap-2">
            <input
              value={manualName}
              onFocus={() => setShowCommunityList(true)}
              onChange={(event) => {
                setManualName(event.target.value);
                setShowCommunityList(true);
              }}
              placeholder="Buscar na comunidade ou adicionar manual"
              className="flex-1 rounded-2xl px-4 py-3 bg-white/5 border border-white/10 text-white outline-hidden"
              disabled={!isOrganizer}
            />

            <button
              onClick={addManualPlayer}
              className="w-12 rounded-2xl flex items-center justify-center cursor-pointer"
              style={{ background: "rgba(74,222,128,0.16)", border: "1px solid rgba(74,222,128,0.28)" }}
              disabled={!isOrganizer}
            >
              <Plus className="w-5 h-5 text-emerald-300" />
            </button>
          </div>

          {showCommunityList && (
            <div className="mt-2 rounded-2xl overflow-hidden" style={{ background: "rgba(255,255,255,0.045)", border: "1px solid rgba(255,255,255,0.08)" }}>
              {communityPlayersNotInMatch.length > 0 ? (
                communityPlayersNotInMatch.map((player) => (
                  <button
                    key={player.id}
                    onClick={() => addCommunityPlayer(player)}
                    className="w-full px-4 py-3 flex items-center justify-between cursor-pointer"
                    style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
                  >
                    <PlayerBadge player={player} />
                    <span className="text-[11px] font-black text-emerald-300">Adicionar</span>
                  </button>
                ))
              ) : (
                <div className="px-4 py-3 text-white/35 text-xs font-bold">
                  Nenhum jogador encontrado. Clica no + para adicionar manualmente.
                </div>
              )}
            </div>
          )}
        </section>

        {(["C", "D"] as TeamKey[]).filter((team) => activeTeams.includes(team)).map((team) => (
          <section key={team}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display font-black text-white text-lg">{teamNames[team]}</h2>
              <span className="text-xs font-bold px-2.5 py-1 rounded-full text-white/40" style={{ background: "rgba(255,255,255,0.06)" }}>
                Fora do campo
              </span>
            </div>

            <div className="space-y-2">
              {teamBuckets[team].length === 0 ? (
                <div className="rounded-2xl p-4 text-center border border-dashed border-white/12 text-white/30 text-sm font-bold">
                  Nenhum jogador neste time
                </div>
              ) : (
                teamBuckets[team].map((player) => (
                  <div key={player.id} className="rounded-2xl px-4 py-3 flex items-center justify-between" style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${teamColors[team]}33` }}>
                    <PlayerBadge player={player} />
                    <button onClick={() => moveToTeam(player.id, "BENCH")} className="text-[11px] font-black text-white/35 cursor-pointer">
                      Banco
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>
        ))}

        <section>
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="font-display font-black text-white text-lg">Confirmados</h2>

            <div className="flex items-center gap-2">
              <button
                onClick={clearAllTeams}
                className="rounded-2xl px-3 py-2 text-[11px] font-black cursor-pointer"
                style={{
                  background: "rgba(251,191,36,0.12)",
                  color: "#fbbf24",
                  border: "1px solid rgba(251,191,36,0.25)",
                }}
              >
                Limpar times
              </button>

              <button
                onClick={randomizeTeams}
                className="rounded-2xl px-3 py-2 text-[11px] font-black cursor-pointer flex items-center gap-1"
                style={{
                  background: "rgba(74,222,128,0.13)",
                  color: "#4ade80",
                  border: "1px solid rgba(74,222,128,0.26)",
                }}
              >
                <Shuffle className="w-3.5 h-3.5" />
                Aleatório
              </button>

              <select
                value={sortMode}
                onChange={(event) => setSortMode(event.target.value as SortMode)}
                className="rounded-xl px-2 py-2 bg-white/5 border border-white/10 text-white text-[11px] font-black outline-hidden cursor-pointer"
              >
                <option value="teams">Times</option>
                <option value="az">A-Z</option>
                <option value="over">Overall</option>
                <option value="paid">Pagos</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            {visiblePlayers.map((player) => {
              const team = playerTeams[player.id] || "BENCH";
              const slot = getPlayerSlot(assignments, player.id);
              const statusColor = teamColors[team];

              return (
                <div
                  key={player.id}
                  className="rounded-2xl px-4 py-3"
                  style={{
                    background: player.isMe ? "rgba(74,222,128,0.07)" : "rgba(255,255,255,0.04)",
                    border: player.isMe ? "1.5px solid rgba(74,222,128,0.2)" : `1px solid ${statusColor}38`,
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <PlayerBadge player={player} />
                    </div>

                    <select
                      value={team}
                      onChange={(event) => moveToTeam(player.id, event.target.value as PlayerStatus)}
                      className="rounded-xl px-2 py-2 text-[11px] font-black outline-hidden cursor-pointer"
                      style={{
                        background: `${statusColor}22`,
                        border: `1px solid ${statusColor}66`,
                        color: statusColor,
                      }}
                    >
                      {activeTeams.map((teamOption) => (
                        <option key={teamOption} value={teamOption}>
                          {teamNames[teamOption]}
                        </option>
                      ))}
                      <option value="BENCH">Banco</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-2 mt-3">
                    <button
                      onClick={() => togglePaid(player.id)}
                      className="flex-1 rounded-xl py-2 text-[11px] font-black cursor-pointer"
                      style={player.paid
                        ? { background: "rgba(74,222,128,0.12)", color: "#4ade80", border: "1px solid rgba(74,222,128,0.24)" }
                        : { background: "rgba(239,68,68,0.12)", color: "#f87171", border: "1px solid rgba(239,68,68,0.24)" }
                      }
                    >
                      {player.paid ? "Pago" : "Pendente"}
                    </button>

                    <button
                      onClick={() => removePlayer(player.id)}
                      className="w-11 rounded-xl flex items-center justify-center cursor-pointer"
                      style={{ background: "rgba(239,68,68,0.1)", color: "#f87171", border: "1px solid rgba(239,68,68,0.2)" }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {slot ? (
                    <p className="mt-2 text-[10px] font-bold text-white/28">
                      Em campo · posição {slot.split("-")[1].toUpperCase()}
                    </p>
                  ) : team !== "BENCH" ? (
                    <p className="mt-2 text-[10px] font-bold text-white/28">
                      Reserva · {teamNames[team]}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>

        <JogaButton
          variant="danger"
          size="lg"
          className="gap-3"
          onClick={() => {
            clearPostMatch();
            resetMatchFlowSession(matchId);
            savePreMatch({
              version: 1,
              gameMode,
              teamCount,
              teamNames,
              players,
              playerTeams,
              assignments,
              savedAt: new Date().toISOString(),
            });
            setLocation(`/partida/${matchId}/ao-vivo`);
          }}
        >
          <Play className="w-6 h-6 fill-white" />
          Iniciar Partida
        </JogaButton>
      </div>

      <PlayerPicker
        open={Boolean(pickerSlot)}
        title={pickerSlot ? `Posição ${pickerSlot}` : "Posição"}
        players={pickerPlayers}
        currentPlayerId={selectedSlotPlayerId}
        playerTeams={playerTeams}
        teamNamesMap={teamNames}
        onPick={(playerId) => {
          if (pickerSlot) assignPlayerToSlot(pickerSlot, playerId);
        }}
        onClear={() => {
          if (pickerSlot) clearSlot(pickerSlot);
        }}
        onClose={() => setPickerSlot(null)}
      />
    </JogaPage>
  );
}
