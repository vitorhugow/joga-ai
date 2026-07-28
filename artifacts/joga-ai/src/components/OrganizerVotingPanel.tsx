import { JogaButton } from "@/components/joga";

type VotingPanelPlayer = {
  id: string;
  name: string;
  userId?: string;
};

type PlayerVoteState = "voted" | "pending" | "no_account";

type OrganizerVotingPanelProps = {
  players: VotingPanelPlayer[];
  organizerId?: string;
  votedUserIds: string[];
  ratingsReleased: boolean;
  isOrganizer: boolean;
  finalizeBusy: boolean;
  onFinalize: () => void;
};

function playerVoteState(
  player: VotingPanelPlayer,
  organizerId: string | undefined,
  votedUserIds: string[],
): PlayerVoteState {
  const voterId = player.userId ?? (player.id === organizerId ? organizerId : undefined);
  if (!voterId) return "no_account";
  return votedUserIds.includes(voterId) ? "voted" : "pending";
}

const STATE_LABEL: Record<PlayerVoteState, string> = {
  voted: "Votou",
  pending: "Pendente",
  no_account: "Sem conta",
};

const STATE_STYLE: Record<PlayerVoteState, { background: string; color: string }> = {
  voted: { background: "rgba(74,222,128,0.15)", color: "#4ade80" },
  pending: { background: "rgba(251,191,36,0.12)", color: "#fbbf24" },
  no_account: { background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.45)" },
};

/**
 * Painel "Estado da votação" — mostra a todos os organizadores/admins do
 * clube quem já votou, quem falta e quem não tem conta ligada (por isso não
 * pode votar). Renderiza-se igual nos três estados de PosJogo (a votar, com
 * ganhos, resumo) — quando a pelada já está concluída (`ratingsReleased`),
 * fica em modo leitura: mostra a lista, mas esconde o botão de finalizar.
 */
export function OrganizerVotingPanel({
  players,
  organizerId,
  votedUserIds,
  ratingsReleased,
  isOrganizer,
  finalizeBusy,
  onFinalize,
}: OrganizerVotingPanelProps) {
  const votedCount = players.filter(
    (player) => playerVoteState(player, organizerId, votedUserIds) === "voted",
  ).length;
  const linkedCount = players.filter(
    (player) => playerVoteState(player, organizerId, votedUserIds) !== "no_account",
  ).length;

  return (
    <section
      className="mt-4 rounded-3xl p-4"
      style={{ background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.22)" }}
      data-testid="organizer-voting-panel"
    >
      <p className="text-blue-200/70 text-[10px] font-black uppercase tracking-[0.2em]">
        {isOrganizer ? "Admin da pelada" : "Admin do clube"}
      </p>
      <h2 className="font-display font-black text-white text-xl mt-1">Estado da votação</h2>
      <p className="text-white/45 text-xs mt-1">
        {votedCount}/{linkedCount} jogadores com conta já votaram
        {ratingsReleased ? " · Notas publicadas" : ""}
      </p>

      <div className="mt-3 space-y-2">
        {players.map((player) => {
          const state = playerVoteState(player, organizerId, votedUserIds);
          return (
            <div
              key={player.id}
              className="flex items-center justify-between rounded-2xl px-3 py-2"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
            >
              <span className="text-white text-sm font-semibold">{player.name}</span>
              <span
                className="text-xs font-black px-2 py-1 rounded-full"
                style={STATE_STYLE[state]}
              >
                {STATE_LABEL[state]}
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
          onClick={onFinalize}
          data-testid="organizer-finalize-match"
        >
          {finalizeBusy ? "A finalizar…" : "Finalizar pelada e votação"}
        </JogaButton>
      )}
      {!ratingsReleased && votedCount === 0 && (
        <p className="text-white/35 text-xs mt-2 text-center">
          Como {isOrganizer ? "organizador" : "admin do clube"}, podes finalizar a qualquer momento — mesmo sem votos.
        </p>
      )}
    </section>
  );
}
