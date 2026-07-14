import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useRoute, Link } from "wouter";
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
  MessageCircle,
  UserPlus,
} from "lucide-react";
import { loadMatchFromFirestore, saveMatchRoster, cancelMatch, startMatchLive, subscribeToMatch } from "@/lib/matchRepository";
import { ManageLiveControllersDialog } from "@/components/ManageLiveControllersDialog";
import { loadPreMatch, savePreMatch } from "@/lib/preMatchStorage";
import { loadPostMatch, clearPostMatch } from "@/lib/postMatchStorage";
import { firestoreTimestampToMs } from "@/lib/firestoreUtils";
import {
  cacheSetupFromSnapshot,
  ensureSetupMigrated,
  requestServerSetupMigration,
  subscribeToSetup,
  type MatchSetupState,
} from "@/lib/matchStateRepository";
import { resetMatchFlowSession, resolveMatchId } from "@/lib/matchFlowStorage";
import { loadMatchDetails, type MatchDetails } from "@/lib/matchRepository";
import { formatMatchPriceAmount } from "@/lib/formatMatchPrice";
import { accessModeLabel, resolveAccessMode } from "@/lib/matchAccess";
import { payPelada, leavePeladaMatch, openOrganizerCaixa, startConnectOnboarding } from "@/lib/peladaBilling";
import { formatCentsEuro, peladaCheckoutTotalCents, peladaPriceCents } from "@/lib/peladaWallet";
import { createIncompleteSeedProfile, getWhatsappUrl, loadUserProfile } from "@/lib/userRepository";
import { loadCommunityMembers } from "@/lib/communityRepository";
import { loadMensalistaStatus } from "@/lib/mensalistaRepository";
import { linkPlayersInRoster } from "@/lib/matchPlayerUtils";
import { isUserLiveController } from "@/lib/liveControllerUtils";
import {
  confirmPresence,
  leaveMatch,
  removePlayerAndPromote,
  getMatchInviteUrl,
  getMatchAppUrl,
  canConfirmPresence,
  type WaitlistEntry,
} from "@/lib/matchRsvpRepository";
import { buildGuestClaimLink } from "@/lib/guestClaimRepository";
import { calculateOverall } from "@/lib/cardUtils";
import { MANUAL_PLAYER_OVR, computeSequentialTeamCapacities, formatPlayerOverall, overallFromProfile } from "@/lib/rosterUtils";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useStripeConnectReturn } from "@/hooks/useStripeConnectReturn";
import { useMatchPhaseGuard } from "@/hooks/useMatchPhaseGuard";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { usePageMeta } from "@/hooks/usePageMeta";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthGate } from "@/contexts/AuthGateContext";
import { JogaButton, JogaPage } from "@/components/joga";
import { toast } from "@/hooks/use-toast";
import { triggerPushSoftPrompt } from "@/components/PushPermissionPrompt";
import { trackEvent } from "@/lib/analytics";
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
  paidVia?: "app" | "balance";
  isMe?: boolean;
  manual?: boolean;
  userId?: string;
  guestId?: string;
  loanCard?: boolean;
};

function toPreJogoPlayer(
  p: {
    id: string;
    name: string;
    position: string;
    overall: number;
    paid?: boolean;
    paidVia?: string;
    manual?: boolean;
    userId?: string;
    guestId?: string;
    loanCard?: boolean;
  },
  uid?: string | null,
): Player {
  return {
    id: p.id,
    name: p.name,
    position: p.position,
    overall: p.overall,
    paid: p.paid ?? false,
    paidVia: p.paidVia === "app" || p.paidVia === "balance" ? p.paidVia : undefined,
    isMe: p.userId === uid,
    manual: p.manual,
    userId: p.userId,
    guestId: p.guestId,
    loanCard: p.loanCard,
  };
}


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

