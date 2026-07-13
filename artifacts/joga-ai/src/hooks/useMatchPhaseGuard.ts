import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  getMatchRoutePath,
  loadMatchFromFirestore,
  subscribeMatchStatus,
  type MatchStatus,
} from "@/lib/matchRepository";
import { loadPostMatch } from "@/lib/postMatchStorage";
import { loadMatchResult } from "@/lib/matchHistoryRepository";
import { hasUserVoted } from "@/lib/voteStatusRepository";
import { getCurrentUserId } from "@/lib/auth";

const POS_JOGO_STATUSES: MatchStatus[] = [
  "aguardando_auditoria",
  "auditada",
  "concluida",
];

type MatchPhase = "pre-jogo" | "ao-vivo" | "pos-jogo";

const ALLOWED_BY_PHASE: Record<MatchPhase, MatchStatus[]> = {
  "pre-jogo": ["configurando"],
  "ao-vivo": ["ao_vivo"],
  "pos-jogo": POS_JOGO_STATUSES,
};

function hasLocalPostGameEvidence(matchId: string): boolean {
  const local = loadPostMatch(matchId);
  if (!local) return false;
  if (POS_JOGO_STATUSES.includes(local.status as MatchStatus)) return true;
  if ((local.miniGames?.length ?? 0) > 0) return true;
  if ((local.votedUserIds?.length ?? 0) > 0) return true;
  return false;
}

async function canStayOnPosJogo(matchId: string, status: MatchStatus): Promise<boolean> {
  if (ALLOWED_BY_PHASE["pos-jogo"].includes(status)) return true;
  if (hasLocalPostGameEvidence(matchId)) return true;

  const userId = getCurrentUserId();
  if (userId && (await hasUserVoted(matchId, userId))) return true;

  const result = await loadMatchResult(matchId);
  if (result?.ratingsReleased || result?.completedAt) return true;

  return false;
}

/** Redireciona para a fase correcta quando o status da partida não corresponde à rota actual. */
export function useMatchPhaseGuard(matchId: string, phase: MatchPhase) {
  const [, setLocation] = useLocation();
  const [status, setStatus] = useState<MatchStatus | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!matchId || matchId === "default") return;

    let cancelled = false;
    const from = new URLSearchParams(window.location.search).get("from");
    const suffix = from ? `?from=${encodeURIComponent(from)}` : "";

    const applyStatus = async (current: MatchStatus) => {
      if (cancelled) return;
      setStatus(current);

      if (ALLOWED_BY_PHASE[phase].includes(current)) {
        setReady(true);
        return;
      }

      if (phase === "pos-jogo" && (await canStayOnPosJogo(matchId, current))) {
        setReady(true);
        return;
      }

      setReady(false);
      setLocation(`${getMatchRoutePath(matchId, current)}${suffix}`);
    };

    void loadMatchFromFirestore(matchId).then((match) => {
      void applyStatus((match?.status ?? "configurando") as MatchStatus);
    });

    const unsub = subscribeMatchStatus(matchId, (current) => {
      void applyStatus(current);
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [matchId, phase, setLocation]);

  return { ready, status };
}
