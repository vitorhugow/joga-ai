import { PlayerCard } from "@/components/PlayerCard";
import { mockData } from "@/data/mockData";

const PITCH_BG = `url("data:image/svg+xml,%3Csvg width='80' height='80' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 40 L80 40' stroke='rgba(255,255,255,0.05)' stroke-width='1'/%3E%3Ccircle cx='40' cy='40' r='20' stroke='rgba(255,255,255,0.04)' stroke-width='1' fill='none'/%3E%3C/svg%3E")`;

/** Página só para screenshots — sem login, sem navegação. */
export default function DemoCarta() {
  const player = mockData.currentPlayer;

  return (
    <div
      className="min-h-dvh flex items-center justify-center px-4 py-10"
      style={{
        background: "#0a0f1a",
        backgroundImage: `${PITCH_BG}`,
        backgroundSize: "80px 80px",
      }}
    >
      <div
        className="relative"
        style={{
          transform: "scale(1.15)",
          transformOrigin: "center center",
        }}
      >
        <div
          className="absolute inset-0 -z-10 blur-3xl opacity-40"
          style={{
            background: "radial-gradient(circle, rgba(74,222,128,0.35) 0%, transparent 70%)",
          }}
        />
        <PlayerCard
          name={player.name}
          position={player.position}
          attributes={player.attributes}
          shirtNumber={player.shirtNumber}
          title={player.title}
          size="profile"
        />
      </div>
    </div>
  );
}
