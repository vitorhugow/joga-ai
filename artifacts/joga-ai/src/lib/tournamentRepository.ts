/**
 * tournamentRepository.ts — Joga Aí Cup (torneio entre clubes/comunidades).
 */

import {
  collection,
  doc,
  getDoc,
  setDoc,
  addDoc,
  onSnapshot,
  serverTimestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { db, isFirebaseConfigured } from "./firebase";
import { stripUndefined } from "./firestoreUtils";

export type TournamentStatus = "registration" | "groups" | "knockout" | "finished";

export type TournamentLanding = {
  heroDescription?: string;
  rules?: string[];
};

export type TournamentRegistrationConfig = {
  aberta: boolean;
  maxTimes: number;
  prazo?: string;
};

export type Tournament = {
  id: string;
  name: string;
  edition: string;
  slug: string;
  status: TournamentStatus;
  landing?: TournamentLanding;
  registration?: TournamentRegistrationConfig;
  ownerId?: string;
};

export type TournamentTeam = {
  id: string;
  clubId: string;
  name: string;
  crestUrl?: string;
  captainId?: string;
  status: "pendente" | "confirmado" | "recusado";
  players?: string[];
};

export type TournamentJoinRequest = {
  id: string;
  tournamentId: string;
  playerId: string;
  playerName: string;
  status: "pendente" | "aprovado" | "recusado";
  createdAt: string;
};

export type ActiveTournamentConfig = {
  tournamentId: string;
  tabLabel: string;
};

function mapTournamentDoc(id: string, data: Record<string, unknown>): Tournament {
  return {
    id,
    name: String(data.name ?? "Joga Aí Cup"),
    edition: String(data.edition ?? ""),
    slug: String(data.slug ?? id),
    status: (data.status as TournamentStatus) ?? "registration",
    landing: data.landing as TournamentLanding | undefined,
    registration: data.registration as TournamentRegistrationConfig | undefined,
    ownerId: typeof data.ownerId === "string" ? data.ownerId : undefined,
  };
}

function mapTeamDoc(id: string, data: Record<string, unknown>): TournamentTeam {
  return {
    id,
    clubId: String(data.clubId ?? ""),
    name: String(data.name ?? ""),
    crestUrl: typeof data.crestUrl === "string" ? data.crestUrl : undefined,
    captainId: typeof data.captainId === "string" ? data.captainId : undefined,
    status: (data.status as TournamentTeam["status"]) ?? "pendente",
    players: Array.isArray(data.players) ? (data.players as string[]) : [],
  };
}

/** Config lida pela bottom nav e pela página — decide se a aba aparece e com que label. */
export async function loadActiveTournamentConfig(): Promise<ActiveTournamentConfig | null> {
  if (!isFirebaseConfigured()) return null;
  try {
    const snap = await getDoc(doc(db, "appConfig", "activeTournament"));
    if (!snap.exists()) return null;
    const data = snap.data();
    const tournamentId = String(data.tournamentId ?? "");
    if (!tournamentId) return null;
    return { tournamentId, tabLabel: String(data.tabLabel ?? "Joga Aí Cup") };
  } catch (err) {
    console.warn("[tournament] loadActiveTournamentConfig:", err);
    return null;
  }
}

export function subscribeActiveTournamentConfig(
  callback: (config: ActiveTournamentConfig | null) => void,
): Unsubscribe {
  if (!isFirebaseConfigured()) {
    callback(null);
    return () => {};
  }

  return onSnapshot(
    doc(db, "appConfig", "activeTournament"),
    (snap) => {
      if (!snap.exists()) return callback(null);
      const data = snap.data();
      const tournamentId = String(data.tournamentId ?? "");
      if (!tournamentId) return callback(null);
      callback({ tournamentId, tabLabel: String(data.tabLabel ?? "Joga Aí Cup") });
    },
    (err) => {
      console.warn("[tournament] subscribeActiveTournamentConfig:", err);
      callback(null);
    },
  );
}

export function subscribeTournament(
  tournamentId: string,
  callback: (tournament: Tournament | null) => void,
): Unsubscribe {
  if (!isFirebaseConfigured() || !tournamentId) {
    callback(null);
    return () => {};
  }

  return onSnapshot(
    doc(db, "tournaments", tournamentId),
    (snap) => {
      if (!snap.exists()) return callback(null);
      callback(mapTournamentDoc(snap.id, snap.data()));
    },
    (err) => {
      console.warn("[tournament] subscribeTournament:", err);
      callback(null);
    },
  );
}

export function subscribeTournamentTeams(
  tournamentId: string,
  callback: (teams: TournamentTeam[]) => void,
): Unsubscribe {
  if (!isFirebaseConfigured() || !tournamentId) {
    callback([]);
    return () => {};
  }

  return onSnapshot(
    collection(db, "tournaments", tournamentId, "teams"),
    (snap) => {
      callback(snap.docs.map((d) => mapTeamDoc(d.id, d.data())));
    },
    (err) => {
      console.warn("[tournament] subscribeTournamentTeams:", err);
      callback([]);
    },
  );
}

/** Estado da inscrição de UMA comunidade específica — usado na página do clube. */
export function subscribeTeamForCommunity(
  tournamentId: string,
  communityId: string,
  callback: (team: TournamentTeam | null) => void,
): Unsubscribe {
  if (!isFirebaseConfigured() || !tournamentId || !communityId) {
    callback(null);
    return () => {};
  }

  return onSnapshot(
    doc(db, "tournaments", tournamentId, "teams", communityId),
    (snap) => {
      if (!snap.exists()) return callback(null);
      callback(mapTeamDoc(snap.id, snap.data()));
    },
    (err) => {
      console.warn("[tournament] subscribeTeamForCommunity:", err);
      callback(null);
    },
  );
}

export class TournamentTeamAlreadyRegisteredError extends Error {
  constructor() {
    super("Este clube já está inscrito na Cup.");
    this.name = "TournamentTeamAlreadyRegisteredError";
  }
}

/** Inscreve o clube (comunidade) na Cup — só o admin/capitão chama isto. TeamId == communityId, idempotente. */
export async function registerCommunityForTournament(
  tournamentId: string,
  communityId: string,
  team: { name: string; crestUrl?: string; captainId: string },
): Promise<void> {
  if (!isFirebaseConfigured()) throw new Error("Firebase não configurado");

  const teamRef = doc(db, "tournaments", tournamentId, "teams", communityId);
  const existing = await getDoc(teamRef);
  if (existing.exists()) {
    throw new TournamentTeamAlreadyRegisteredError();
  }

  await setDoc(
    teamRef,
    stripUndefined({
      clubId: communityId,
      name: team.name,
      crestUrl: team.crestUrl,
      captainId: team.captainId,
      status: "pendente",
      players: [],
      createdAt: serverTimestamp(),
    }),
  );
}

/** Pedido de um membro comum para o clube entrar na Cup — permite vários pedidos, não bloqueia ao primeiro. */
export async function requestToJoinTournament(
  communityId: string,
  tournamentId: string,
  player: { id: string; name: string },
): Promise<void> {
  if (!isFirebaseConfigured()) throw new Error("Firebase não configurado");

  await addDoc(
    collection(db, "communities", communityId, "tournamentRequests"),
    stripUndefined({
      tournamentId,
      playerId: player.id,
      playerName: player.name,
      status: "pendente",
      createdAt: serverTimestamp(),
    }),
  );
}
