import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  getMatchRoutePath,
  loadMatchFromFirestore,
  type MatchStatus,
} from "@/lib/matchRepository";

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

/** Redireciona para a fase correcta quando o status da partida não corresponde à rota actual. */
export function useMatchPhaseGuard(matchId: string, phase: MatchPhase) {
  const [, setLocation] = useLocation();
  const [status, setStatus] = useState<MatchStatus | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!matchId || matchId === "default") return;

    let cancelled = false;

    void loadMatchFromFirestore(matchId).then((match) => {
      if (cancelled) return;

      const current = (match?.status ?? "configurando") as MatchStatus;
      setStatus(current);

      if (!ALLOWED_BY_PHASE[phase].includes(current)) {
        const from = new URLSearchParams(window.location.search).get("from");
        const suffix = from ? `?from=${encodeURIComponent(from)}` : "";
        setLocation(`${getMatchRoutePath(matchId, current)}${suffix}`);
        return;
      }

      setReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, [matchId, phase, setLocation]);

  return { ready, status };
}
