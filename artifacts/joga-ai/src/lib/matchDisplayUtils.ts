/**
 * Prioridade e destaque visual das partidas no Início / cards.
 */

import type { MatchListing } from "./communityRepository";
import { doc, getDoc } from "firebase/firestore";
import { db, isFirebaseConfigured } from "./firebase";

export type MatchDisplayPriority = 1 | 2 | 3 | 4 | 5;

export type EnrichedMatchListing = MatchListing & {
  priority: MatchDisplayPriority;
  priorityLabel: string;
  liveClockStatus?: "running" | "paused" | "idle" | "ended" | null;
  pendingVote?: boolean;
  voted?: boolean;
};

const PRIORITY_LABELS: Record<MatchDisplayPriority, string> = {
  1: "AO VIVO",
  2: "VOTAÇÃO PENDENTE",
  3: "HOJE",
  4: "AMANHÃ",
  5: "Próxima",
};

function parseScheduleDate(match: MatchListing): Date | null {
  const raw = match.scheduledDate;
  if (!raw) return null;
  const time = match.scheduledTime?.slice(0, 5) ?? "12:00";
  const d = new Date(`${raw}T${time}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isSameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isTomorrow(schedule: Date, now: Date): boolean {
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return isSameCalendarDay(schedule, tomorrow);
}

export function computeMatchPriority(
  match: MatchListing,
  options?: {
    liveClockStatus?: EnrichedMatchListing["liveClockStatus"];
    pendingVote?: boolean;
    now?: Date;
  },
): { priority: MatchDisplayPriority; label: string } {
  const now = options?.now ?? new Date();
  const live = options?.liveClockStatus;
  if (match.status === "ao_vivo" && (live === "running" || live === "paused")) {
    return { priority: 1, label: PRIORITY_LABELS[1] };
  }
  if (match.status === "aguardando_auditoria" && options?.pendingVote) {
    return { priority: 2, label: PRIORITY_LABELS[2] };
  }
  const schedule = parseScheduleDate(match);
  if (schedule && isSameCalendarDay(schedule, now)) {
    return { priority: 3, label: PRIORITY_LABELS[3] };
  }
  if (schedule && isTomorrow(schedule, now)) {
    return { priority: 4, label: PRIORITY_LABELS[4] };
  }
  return { priority: 5, label: PRIORITY_LABELS[5] };
}

export async function fetchLiveClockStatus(matchId: string): Promise<EnrichedMatchListing["liveClockStatus"]> {
  if (!isFirebaseConfigured()) return null;
  try {
    const snap = await getDoc(doc(db, "matches", matchId, "state", "live"));
    if (!snap.exists()) return null;
    return (snap.data()?.status as EnrichedMatchListing["liveClockStatus"]) ?? null;
  } catch {
    return null;
  }
}

export function sortEnrichedMatches(matches: EnrichedMatchListing[]): EnrichedMatchListing[] {
  return [...matches].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    const da = parseScheduleDate(a)?.getTime() ?? 0;
    const db = parseScheduleDate(b)?.getTime() ?? 0;
    if (da !== db) return da - db;
    return a.title.localeCompare(b.title);
  });
}

export function matchCardEmphasis(priority: MatchDisplayPriority): {
  scale: string;
  border: string;
  pulse?: boolean;
} {
  switch (priority) {
    case 1:
      return {
        scale: "scale-[1.02]",
        border: "1px solid rgba(248,113,113,0.45)",
        pulse: true,
      };
    case 2:
      return {
        scale: "",
        border: "1px solid rgba(250,204,21,0.35)",
      };
    case 3:
      return {
        scale: "",
        border: "1px solid rgba(74,222,128,0.35)",
      };
    case 4:
      return {
        scale: "",
        border: "1px solid rgba(96,165,250,0.25)",
      };
    default:
      return {
        scale: "",
        border: "1px solid rgba(255,255,255,0.08)",
      };
  }
}