function PlayerBadge({
  player,
  showOnlinePaidBadge,
}: {
  player: Player;
  showOnlinePaidBadge?: boolean;
}) {
  const color = posColors[player.position] || "#9ca3af";
  const paidOnline = player.paidVia === "app" || player.paidVia === "balance";

  return (
    <div className="flex items-center gap-2 min-w-0">
      <div
        className="w-10 h-10 rounded-xl flex flex-col items-center justify-center shrink-0"
        style={{ background: `${color}18`, border: `1.5px solid ${color}44` }}
      >
        <span className="font-display font-black leading-none text-white text-[0.95rem]">
          {formatPlayerOverall(player)}
        </span>
        <span className="font-bold text-[0.48rem] tracking-wider" style={{ color }}>{player.position}</span>
      </div>

      <div className="min-w-0">
        <div className="flex items-center gap-1 flex-wrap">
          {!player.paid && <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />}
          <p className="text-sm font-bold text-white/85 truncate">{player.name}</p>
          {showOnlinePaidBadge && paidOnline && (
            <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-300 border border-amber-400/40 shrink-0">
              💳 ONLINE
            </span>
          )}
          {player.loanCard && (
            <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-400/30 shrink-0">
              VISITANTE
            </span>
          )}
        </div>

        <p className={player.paid ? "text-[11px] font-bold text-emerald-300/80" : "text-[11px] font-black text-red-300"}>
          {player.loanCard
            ? "Visitante"
            : paidOnline && showOnlinePaidBadge
              ? "Pago online"
              : player.paid
                ? "Pago"
                : "Pendente"}
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
          {player ? formatPlayerOverall(player) : "+"}
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
    <div
      className="fixed inset-0 z-[70] flex items-end"
      style={{ background: "rgba(0,0,0,0.68)" }}
      onClick={onClose}
    >
      <div
        className="w-full rounded-t-[28px] p-4 max-h-[78vh] overflow-y-auto pb-[calc(env(safe-area-inset-bottom,0px)+5.5rem)]"
        style={{ background: "#0a0f1a", border: "1px solid rgba(255,255,255,0.10)" }}
        onClick={(e) => e.stopPropagation()}
      >
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
  const organizerIdRef = useRef<string | null>(null);
  const liveControllerIdsRef = useRef<string[]>([]);
  const canApplySetupRef = useRef(false);
  const lastLocalRosterWriteMs = useRef(0);
  const lastAppliedSetupAtMs = useRef(0);
  const gameModeRef = useRef<GameMode>("fut5");
  const teamCountRef = useRef<2 | 3 | 4>(2);
  const playersRef = useRef<Player[]>([]);
  const playerTeamsRef = useRef<Record<string, PlayerStatus>>({});
  const assignmentsRef = useRef<Record<string, string | null>>({});
  const [setupSyncState, setSetupSyncState] = useState<"idle" | "saving" | "saved">("idle");
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
  const [organizerWhatsapp, setOrganizerWhatsapp] = useState<string | null>(null);
  const [paidUserIds, setPaidUserIds] = useState<string[]>([]);
  const [mensalistaActive, setMensalistaActive] = useState(false);
  const [liveControllerIds, setLiveControllerIds] = useState<string[]>([]);
  const [controllersDialogOpen, setControllersDialogOpen] = useState(false);

  const [matchCommunityId, setMatchCommunityId] = useState<string | undefined>(
    () => loadMatchDetails(matchId)?.communityId,
  );

  useEffect(() => {
    if (!matchCommunityId || !userId) {
      setMensalistaActive(false);
      return;
    }
    void loadMensalistaStatus(matchCommunityId, userId).then((s) => {
      setMensalistaActive(s?.active === true);
    });
  }, [matchCommunityId, userId]);

  useEffect(() => {
    const details = loadMatchDetails(matchId);
    setMatchDetails(details);
    if (details?.communityId) setMatchCommunityId(details.communityId);
    if (details?.organizerId) setOrganizerId(details.organizerId);
    if (details?.paymentsEnabled) setPaymentsOn(true);
  }, [matchId]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paymentStatus = params.get("pagamento");
    if (!paymentStatus) return;

    params.delete("pagamento");
    const qs = params.toString();
    const cleanUrl = qs
      ? `${window.location.pathname}?${qs}`
      : window.location.pathname;
    window.history.replaceState({}, "", cleanUrl);

    if (paymentStatus === "sucesso") {
      trackEvent("payment_completed", { matchId });
      toast({
        title: "Pagamento recebido ✓",
        description: "A tua presença foi confirmada automaticamente.",
      });
      void loadMatchFromFirestore(matchId, { preferRemote: true }).then((merged) => {
        if (merged?.paidUserIds) setPaidUserIds(merged.paidUserIds);
        if (merged?.players && userId) {
          const mapped = merged.players.map((p) => toPreJogoPlayer(p, userId));
          setPlayers(linkPlayersInRoster(mapped, userId));
          setPlayerTeams(merged.playerTeams ?? {});
        }
      });
    } else if (paymentStatus === "cancelado") {
      toast({
        title: "Pagamento cancelado",
        description: "Podes tentar outra vez quando quiseres.",
      });
    }
  }, [matchId, userId]);

  useEffect(() => {
    let cancelled = false;
    skipNextPersist.current = true;
    setRosterHydrated(false);

    const pre = loadPreMatch(matchId);
    if (pre && !cancelled) {
      const mapped = pre.players.map((p) => toPreJogoPlayer(p, userId));
      setPlayers(userId ? linkPlayersInRoster(mapped, userId) : mapped);
      setGameMode(pre.gameMode ?? "fut5");
      setTeamCount(pre.teamCount ?? 2);
      setPlayerTeams(pre.playerTeams ?? {});
      setAssignments(pre.assignments ?? {});
    }

    const unsubMatch = subscribeToMatch(matchId, (meta) => {
      if (cancelled) return;

      const merged = meta.match;
      if (meta.organizerId) {
        organizerIdRef.current = meta.organizerId;
        setOrganizerId(meta.organizerId);
      } else if (merged?.organizerId) {
        organizerIdRef.current = merged.organizerId;
        setOrganizerId(merged.organizerId);
      } else if (meta.details?.organizerId) {
        organizerIdRef.current = meta.details.organizerId;
        setOrganizerId(meta.details.organizerId);
      }
      setLiveControllerIds(meta.liveControllerIds);
      liveControllerIdsRef.current = meta.liveControllerIds;
      canApplySetupRef.current = Boolean(
        userId &&
          (organizerIdRef.current === userId ||
            isUserLiveController(userId, {
              liveControllerIds: meta.liveControllerIds,
              organizerId: meta.organizerId ?? organizerIdRef.current ?? undefined,
            })),
      );
      if (merged?.communityId) setMatchCommunityId(merged.communityId);
      setMatchStatus(merged?.status ?? "configurando");
      setPaidUserIds(merged?.paidUserIds ?? []);

      if (meta.details) {
        setMatchDetails(meta.details);
        if (meta.details.communityId) setMatchCommunityId(meta.details.communityId);
      }

      const details = meta.details ?? loadMatchDetails(matchId);
      const payments =
        merged?.paymentsEnabled ?? details?.paymentsEnabled ?? false;
      setPaymentsOn(payments);
      if (details || merged?.paymentsEnabled) {
        setMatchDetails((prev) => {
          const base = meta.details ?? prev ?? details;
          if (!base) return prev;
          return { ...base, paymentsEnabled: payments };
        });
      }

      if (merged) {
        skipNextPersist.current = true;
        const mapped = merged.players.map((p) => toPreJogoPlayer(p, userId));
        setPlayers(userId ? linkPlayersInRoster(mapped, userId) : mapped);
        setWaitlist(merged.waitlist ?? []);

        // Organizador/controlador: modo/equipas vêm de state/setup, não do match doc.
        if (!canApplySetupRef.current) {
          const localEditGrace = Date.now() - lastLocalRosterWriteMs.current < 2000;
          if (!localEditGrace) {
            setPlayerTeams(merged.playerTeams ?? {});
            setAssignments(merged.assignments ?? {});
            setGameMode(merged.gameMode ?? "fut5");
            setTeamCount(merged.teamCount ?? 2);
          }
        }
      }

      if (meta.organizerId && userId === meta.organizerId) {
        void ensureSetupMigrated(matchId, meta.organizerId, merged?.players ?? []);
      } else if (merged && userId) {
        void requestServerSetupMigration(matchId).catch(console.warn);
      }

      setRosterHydrated(true);
      window.setTimeout(() => {
        skipNextPersist.current = false;
      }, 700);
    });

    const unsubSetup = subscribeToSetup(matchId, (setup: MatchSetupState | null) => {
      if (cancelled) return;

      if (!setup) {
        void requestServerSetupMigration(matchId).catch(console.warn);
        return;
      }

      const isOwnSetupWrite = Boolean(userId && setup.updatedBy === userId);
      const localEditGrace =
        canApplySetupRef.current &&
        !isOwnSetupWrite &&
        Date.now() - lastLocalRosterWriteMs.current < 2000;
      if (localEditGrace) return;

      const setupUpdatedAt = firestoreTimestampToMs(setup.updatedAt);
      if (setupUpdatedAt <= lastAppliedSetupAtMs.current) return;
      lastAppliedSetupAtMs.current = setupUpdatedAt;

      skipNextPersist.current = true;
      setGameMode(setup.gameMode);
      setTeamCount(setup.teamCount);
      setPlayerTeams(setup.playerTeams);
      setAssignments(setup.assignments);
      setSetupSyncState("saved");

      const mergedPlayers = loadPostMatch(matchId)?.players ?? loadPreMatch(matchId)?.players ?? [];
      cacheSetupFromSnapshot(matchId, setup, mergedPlayers);

      window.setTimeout(() => {
        skipNextPersist.current = false;
      }, 700);
    });

    return () => {
      cancelled = true;
      unsubMatch();
      unsubSetup();
    };
  }, [matchId, userId]);

  const [communityMembers, setCommunityMembers] = useState<
    Awaited<ReturnType<typeof loadCommunityMembers>>
  >([]);

  useEffect(() => {
    const communityId = matchCommunityId ?? matchDetails?.communityId;
    if (!communityId) {
      setCommunityMembers([]);
      return;
    }
    void loadCommunityMembers(communityId).then(setCommunityMembers);
  }, [matchCommunityId, matchDetails?.communityId]);

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
    null;
  const isOrganizer = Boolean(userId && resolvedOrganizerId && userId === resolvedOrganizerId);
  const isLiveController = isUserLiveController(userId, {
    liveControllerIds,
    organizerId: resolvedOrganizerId ?? undefined,
  });
  const canManageMatch = isOrganizer || isLiveController;
  const [showCommunityList, setShowCommunityList] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("teams");

  const activeTeams = (["A", "B", "C", "D"] as TeamKey[]).slice(0, teamCount);

  // Por padrão, todos ficam no Banco por fallback.
  const [playerTeams, setPlayerTeams] = useState<Record<string, PlayerStatus>>({});
  const [assignments, setAssignments] = useState<Record<string, string | null>>({});
  const [pickerSlot, setPickerSlot] = useState<string | null>(null);

  useEffect(() => {
    playersRef.current = players;
    playerTeamsRef.current = playerTeams;
    assignmentsRef.current = assignments;
    gameModeRef.current = gameMode;
    teamCountRef.current = teamCount;
  }, [players, playerTeams, assignments, gameMode, teamCount]);

  const persistRosterImmediate = useCallback(
    async (patch?: {
      players?: Player[];
      playerTeams?: Record<string, PlayerStatus>;
      assignments?: Record<string, string | null>;
      gameMode?: GameMode;
      teamCount?: 2 | 3 | 4;
    }) => {
      if (!matchId || !canManageMatch) return false;

      const orgId = organizerIdRef.current;
      const delegateWrite = Boolean(
        userId && orgId && userId !== orgId &&
        isUserLiveController(userId, {
          liveControllerIds: liveControllerIdsRef.current,
          organizerId: orgId,
        }),
      );

      lastLocalRosterWriteMs.current = Date.now();
      skipNextPersist.current = true;
      setSetupSyncState("saving");
      try {
        await saveMatchRoster(
          matchId,
          {
            gameMode: patch?.gameMode ?? gameModeRef.current,
            teamCount: patch?.teamCount ?? teamCountRef.current,
            teamNames,
            players: patch?.players ?? playersRef.current,
            playerTeams: patch?.playerTeams ?? playerTeamsRef.current,
            assignments: patch?.assignments ?? assignmentsRef.current,
            waitlist,
          },
          {
            throwOnError: true,
            forceRosterPatch: delegateWrite,
          },
        );
        setSetupSyncState("saved");
        return true;
      } catch (err) {
        console.warn("[PreJogo] persistRosterImmediate:", err);
        setSetupSyncState("saved");
        toast({
          title: "Não foi possível sincronizar o plantel",
          description: "Verifica a ligação e tenta outra vez.",
          variant: "destructive",
        });
        return false;
      } finally {
        window.setTimeout(() => {
          skipNextPersist.current = false;
        }, 700);
      }
    },
    [matchId, canManageMatch, waitlist, userId, teamNames],
  );

  const teamSetupWarning = useMemo(() => {
    const emptyTeams = activeTeams.filter(
      (team) => !players.some((player) => playerTeams[player.id] === team),
    );
    if (emptyTeams.length === activeTeams.length) {
      return "Nenhum jogador está numa equipa — não será possível marcar golos.";
    }
    if (emptyTeams.length > 0) {
      const labels = emptyTeams.map((team) => teamNames[team]).join(", ");
      return `A equipa ${labels} não tem jogadores — não vais conseguir marcar golos nessa equipa.`;
    }
    return null;
  }, [activeTeams, players, playerTeams]);

  async function handleStartLiveMatch() {
    if (!isOrganizer || !userId) return;

    if (teamSetupWarning) {
      const proceed = await confirm({
        title: "Iniciar sem equipas?",
        description: `${teamSetupWarning} Queres iniciar mesmo assim?`,
        confirmLabel: "Iniciar assim",
        cancelLabel: "Voltar e organizar equipas",
      });
      if (!proceed) return;
    }

    clearPostMatch(matchId);
    resetMatchFlowSession(matchId);
    savePreMatch(
      {
        version: 1,
        matchId,
        gameMode,
        teamCount,
        teamNames,
        players,
        playerTeams,
        assignments,
        savedAt: new Date().toISOString(),
      },
      matchId,
    );
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
  }

  const persistRoster = useCallback(() => {
    if (!matchId || skipNextPersist.current || !canManageMatch) return;

    const orgId = organizerIdRef.current;
    const delegateWrite = Boolean(
      userId && orgId && userId !== orgId &&
      isUserLiveController(userId, {
        liveControllerIds: liveControllerIdsRef.current,
        organizerId: orgId,
      }),
    );

    setSetupSyncState("saving");
    void saveMatchRoster(
      matchId,
      {
        gameMode,
        teamCount,
        teamNames,
        players,
        playerTeams,
        assignments,
        waitlist,
      },
      { forceRosterPatch: delegateWrite },
    ).then(() => setSetupSyncState("saved"));
  }, [matchId, gameMode, teamCount, players, playerTeams, assignments, waitlist, canManageMatch, userId, teamNames]);

  useEffect(() => {
    if (!rosterHydrated) return;

    const timeout = window.setTimeout(() => {
      persistRoster();
    }, 500);

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

      void persistRosterImmediate({ gameMode: mode, assignments: next });
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

      void persistRosterImmediate({ teamCount: count, playerTeams: next });
      return next;
    });
  }

  function assignPlayerToSlot(slotId: string, playerId: string) {
    const team = getSlotTeam(slotId);
    const previousPlayerId = assignments[slotId];

    const nextAssignments = { ...assignments };
    for (const key of Object.keys(nextAssignments)) {
      if (nextAssignments[key] === playerId) nextAssignments[key] = null;
    }
    nextAssignments[slotId] = playerId;

    const nextPlayerTeams = {
      ...playerTeams,
      ...(previousPlayerId && previousPlayerId !== playerId
        ? { [previousPlayerId]: "BENCH" as PlayerStatus }
        : {}),
      [playerId]: team,
    };

    setAssignments(nextAssignments);
    setPlayerTeams(nextPlayerTeams);
    setPickerSlot(null);
    void persistRosterImmediate({
      playerTeams: nextPlayerTeams,
      assignments: nextAssignments,
    });
  }

  function clearSlot(slotId: string) {
    const currentPlayer = assignments[slotId];

    const nextAssignments = {
      ...assignments,
      [slotId]: null,
    };

    const nextPlayerTeams = currentPlayer
      ? { ...playerTeams, [currentPlayer]: "BENCH" as PlayerStatus }
      : playerTeams;

    setAssignments(nextAssignments);
    if (currentPlayer) setPlayerTeams(nextPlayerTeams);
    setPickerSlot(null);

    void persistRosterImmediate({
      playerTeams: nextPlayerTeams,
      assignments: nextAssignments,
    });
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

    const nextPlayerTeams = {
      ...playerTeams,
      [playerId]: team,
    };
    setPlayerTeams(nextPlayerTeams);

    void persistRosterImmediate({
      playerTeams: nextPlayerTeams,
      assignments: nextAssignments,
    });
  }

  function addCommunityPlayer(player: Player) {
    if (players.some((item) => item.id === player.id)) return;

    void (async () => {
      let resolved = player;
      if (player.userId) {
        try {
          const profile = await loadUserProfile(player.userId, undefined, { preferRemote: true });
          resolved = {
            ...player,
            name: profile.displayName || player.name,
            position: profile.position || player.position,
            overall: overallFromProfile(profile),
            userId: player.userId,
          };
        } catch (err) {
          console.warn("[PreJogo] community player profile:", err);
        }
      }

      const nextPlayers = [...playersRef.current, resolved];
      const nextTeams = { ...playerTeamsRef.current, [resolved.id]: "BENCH" as PlayerStatus };
      setPlayers(nextPlayers);
      setPlayerTeams(nextTeams);
      setShowCommunityList(false);
      setManualName("");
      await persistRosterImmediate({ players: nextPlayers, playerTeams: nextTeams });
    })();
  }

  function addManualPlayer() {
    const name = manualName.trim();
    if (!name) return;

    const id = `manual-${Date.now()}`;
    const newPlayer: Player = {
      id,
      name,
      position: "MEI",
      overall: MANUAL_PLAYER_OVR,
      paid: false,
      manual: true,
    };
    const nextPlayers = [...players, newPlayer];
    const nextTeams = { ...playerTeams, [id]: "BENCH" as PlayerStatus };

    setPlayers(nextPlayers);
    setPlayerTeams(nextTeams);
    setManualName("");
    void persistRosterImmediate({ players: nextPlayers, playerTeams: nextTeams });
  }

  function addGuestPlayer() {
    const name = manualName.trim();
    if (!name) return;

    const guestId = Math.random().toString(36).slice(2, 9);
    const id = `guest-${guestId}`;
    const newPlayer: Player = {
      id,
      guestId,
      name,
      position: "MEI",
      overall: MANUAL_PLAYER_OVR,
      paid: false,
      manual: true,
      loanCard: true,
    };
    const nextPlayers = [...players, newPlayer];
    const nextTeams = { ...playerTeams, [id]: "BENCH" as PlayerStatus };

    setPlayers(nextPlayers);
    setPlayerTeams(nextTeams);

    const claimUrl = buildGuestClaimLink(matchId, guestId);
    void navigator.clipboard.writeText(claimUrl).then(() => {
      toast({
        title: "Visitante adicionado",
        description: "Link de reclamação copiado — envia ao jogador.",
      });
    });

    setManualName("");
    void persistRosterImmediate({ players: nextPlayers, playerTeams: nextTeams });
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
    let result: "confirmed" | "waitlist" = "confirmed";
    try {
      const overall = profile.profileComplete
        ? calculateOverall(profile.attributes)
        : MANUAL_PLAYER_OVR;
      result = await confirmPresence(matchId, userId, {
        displayName,
        position: profile.position || "MEI",
        overall,
      });
    } catch (err) {
      toast({
        title: "Não foi possível confirmar",
        description: err instanceof Error ? err.message : "Tenta novamente.",
        variant: "destructive",
      });
      return;
    } finally {
      setRsvpBusy(false);
    }

    toast({
      title: result === "waitlist" ? "Lista de espera" : "Presença confirmada!",
      description:
        result === "waitlist"
          ? `Estás na posição ${waitlist.length + 1} — avisamos se abrir vaga.`
          : "Entraste no plantel desta pelada.",
    });

    try {
      setShowRsvpNameForm(false);
      if (result !== "waitlist") {
        trackEvent("match_joined", { matchId });
        triggerPushSoftPrompt();
      }
      const merged = await loadMatchFromFirestore(matchId, { preferRemote: true });
      if (merged?.waitlist) setWaitlist(merged.waitlist);
      if (merged?.players && userId) {
        const mapped = merged.players.map((p) => toPreJogoPlayer(p, userId));
        setPlayers(linkPlayersInRoster(mapped, userId));
        setPlayerTeams(merged.playerTeams ?? {});
      }
    } catch (err) {
      console.warn("[PreJogo] pós-confirmação RSVP:", err);
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

    if (myPlayer?.paid && paymentsOn) {
      const ok = await confirm({
        title: "Sair da pelada?",
        description:
          "O preço da pelada (sem a taxa de 0,50€) passa para o teu saldo Joga AI — podes usá-lo noutras peladas e o valor vai para o organizador.",
        confirmLabel: "Sair mesmo assim",
        destructive: true,
      });
      if (!ok) return;
    }

    setRsvpBusy(true);
    skipNextPersist.current = true;
    try {
      let creditedCents = 0;
      if (myPlayer?.paid && paymentsOn) {
        const result = await leavePeladaMatch(matchId);
        creditedCents = result.creditedCents;
        void refresh();
      } else {
        await leaveMatch(matchId, userId);
      }
      const merged = await loadMatchFromFirestore(matchId, { preferRemote: true });
      if (merged?.waitlist) setWaitlist(merged.waitlist);
      setPaidUserIds(merged?.paidUserIds ?? []);
      if (merged) {
        const mapped = merged.players.map((p) => toPreJogoPlayer(p, userId));
        setPlayers(userId ? linkPlayersInRoster(mapped, userId) : mapped);
        setPlayerTeams(merged.playerTeams ?? {});
        setAssignments(merged.assignments ?? {});
        savePreMatch(
          {
            version: 1,
            matchId,
            gameMode: merged.gameMode,
            teamCount: merged.teamCount,
            teamNames: merged.teamNames,
            players: merged.players,
            playerTeams: merged.playerTeams,
            assignments: merged.assignments ?? {},
            savedAt: merged.savedAt,
          },
          matchId,
        );
      } else {
        setPlayers((current) =>
          current.filter((p) => p.userId !== userId && p.id !== userId),
        );
      }
      toast({
        title: "Saíste da pelada",
        description:
          creditedCents > 0
            ? `${formatCentsEuro(creditedCents)} adicionados ao teu saldo.`
            : undefined,
      });
    } catch (err) {
      toast({
        title: "Erro ao sair",
        description: err instanceof Error ? err.message : "Tenta novamente.",
        variant: "destructive",
      });
    } finally {
      setRsvpBusy(false);
      window.setTimeout(() => {
        skipNextPersist.current = false;
      }, 800);
    }
  }

  function randomizeTeams() {
    const ok = window.confirm("Sortear jogadores pelas equipas (A e B primeiro, depois C)?");
    if (!ok) return;

    const teams = activeTeams;
    if (!teams.length) return;

    const shuffle = <T,>(items: T[]) => {
      const copy = [...items];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    };
    const shuffled = shuffle(players);

    const { capacities, notifyInsufficientTeams } = computeSequentialTeamCapacities(
      shuffled.length,
      teams.length,
      gameMode,
    );
    if (notifyInsufficientTeams) {
      toast({
        title: "Jogadores insuficientes",
        description: notifyInsufficientTeams,
      });
    }

    const nextPlayerTeams: Record<string, PlayerStatus> = {};

    let playerIndex = 0;
    for (let teamIndex = 0; teamIndex < teams.length; teamIndex++) {
      for (let slot = 0; slot < capacities[teamIndex] && playerIndex < shuffled.length; slot++) {
        nextPlayerTeams[shuffled[playerIndex].id] = teams[teamIndex];
        playerIndex++;
      }
    }

    const nextAssignments: Record<string, string | null> = {};
    for (const team of ["A", "B"] as TeamKey[]) {
      for (const slot of formations[gameMode].slots) {
        nextAssignments[makeSlot(team, slot.id)] = null;
      }
    }

    for (const team of ["A", "B"] as TeamKey[]) {
      if (!teams.includes(team)) continue;

      const usedPlayerIds = new Set<string>();
      const teamPlayers = shuffled.filter((player) => nextPlayerTeams[player.id] === team);

      for (const slot of formations[gameMode].slots) {
        const available = teamPlayers.filter((player) => !usedPlayerIds.has(player.id));
        if (!available.length) continue;

        const samePosition = available.filter((player) => player.position === slot.label);
        const candidates = samePosition.length > 0 ? samePosition : available;
        const chosen = [...candidates].sort((a, b) => b.overall - a.overall)[0];

        nextAssignments[makeSlot(team, slot.id)] = chosen.id;
        usedPlayerIds.add(chosen.id);
      }
    }

    setPlayerTeams(nextPlayerTeams);
    setAssignments(nextAssignments);
    setSortMode("teams");

    void persistRosterImmediate({
      playerTeams: nextPlayerTeams,
      assignments: nextAssignments,
    });
  }

  function clearAllTeams() {
    const ok = window.confirm("Colocar todos os jogadores no Banco e limpar o campo?");
    if (!ok) return;

    const nextTeams: Record<string, PlayerStatus> = {};
    for (const player of players) {
      nextTeams[player.id] = "BENCH";
    }

    const nextAssignments = { ...assignments };
    for (const key of Object.keys(nextAssignments)) {
      nextAssignments[key] = null;
    }

    setPlayerTeams(nextTeams);
    setAssignments(nextAssignments);
    setSortMode("teams");

    void persistRosterImmediate({
      playerTeams: nextTeams,
      assignments: nextAssignments,
    });
  }

  function removePlayer(playerId: string) {
    const nextPlayers = players.filter((player) => player.id !== playerId);
    const nextAssignments = { ...assignments };
    for (const key of Object.keys(nextAssignments)) {
      if (nextAssignments[key] === playerId) nextAssignments[key] = null;
    }
    const nextTeams = { ...playerTeams };
    delete nextTeams[playerId];

    setPlayers(nextPlayers);
    setAssignments(nextAssignments);
    setPlayerTeams(nextTeams);

    if (canManageMatch) {
      void removePlayerAndPromote(matchId, playerId).then(async () => {
        const merged = await loadMatchFromFirestore(matchId);
        if (merged?.waitlist) setWaitlist(merged.waitlist);
      });
    } else {
      void persistRosterImmediate({
        players: nextPlayers,
        playerTeams: nextTeams,
        assignments: nextAssignments,
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
      current.map((player) => {
        if (player.id !== playerId) return player;
        const paidOnline = player.paidVia === "app" || player.paidVia === "balance";
        if (paidOnline) return player;
        return { ...player, paid: !player.paid, paidVia: undefined };
      }),
    );
  }

  function playerPaidOnline(player: Player): boolean {
    return player.paidVia === "app" || player.paidVia === "balance";
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
        overall: MANUAL_PLAYER_OVR,
        paid: false,
      }));
  }, [communityMembers, players, manualName]);

  const totalPaid = players.filter((player) => player.paid).length;
  const benchCount = teamBuckets.BENCH.length;
  const teamsWithPlayers = (["A", "B", "C", "D"] as TeamKey[]).filter((team) => teamBuckets[team].length > 0).length;

  const pageMeta = useMemo(() => {
    if (!matchDetails) return {};
    const schedule = [matchDetails.scheduledDate, matchDetails.scheduledTime]
      .filter(Boolean)
      .join(" ");
    const place = [matchDetails.location, matchDetails.city].filter(Boolean).join(" · ");
    const max = Number(matchDetails.maxPlayers) || 14;
    const left = Math.max(0, max - players.length);
    const spots = left === 0 ? "Lotado" : `${left} ${left === 1 ? "vaga" : "vagas"}`;
    const price = formatMatchPriceAmount(matchDetails.price) ?? "Grátis";
    const origin = typeof window !== "undefined" ? window.location.origin : "https://jogaai.pt";
    return {
      title: matchDetails.title || "Pelada Joga AI",
      description: [schedule, place, spots, price].filter(Boolean).join(" · "),
      image: `${origin}/opengraph.jpg`,
      url: getMatchInviteUrl(matchId),
    };
  }, [matchDetails, players.length, matchId]);
  usePageMeta(pageMeta);

  const myPlayerIndex = userId
    ? players.findIndex((p) => p.userId === userId || p.id === userId)
    : -1;
  const myWaitlistIndex = userId ? waitlist.findIndex((w) => w.userId === userId) : -1;
  const isInMatch = myPlayerIndex >= 0;
  const isOnWaitlist = myWaitlistIndex >= 0;
  const myPlayer = myPlayerIndex >= 0 ? players[myPlayerIndex] : null;

  const peladaPriceOnlyCents = useMemo(
    () => peladaPriceCents(matchDetails?.price),
    [matchDetails?.price],
  );
  const peladaTotalCents = useMemo(
    () => peladaCheckoutTotalCents(matchDetails?.price),
    [matchDetails?.price],
  );
  const peladaSaldoCents = profile.peladaBalanceCents ?? 0;
  const canPayWithSaldo = Boolean(
    paymentsOn &&
      peladaPriceOnlyCents &&
      peladaSaldoCents >= peladaPriceOnlyCents,
  );

  async function handleJoinClick() {
    if (!requireLinked({
      mode: "register",
      title: "Cria conta para confirmar presença",
      description: "Precisas de entrar para participar nesta pelada.",
    })) {
      return;
    }
    if (paymentsOn && !isOrganizer && organizerCaixaReady) {
      setRsvpBusy(true);
      try {
        const result = await payPelada(matchId);
        if (result === "balance" || result === "mensalista") {
          trackEvent("match_joined", { matchId });
          triggerPushSoftPrompt();
          void refresh();
          const merged = await loadMatchFromFirestore(matchId, { preferRemote: true });
          if (merged?.waitlist) setWaitlist(merged.waitlist);
          if (merged?.players && userId) {
            const mapped = merged.players.map((p) => toPreJogoPlayer(p, userId));
            setPlayers(linkPlayersInRoster(mapped, userId));
            setPlayerTeams(merged.playerTeams ?? {});
          }
        }
      } finally {
        setRsvpBusy(false);
      }
      return;
    }
    if (needsProfileName && !showRsvpNameForm) {
      setShowRsvpNameForm(true);
      return;
    }
    const name = rsvpGuestName.trim() || profile.displayName?.trim();
    void handleConfirmPresence(name);
  }

  useEffect(() => {
    const orgId = resolvedOrganizerId;
    if (!orgId) {
      setOrganizerCaixaReady(false);
      setOrganizerWhatsapp(null);
      return;
    }
    if (userId === orgId) {
      setOrganizerCaixaReady(Boolean(paymentsOn && profile?.stripeAccountId));
      setOrganizerWhatsapp(profile?.whatsapp ?? null);
      return;
    }
    let cancelled = false;
    void loadUserProfile(orgId, createIncompleteSeedProfile(orgId, false), {
      preferRemote: true,
    }).then((p) => {
      if (!cancelled) {
        setOrganizerCaixaReady(Boolean(paymentsOn && p?.stripeAccountId));
        setOrganizerWhatsapp(p?.whatsapp ?? null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [resolvedOrganizerId, paymentsOn, userId, profile?.stripeAccountId, profile?.whatsapp]);

  const showRsvpBanner = Boolean(
    !isOrganizer && rosterHydrated && canConfirmPresence(matchStatus),
  );
  const needsProfileName = isLinked && !profile.displayName?.trim();

  function handleRsvpClick() {
    handleJoinClick();
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

          <p className="text-white/40 text-[10px] font-black uppercase tracking-[0.22em]">
            {canManageMatch ? "Pré-Jogo Editável" : "Pré-Jogo"}
            {canManageMatch && setupSyncState === "saving" && (
              <span className="block text-[9px] text-amber-300/80 normal-case tracking-normal mt-0.5">a guardar…</span>
            )}
            {canManageMatch && setupSyncState === "saved" && (
              <span className="block text-[9px] text-emerald-300/70 normal-case tracking-normal mt-0.5">guardado</span>
            )}
          </p>
          <button
            onClick={() => void shareMatchUrl()}
            className="w-10 h-10 rounded-2xl flex items-center justify-center cursor-pointer"
            style={{ background: "rgba(74,222,128,0.14)", border: "1px solid rgba(74,222,128,0.28)" }}
            title="Convidar"
            data-testid="button-invite-match"
          >
            <Share2 className="w-4 h-4 text-emerald-300" />
          </button>
        </div>

        <div className="relative px-5 pb-8 pt-3">
          <h1 className="font-display font-black text-white text-2xl leading-tight tracking-tight">
            {matchDetails?.title || "Time A x Time B"}
          </h1>

          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className="text-white font-bold text-sm">
              📍 {matchDetails?.location || "Local a definir"}
              {matchDetails?.city ? `, ${matchDetails.city}` : ""}
            </span>
            {matchDetails?.scheduledDate && (
              <>
                <span className="text-white/40">·</span>
                <span className="text-white font-bold text-sm">
                  📅 {matchDetails.scheduledDate}
                  {matchDetails.scheduledTime ? ` · 🕐 ${matchDetails.scheduledTime.slice(0, 5)}` : ""}
                </span>
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
                  💰 {formatMatchPriceAmount(matchDetails.price) ?? matchDetails.price}
                </span>
              )}
              {paymentsOn && (
                <span className="text-[11px] font-semibold px-2.5 py-1 rounded-lg" style={{ background: "rgba(251,191,36,0.12)", color: "#fbbf24" }}>
                  💳 Pagamento Online
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
              Organizador:{" "}
              {resolvedOrganizerId ? (
                <Link
                  href={`/perfil/${resolvedOrganizerId}`}
                  className="text-white font-semibold underline underline-offset-2 hover:text-emerald-300 transition-colors"
                >
                  {matchDetails.organizerName}
                </Link>
              ) : (
                <span className="text-white font-semibold">{matchDetails.organizerName}</span>
              )}
              {matchDetails && (
                <> · {accessModeLabel(resolveAccessMode({
                  accessMode: matchDetails.accessMode,
                  openToExternal: matchDetails.openToExternal,
                  communityId: matchDetails.communityId,
                }))}</>
              )}
            </p>
          )}

          {!isOrganizer && organizerWhatsapp && getWhatsappUrl(organizerWhatsapp) && (
            <a
              href={getWhatsappUrl(organizerWhatsapp)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 mt-2 text-emerald-300 text-xs font-bold hover:text-emerald-200 transition-colors"
              data-testid="link-organizer-whatsapp"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              Falar com o organizador no WhatsApp
            </a>
          )}

          {paymentsOn && (
            <p className="text-[10px] text-white/35 mt-2 leading-relaxed">
              Pagamentos online não são devolvidos em dinheiro se saíres — o preço da pelada fica no teu saldo Joga AI (a taxa de 0,50€ não). O organizador só recebe na Caixa quando a pelada termina. Se o organizador cancelar, os valores pagos são creditados em saldo.
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
                <p className="text-white font-bold text-sm">Queres jogar nesta pelada?</p>
                {paymentsOn && peladaSaldoCents > 0 && (
                  <p className="text-emerald-200/90 text-xs mt-2 leading-relaxed">
                    💰 Tens {formatCentsEuro(peladaSaldoCents)} de saldo
                    {canPayWithSaldo
                      ? " — vamos usar automaticamente nesta pelada."
                      : " — podes usar parte ao pagar outras peladas."}
                  </p>
                )}
                {paymentsOn && !organizerCaixaReady && (
                  <p className="text-amber-200/80 text-xs mt-2 leading-relaxed">
                    Pagamento online em breve — o organizador ainda está a ligar a Caixa.
                  </p>
                )}
                {showRsvpNameForm && isLinked && !paymentsOn && (
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
                {mensalistaActive && paymentsOn && (
                  <p className="text-cyan-200/90 text-xs mt-2 font-semibold">
                    ✓ Mensalista — isento de pagamento nesta comunidade
                  </p>
                )}
                <JogaButton
                  variant="primary"
                  size="md"
                  className="mt-3 w-full"
                  disabled={rsvpBusy || (paymentsOn && !organizerCaixaReady && !mensalistaActive)}
                  onClick={handleRsvpClick}
                  data-testid={paymentsOn ? "button-pay-pelada" : "button-confirm-rsvp"}
                >
                  {paymentsOn
                    ? mensalistaActive
                      ? "✓ Mensalista — confirmar presença"
                      : canPayWithSaldo
                      ? `💰 Usar saldo (${formatCentsEuro(peladaPriceOnlyCents ?? 0)}) e confirmar presença`
                      : `💳 Pagar ${formatMatchPriceAmount(matchDetails?.price) ?? ""} e confirmar presença`
                    : "Confirmar presença"}
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
                  Os jogadores podem pagar online. O valor só entra na tua Caixa quando a pelada termina (concluída).
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
                      <PlayerBadge player={player} showOnlinePaidBadge={canManageMatch && paymentsOn} />
                    </div>

                    {canManageMatch ? (
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
                    ) : (
                      <span
                        className="rounded-xl px-2 py-2 text-[11px] font-black shrink-0"
                        style={{
                          background: `${statusColor}18`,
                          border: `1px solid ${statusColor}44`,
                          color: statusColor,
                        }}
                      >
                        {team === "BENCH" ? "Banco" : teamNames[team]}
                      </span>
                    )}
                  </div>

                  {canManageMatch && (
                    <div className="mt-3">
                      {playerPaidOnline(player) && player.paid ? (
                        <p
                          className="w-full rounded-xl py-2 text-center text-[11px] font-black text-amber-300/90"
                          style={{
                            background: "rgba(251,191,36,0.12)",
                            border: "1px solid rgba(251,191,36,0.28)",
                          }}
                        >
                          💳 Pago online — não editável
                        </p>
                      ) : (
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
                      )}

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

        <JogaButton
          variant="ghost"
          size="sm"
          className="gap-2 w-full"
          onClick={() => void shareMatchUrl()}
        >
          <LinkIcon className="w-4 h-4" />
          Copiar link da pelada
        </JogaButton>

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

        {isOrganizer && teamSetupWarning && (
          <p className="text-red-400 text-sm font-semibold text-center px-2" role="alert">
            {teamSetupWarning}
          </p>
        )}

        {isOrganizer && resolvedOrganizerId && (
          <JogaButton
            variant="ghost"
            size="md"
            className="gap-2"
            onClick={() => setControllersDialogOpen(true)}
          >
            <Users className="w-4 h-4" />
            Gerir controladores
            {liveControllerIds.length > 0 && (
              <span className="text-white/40 text-xs">({liveControllerIds.length})</span>
            )}
          </JogaButton>
        )}

        <JogaButton
          variant="danger"
          size="lg"
          className={`gap-3 ${teamSetupWarning ? "ring-2 ring-red-500/50" : ""}`}
          disabled={!isOrganizer}
          onClick={() => void handleStartLiveMatch()}
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
              {paymentsOn
                ? " Pagamentos online serão creditados em saldo Joga AI aos jogadores (sem a taxa de 0,50€)."
                : ""}
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

      {canManageMatch && (
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
      )}

      {isOrganizer && resolvedOrganizerId && (
        <ManageLiveControllersDialog
          open={controllersDialogOpen}
          onOpenChange={setControllersDialogOpen}
          matchId={matchId}
          organizerId={resolvedOrganizerId}
          liveControllerIds={liveControllerIds}
          players={players}
          onControllersChange={setLiveControllerIds}
        />
      )}

      {ConfirmDialog}
    </JogaPage>
  );
}
