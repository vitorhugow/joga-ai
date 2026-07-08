import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Share2,
  Link as LinkIcon,
  UserPlus,
} from "lucide-react";
import { loadMatchFromFirestore, saveMatchRoster, cancelMatch, startMatchLive } from "@/lib/matchRepository";
import { loadPreMatch } from "@/lib/preMatchStorage";
import { savePreMatch } from "@/lib/preMatchStorage";
import { clearPostMatch } from "@/lib/postMatchStorage";
import { resetMatchFlowSession, resolveMatchId } from "@/lib/matchFlowStorage";
import { loadMatchDetails, type MatchDetails } from "@/lib/matchRepository";
import { payPelada, openOrganizerCaixa, startConnectOnboarding } from "@/lib/peladaBilling";
import { createIncompleteSeedProfile, loadUserProfile } from "@/lib/userRepository";
import { loadCommunityMembers, loadCommunity } from "@/lib/communityRepository";
import { linkPlayersInRoster } from "@/lib/matchPlayerUtils";
import {
  confirmPresence,
  leaveMatch,
  removePlayerAndPromote,
  getMatchInviteUrl,
  canConfirmPresence,
  type WaitlistEntry,
} from "@/lib/matchRsvpRepository";
import { buildGuestClaimLink } from "@/lib/guestClaimRepository";
import { calculateOverall } from "@/lib/cardUtils";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useStripeConnectReturn } from "@/hooks/useStripeConnectReturn";
import { useMatchPhaseGuard } from "@/hooks/useMatchPhaseGuard";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthGate } from "@/contexts/AuthGateContext";
import { JogaButton, JogaPage } from "@/components/joga";
import { toast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useJogaConfirm } from "@/hooks/useJogaConfirm";

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
  userId?: string;
  guestId?: string;
  loanCard?: boolean;
};


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
          {player.loanCard && (
            <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-400/30 shrink-0">
              VISITANTE
            </span>
          )}
        </div>

        <p className={player.paid ? "text-[11px] font-bold text-emerald-300/80" : "text-[11px] font-black text-red-300"}>
          {player.loanCard ? "Visitante" : player.paid ? "Pago" : "Pendente"}
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
  canEdit,
}: {
  slotId: string;
  label: string;
  player?: Player;
  onClick: () => void;
  teamColor: string;
  canEdit: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={!canEdit}
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
  const { confirm, ConfirmDialog } = useJogaConfirm();
  const { userId, isLinked } = useAuth();
  const { requireLinked } = useAuthGate();
  const { profile, refresh } = useUserProfile();
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/partida/:id/pre-jogo");
  const matchId = resolveMatchId({ routeMatchId: params?.id });
  const preJogoPath = `/partida/${matchId}/pre-jogo`;
  useStripeConnectReturn(() => void refresh());
  useMatchPhaseGuard(matchId, "pre-jogo");
  const returnTo = new URLSearchParams(window.location.search).get("from") || "/jogos";
  const [matchDetails, setMatchDetails] = useState<MatchDetails | null>(null);
  useDocumentTitle(matchDetails?.title || "Pré-jogo");
  const [rosterHydrated, setRosterHydrated] = useState(false);
  const skipNextPersist = useRef(true);
  const [organizerId, setOrganizerId] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [rsvpBusy, setRsvpBusy] = useState(false);
  const [showRsvpNameForm, setShowRsvpNameForm] = useState(false);
  const [rsvpGuestName, setRsvpGuestName] = useState("");
  const [matchStatus, setMatchStatus] = useState<string>("configurando");
  const [paymentsOn, setPaymentsOn] = useState(false);
  const [organizerCaixaReady, setOrganizerCaixaReady] = useState(false);

  const [matchCommunityId, setMatchCommunityId] = useState<string | undefined>(
    () => loadMatchDetails(matchId)?.communityId,
  );

  useEffect(() => {
    const details = loadMatchDetails(matchId);
    setMatchDetails(details);
    if (details?.communityId) setMatchCommunityId(details.communityId);
    if (details?.organizerId) setOrganizerId(details.organizerId);
  }, [matchId]);

  useEffect(() => {
    let cancelled = false;

    async function hydrateRoster() {
      skipNextPersist.current = true;
      setRosterHydrated(false);

      const merged = await loadMatchFromFirestore(matchId);
      const pre = loadPreMatch(matchId);
      if (merged?.organizerId) setOrganizerId(merged.organizerId);
      else if (merged?.players?.length) {
        const paidOrganizer = merged.players.find((p) => p.paid && p.userId);
        if (paidOrganizer?.userId) setOrganizerId(paidOrganizer.userId);
      }
      if (merged?.communityId) setMatchCommunityId(merged.communityId);
      setMatchStatus(merged?.status ?? "configurando");
      setPaymentsOn(merged?.paymentsEnabled ?? false);

      if (cancelled) return;

      const source = merged ?? pre;

      if (source) {
        const mapped = source.players.map((p) => ({
          id: p.id,
          name: p.name,
          position: p.position,
          overall: p.overall,
          paid: p.paid ?? false,
          isMe: p.isMe,
          manual: p.manual,
          userId: p.userId,
          guestId: p.guestId,
          loanCard: p.loanCard,
        }));
        setPlayers(userId ? linkPlayersInRoster(mapped, userId) : mapped);
        setWaitlist(merged?.waitlist ?? []);
        setGameMode(source.gameMode ?? "fut5");
        setTeamCount(source.teamCount ?? 2);
        setPlayerTeams(source.playerTeams ?? {});
        setAssignments(
          merged?.assignments ??
            pre?.assignments ??
            {},
        );
      }

      setRosterHydrated(true);
      window.setTimeout(() => {
        skipNextPersist.current = false;
      }, 0);
    }

    void hydrateRoster();
    return () => {
      cancelled = true;
    };
  }, [matchId, userId]);

  const [communityMembers, setCommunityMembers] = useState<
    Awaited<ReturnType<typeof loadCommunityMembers>>
  >([]);

  useEffect(() => {
    const communityId = matchCommunityId ?? matchDetails?.communityId;
    if (!communityId) {
      setCommunityMembers([]);
      setIsCommunityAdmin(false);
      return;
    }
    void loadCommunityMembers(communityId).then(setCommunityMembers);
    void loadCommunity(communityId, userId).then((c) => {
      setIsCommunityAdmin(Boolean(userId && c?.adminId === userId));
    });
  }, [matchCommunityId, matchDetails?.communityId, userId]);

  useEffect(() => {
    if (!userId || !rosterHydrated) return;
    setPlayers((current) => linkPlayersInRoster(current, userId));
  }, [userId, rosterHydrated]);

  const [gameMode, setGameMode] = useState<GameMode>("fut5");
  const [teamCount, setTeamCount] = useState<2 | 3 | 4>(2);
  const [players, setPlayers] = useState<Player[]>([]);
  const [manualName, setManualName] = useState("");

  const resolvedOrganizerId =
    organizerId ??
    matchDetails?.organizerId ??
    players.find((p) => p.paid && p.userId)?.userId ??
    null;
  const isOrganizer = Boolean(userId && resolvedOrganizerId && userId === resolvedOrganizerId);
  const [isCommunityAdmin, setIsCommunityAdmin] = useState(false);
  const canManageMatch = isOrganizer || isCommunityAdmin;
  const [showCommunityList, setShowCommunityList] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("teams");

  const activeTeams = (["A", "B", "C", "D"] as TeamKey[]).slice(0, teamCount);

  // Por padrão, todos ficam no Banco por fallback.
  const [playerTeams, setPlayerTeams] = useState<Record<string, PlayerStatus>>({});
  const [assignments, setAssignments] = useState<Record<string, string | null>>({});
  const [pickerSlot, setPickerSlot] = useState<string | null>(null);

  const persistRoster = useCallback(() => {
    if (!matchId || skipNextPersist.current) return;

    void saveMatchRoster(matchId, {
      gameMode,
      teamCount,
      teamNames,
      players,
      playerTeams,
      assignments,
      waitlist,
    });
  }, [matchId, gameMode, teamCount, players, playerTeams, assignments, waitlist]);

  useEffect(() => {
    if (!rosterHydrated) return;

    const timeout = window.setTimeout(() => {
      persistRoster();
    }, 400);

    return () => window.clearTimeout(timeout);
  }, [rosterHydrated, persistRoster]);

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

  function addGuestPlayer() {
    const name = manualName.trim();
    if (!name) return;

    const guestId = Math.random().toString(36).slice(2, 9);
    const id = `guest-${guestId}`;

    setPlayers((current) => [
      ...current,
      {
        id,
        guestId,
        name,
        position: "MEI",
        overall: 50,
        paid: false,
        manual: true,
        loanCard: true,
      },
    ]);

    setPlayerTeams((current) => ({
      ...current,
      [id]: "BENCH",
    }));

    const claimUrl = buildGuestClaimLink(matchId, guestId);
    void navigator.clipboard.writeText(claimUrl).then(() => {
      toast({
        title: "Visitante adicionado",
        description: "Link de reclamação copiado — envia ao jogador.",
      });
    });

    setManualName("");
  }

  async function shareMatchUrl() {
    const url = getMatchInviteUrl(matchId);
    try {
      if (navigator.share) {
        await navigator.share({
          title: matchDetails?.title ?? "Pelada Joga AI",
          url,
        });
      } else {
        await navigator.clipboard.writeText(url);
        toast({ title: "Link copiado!", description: "Partilha só o link com a malta." });
      }
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;
      toast({ title: "Não foi possível partilhar", variant: "destructive" });
    }
  }

  async function handleConfirmPresence(nameOverride?: string) {
    if (!requireLinked({
      mode: "register",
      title: "Cria conta para confirmar presença",
      description: "Precisas de entrar para participar nesta pelada.",
    })) {
      return;
    }
    if (!userId) return;

    const displayName = (nameOverride || profile.displayName || "").trim();
    if (!displayName) {
      setShowRsvpNameForm(true);
      toast({ title: "Indica o teu nome no perfil", description: "Edita o perfil com o teu nome completo." });
      return;
    }

    setRsvpBusy(true);
    try {
      const uid = userId;
      const overall = profile.profileComplete
        ? calculateOverall(profile.attributes)
        : 50;
      const result = await confirmPresence(matchId, uid, {
        displayName,
        position: profile.position || "MEI",
        overall,
      });
      setShowRsvpNameForm(false);
      const merged = await loadMatchFromFirestore(matchId);
      if (merged?.waitlist) setWaitlist(merged.waitlist);
      if (merged?.players) {
        const mapped = merged.players.map((p) => ({
          id: p.id,
          name: p.name,
          position: p.position,
          overall: p.overall,
          paid: p.paid ?? false,
          isMe: p.userId === uid,
          manual: p.manual,
          userId: p.userId,
          guestId: p.guestId,
          loanCard: p.loanCard,
        }));
        setPlayers(linkPlayersInRoster(mapped, uid));
        setPlayerTeams(merged.playerTeams ?? {});
      }
      toast({
        title: result === "waitlist" ? "Lista de espera" : "Presença confirmada!",
        description:
          result === "waitlist"
            ? `Estás na posição ${waitlist.length + 1} — avisamos se abrir vaga.`
            : "Entraste no plantel desta pelada.",
      });
    } catch (err) {
      toast({
        title: "Não foi possível confirmar",
        description: err instanceof Error ? err.message : "Tenta novamente.",
        variant: "destructive",
      });
    } finally {
      setRsvpBusy(false);
    }
  }

  async function handleLeaveMatch() {
    if (!requireLinked({
      mode: "register",
      title: "Cria conta para gerir a presença",
      description: "Precisas de entrar para sair da pelada.",
    })) {
      return;
    }
    if (!userId) return;
    setRsvpBusy(true);
    try {
      await leaveMatch(matchId, userId);
      const merged = await loadMatchFromFirestore(matchId);
      if (merged?.waitlist) setWaitlist(merged.waitlist);
      if (merged?.players) {
        const mapped = merged.players.map((p) => ({
          id: p.id,
          name: p.name,
          position: p.position,
          overall: p.overall,
          paid: p.paid ?? false,
          isMe: p.userId === userId,
          manual: p.manual,
          userId: p.userId,
          guestId: p.guestId,
          loanCard: p.loanCard,
        }));
        setPlayers(userId ? linkPlayersInRoster(mapped, userId) : mapped);
        setPlayerTeams(merged.playerTeams ?? {});
      }
      toast({ title: "Saíste da pelada" });
    } catch (err) {
      toast({
        title: "Erro ao sair",
        description: err instanceof Error ? err.message : "Tenta novamente.",
        variant: "destructive",
      });
    } finally {
      setRsvpBusy(false);
    }
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

    if (canManageMatch) {
      void removePlayerAndPromote(matchId, playerId).then(async () => {
        const merged = await loadMatchFromFirestore(matchId);
        if (merged?.waitlist) setWaitlist(merged.waitlist);
      });
    }
  }

  async function handleRemovePlayer(playerId: string, playerName: string) {
    const ok = await confirm({
      description: `Remover ${playerName} desta pelada? A vaga é oferecida a quem estiver na lista de espera.`,
      confirmLabel: "Remover",
      destructive: true,
    });
    if (!ok) return;
    removePlayer(playerId);
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

  const communityPlayersNotInMatch = useMemo(() => {
    const inMatchIds = new Set(players.map((player) => player.userId ?? player.id));
    const query = manualName.trim().toLowerCase();
    return communityMembers
      .filter((member) => !inMatchIds.has(member.userId))
      .filter((member) => !query || member.displayName.toLowerCase().includes(query))
      .map((member) => ({
        id: member.userId,
        userId: member.userId,
        name: member.displayName,
        position: "MEI",
        overall: 50,
        paid: false,
      }));
  }, [communityMembers, players, manualName]);

  const totalPaid = players.filter((player) => player.paid).length;
  const benchCount = teamBuckets.BENCH.length;
  const teamsWithPlayers = (["A", "B", "C", "D"] as TeamKey[]).filter((team) => teamBuckets[team].length > 0).length;

  const myPlayerIndex = userId
    ? players.findIndex((p) => p.userId === userId || p.id === userId)
    : -1;
  const myWaitlistIndex = userId ? waitlist.findIndex((w) => w.userId === userId) : -1;
  const isInMatch = myPlayerIndex >= 0;
  const isOnWaitlist = myWaitlistIndex >= 0;
  const myPlayer = myPlayerIndex >= 0 ? players[myPlayerIndex] : null;

  useEffect(() => {
    const orgId = resolvedOrganizerId;
    if (!orgId || !paymentsOn) {
      setOrganizerCaixaReady(false);
      return;
    }
    if (userId === orgId) {
      setOrganizerCaixaReady(Boolean(profile?.stripeAccountId));
      return;
    }
    let cancelled = false;
    void loadUserProfile(orgId, createIncompleteSeedProfile(orgId, false), {
      preferRemote: true,
    }).then((p) => {
      if (!cancelled) setOrganizerCaixaReady(Boolean(p?.stripeAccountId));
    });
    return () => {
      cancelled = true;
    };
  }, [resolvedOrganizerId, paymentsOn, userId, profile?.stripeAccountId]);

  const showRsvpBanner = Boolean(
    !isOrganizer && rosterHydrated && canConfirmPresence(matchStatus),
  );
  const needsProfileName = isLinked && !profile.displayName?.trim();

  function handleRsvpClick() {
    if (!requireLinked({
      mode: "register",
      title: "Cria conta para confirmar presença",
      description: "Precisas de entrar para participar nesta pelada.",
    })) {
      return;
    }
    if (needsProfileName && !showRsvpNameForm) {
      setShowRsvpNameForm(true);
      return;
    }
    const name = rsvpGuestName.trim() || profile.displayName?.trim();
    void handleConfirmPresence(name);
  }

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
          {canManageMatch ? (
            <button
              onClick={() => void shareMatchUrl()}
              className="w-10 h-10 rounded-2xl flex items-center justify-center cursor-pointer"
              style={{ background: "rgba(74,222,128,0.14)", border: "1px solid rgba(74,222,128,0.28)" }}
              title="Convidar"
              data-testid="button-invite-match"
            >
              <Share2 className="w-4 h-4 text-emerald-300" />
            </button>
          ) : (
            <div className="w-10" />
          )}
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
              {paymentsOn && (
                <span className="text-[11px] font-semibold px-2.5 py-1 rounded-lg" style={{ background: "rgba(251,191,36,0.12)", color: "#fbbf24" }}>
                  💳 Caixa online
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

          {teamsWithPlayers === 0 && players.length > 0 && (
            <p className="mt-3 text-center text-[11px] font-bold text-white/40">
              {canManageMatch ? (
                <>Toca em <span className="text-emerald-300">Aleatório</span> para sortear os times.</>
              ) : (
                "Os times ainda não foram sorteados."
              )}
            </p>
          )}
        </div>
      </div>

      <div className="px-4 space-y-5 pt-5">
        {showRsvpBanner && (
          <section
            className="rounded-2xl p-4"
            style={{ background: "rgba(96,165,250,0.1)", border: "1px solid rgba(96,165,250,0.22)" }}
            data-testid="rsvp-banner"
          >
            {isInMatch ? (
              <>
                <p className="text-blue-200 text-sm font-bold">Estás confirmado nesta pelada.</p>

                {paymentsOn && !isOrganizer && myPlayer && !myPlayer.paid && (
                  <div className="mt-3">
                    {organizerCaixaReady ? (
                      <button
                        type="button"
                        onClick={() => void payPelada(matchId)}
                        className="w-full rounded-2xl py-3.5 font-black text-sm text-white flex items-center justify-center gap-2"
                        style={{ background: "#10b981", boxShadow: "0 4px 18px rgba(16,185,129,0.3)" }}
                        data-testid="button-pay-pelada"
                      >
                        💳 Pagar {matchDetails?.price ?? "a pelada"} pela Caixa
                      </button>
                    ) : (
                      <p className="text-amber-200/80 text-xs leading-relaxed rounded-xl px-3 py-2.5" style={{ background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.22)" }}>
                        Pagamento online em breve — o organizador ainda está a ligar a Caixa. Por agora combina pagamento manual com ele.
                      </p>
                    )}
                  </div>
                )}

                <JogaButton
                  variant="ghost"
                  size="sm"
                  className="mt-3 w-full text-red-300 border border-red-400/20"
                  disabled={rsvpBusy}
                  onClick={() => void handleLeaveMatch()}
                >
                  Sair da pelada
                </JogaButton>
              </>
            ) : isOnWaitlist ? (
              <>
                <p className="text-amber-300 text-sm font-bold">
                  Lista de espera — posição {myWaitlistIndex + 1}
                </p>
                <p className="text-white/45 text-xs mt-1">Avisamos quando abrir vaga.</p>
                <JogaButton
                  variant="ghost"
                  size="sm"
                  className="mt-3 w-full"
                  disabled={rsvpBusy}
                  onClick={() => void handleLeaveMatch()}
                >
                  Sair da lista
                </JogaButton>
              </>
            ) : (
              <>
                <p className="text-white/80 text-sm font-bold">Queres jogar nesta pelada?</p>
                {showRsvpNameForm && isLinked && (
                  <input
                    type="text"
                    value={rsvpGuestName}
                    onChange={(e) => setRsvpGuestName(e.target.value)}
                    placeholder="O teu nome"
                    className="mt-3 w-full rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/35 outline-none"
                    style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)" }}
                    data-testid="rsvp-guest-name"
                    autoFocus
                  />
                )}
                <JogaButton
                  variant="primary"
                  size="md"
                  className="mt-3 w-full"
                  disabled={rsvpBusy}
                  onClick={handleRsvpClick}
                >
                  Confirmar presença
                </JogaButton>
              </>
            )}
          </section>
        )}

        {isOrganizer && paymentsOn && (
          <section
            className="rounded-2xl p-4"
            style={{
              background: organizerCaixaReady
                ? "rgba(74,222,128,0.08)"
                : "rgba(251,191,36,0.08)",
              border: `1px solid ${organizerCaixaReady ? "rgba(74,222,128,0.28)" : "rgba(251,191,36,0.28)"}`,
            }}
            data-testid="organizer-caixa-setup"
          >
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/45 flex items-center gap-1.5">
              <CreditCard className="w-3 h-3" />
              Caixa da pelada
            </p>
            {organizerCaixaReady ? (
              <>
                <p className="text-white text-sm font-bold mt-2">Caixa ligada ✓</p>
                <p className="text-white/45 text-xs mt-1">
                  Os jogadores confirmados já podem pagar online nesta pelada.
                </p>
                <button
                  type="button"
                  onClick={() => void openOrganizerCaixa(preJogoPath)}
                  className="mt-3 w-full rounded-xl py-2.5 text-xs font-black text-white/80"
                  style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)" }}
                >
                  Gerir Caixa (IBAN, dados)
                </button>
              </>
            ) : (
              <>
                <p className="text-white/70 text-sm mt-2 leading-relaxed">
                  Esta pelada aceita pagamento online. Liga a tua Caixa para os jogadores pagarem (~2 min).
                </p>
                <p className="text-white/35 text-[11px] mt-2 leading-relaxed">
                  Enquanto não ligas, eles só podem combinar contigo — marca «pago» manualmente na lista.
                </p>
                <button
                  type="button"
                  onClick={() => void startConnectOnboarding(preJogoPath)}
                  className="mt-3 w-full rounded-xl py-3 font-black text-sm text-amber-950"
                  style={{ background: "linear-gradient(135deg, #fbbf24, #f59e0b)" }}
                  data-testid="button-setup-caixa-prejogo"
                >
                  Ligar Caixa
                </button>
              </>
            )}
          </section>
        )}

        {canManageMatch && (
        <>
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
        </>
        )}

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
                      canEdit={canManageMatch}
                    />
                  </div>
                );
              });
            })}
          </div>
        </section>

        {canManageMatch && (
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
              disabled={!canManageMatch}
            />

            <button
              onClick={addManualPlayer}
              className="w-12 rounded-2xl flex items-center justify-center cursor-pointer"
              style={{ background: "rgba(74,222,128,0.16)", border: "1px solid rgba(74,222,128,0.28)" }}
              disabled={!canManageMatch}
            >
              <Plus className="w-5 h-5 text-emerald-300" />
            </button>

            <button
              onClick={addGuestPlayer}
              className="w-12 rounded-2xl flex items-center justify-center cursor-pointer"
              style={{ background: "rgba(251,191,36,0.14)", border: "1px solid rgba(251,191,36,0.28)" }}
              disabled={!canManageMatch}
              title="Visitante com carta emprestada"
            >
              <UserPlus className="w-5 h-5 text-amber-300" />
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
        )}

        {canManageMatch && (["C", "D"] as TeamKey[]).filter((team) => activeTeams.includes(team)).map((team) => (
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

            {canManageMatch && (
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
            )}
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
                      disabled={!canManageMatch}
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

                  {canManageMatch && (
                    <div className="mt-3">
                      <button
                        onClick={() => togglePaid(player.id)}
                        className="w-full rounded-xl py-2 text-[11px] font-black cursor-pointer"
                        style={player.paid
                          ? { background: "rgba(74,222,128,0.12)", color: "#4ade80", border: "1px solid rgba(74,222,128,0.24)" }
                          : { background: "rgba(239,68,68,0.12)", color: "#f87171", border: "1px solid rgba(239,68,68,0.24)" }
                        }
                      >
                        {player.paid ? "Pago" : "Pendente"}
                      </button>

                      {/* Botão de remover afastado do toggle de pagamento para evitar toques acidentais */}
                      <div className="flex justify-end mt-2">
                        <button
                          onClick={() => void handleRemovePlayer(player.id, player.name)}
                          className="rounded-lg px-3 py-1.5 flex items-center gap-1.5 text-[10px] font-bold cursor-pointer"
                          style={{ background: "transparent", color: "rgba(248,113,113,0.75)", border: "1px solid rgba(239,68,68,0.16)" }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Remover
                        </button>
                      </div>
                    </div>
                  )}

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

        {canManageMatch && waitlist.length > 0 && (
          <section data-testid="waitlist-section">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display font-black text-white text-lg">Lista de espera</h2>
              <span className="text-[11px] font-bold px-2.5 py-1 rounded-full text-amber-300" style={{ background: "rgba(251,191,36,0.12)" }}>
                {waitlist.length} à espera
              </span>
            </div>
            <div className="space-y-2">
              {waitlist.map((entry, index) => (
                <div
                  key={entry.userId}
                  className="rounded-2xl px-4 py-3 flex items-center justify-between"
                  style={{ background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.18)" }}
                >
                  <div>
                    <p className="text-white font-bold text-sm">{entry.name}</p>
                    <p className="text-white/35 text-xs">{entry.position} · OVR {entry.overall}</p>
                  </div>
                  <span className="text-amber-300 font-black text-sm">#{index + 1}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {canManageMatch && (
          <JogaButton
            variant="ghost"
            size="sm"
            className="gap-2 w-full"
            onClick={() => void shareMatchUrl()}
          >
            <LinkIcon className="w-4 h-4" />
            Copiar link da pelada
          </JogaButton>
        )}

        {canManageMatch && (
          <JogaButton
            variant="ghost"
            size="md"
            className="gap-2 text-red-300 border border-red-400/20"
            onClick={() => setCancelOpen(true)}
          >
            <Trash2 className="w-4 h-4" />
            Cancelar partida
          </JogaButton>
        )}

        <JogaButton
          variant="danger"
          size="lg"
          className="gap-3"
          disabled={!isOrganizer}
          onClick={async () => {
            if (!isOrganizer || !userId) return;
            clearPostMatch(matchId);
            resetMatchFlowSession(matchId);
            savePreMatch({
              version: 1,
              matchId,
              gameMode,
              teamCount,
              teamNames,
              players,
              playerTeams,
              assignments,
              savedAt: new Date().toISOString(),
            }, matchId);
            await saveMatchRoster(matchId, {
              gameMode,
              teamCount,
              teamNames,
              players,
              playerTeams,
              assignments,
            });
            try {
              await startMatchLive(matchId, userId);
              setLocation(`/partida/${matchId}/ao-vivo`);
            } catch (err) {
              console.warn("[PreJogo] startMatchLive:", err);
              toast({
                title: "Não foi possível iniciar a partida.",
                description: "Verifica a tua ligação e tenta novamente.",
                variant: "destructive",
              });
            }
          }}
        >
          <Play className="w-6 h-6 fill-white" />
          {isOrganizer ? "Iniciar Partida" : "Só o organizador inicia"}
        </JogaButton>
      </div>

      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent className="bg-[#0a0f1a] border-white/10 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">Cancelar partida?</AlertDialogTitle>
            <AlertDialogDescription className="text-white/50">
              A partida deixa de aparecer em Jogos. Esta acção não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-white/5 border-white/10 text-white hover:bg-white/10">
              Voltar
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              disabled={cancelling}
              onClick={(e) => {
                e.preventDefault();
                setCancelling(true);
                void cancelMatch(matchId)
                  .then(() => {
                    toast({ title: "Partida cancelada" });
                    setLocation(returnTo);
                  })
                  .catch((err) => {
                    toast({
                      title: "Não foi possível cancelar",
                      description: err instanceof Error ? err.message : "Tenta novamente.",
                      variant: "destructive",
                    });
                  })
                  .finally(() => {
                    setCancelling(false);
                    setCancelOpen(false);
                  });
              }}
            >
              {cancelling ? "A cancelar…" : "Sim, cancelar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

      {ConfirmDialog}
    </JogaPage>
  );
}
