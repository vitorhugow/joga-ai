interface PitchPlayer {
  name: string;
  position: string;
  overall: number;
  team: "home" | "away";
  x: number;
  y: number;
}

interface MiniPitchProps {
  players?: PitchPlayer[];
  homeColor?: string;
  awayColor?: string;
  homeTeam?: string;
  awayTeam?: string;
}

const defaultPlayers: PitchPlayer[] = [
  { name: "Diogo", position: "AVA", overall: 72, team: "home", x: 50, y: 20 },
  { name: "Pedro", position: "MEI", overall: 70, team: "home", x: 25, y: 38 },
  { name: "Bruno", position: "MEI", overall: 74, team: "home", x: 75, y: 38 },
  { name: "João", position: "DEF", overall: 65, team: "home", x: 25, y: 60 },
  { name: "Miguel", position: "DEF", overall: 68, team: "home", x: 75, y: 60 },
  { name: "Carlos", position: "GR", overall: 60, team: "home", x: 50, y: 82 },
  { name: "Rui", position: "AVA", overall: 62, team: "away", x: 50, y: 80 },
  { name: "André", position: "MEI", overall: 66, team: "away", x: 25, y: 62 },
  { name: "Luís", position: "MEI", overall: 64, team: "away", x: 75, y: 62 },
  { name: "Nuno", position: "DEF", overall: 67, team: "away", x: 25, y: 40 },
  { name: "Tiago", position: "DEF", overall: 65, team: "away", x: 75, y: 40 },
  { name: "Vitor", position: "GR", overall: 63, team: "away", x: 50, y: 18 },
];

export function MiniPitch({ players = defaultPlayers, homeColor = "#16a34a", awayColor = "#2563eb", homeTeam = "Casa", awayTeam = "Fora" }: MiniPitchProps) {
  return (
    <div className="relative w-full rounded-xl overflow-hidden" style={{ aspectRatio: "2/3" }} data-testid="mini-pitch">
      <div
        className="absolute inset-0"
        style={{
          background: "linear-gradient(180deg, #15803d 0%, #16a34a 25%, #15803d 50%, #16a34a 75%, #15803d 100%)",
        }}
      >
        <svg width="100%" height="100%" viewBox="0 0 200 300" fill="none" xmlns="http://www.w3.org/2000/svg" className="absolute inset-0">
          <rect width="200" height="300" fill="none" />
          <rect x="8" y="8" width="184" height="284" rx="2" stroke="white" strokeWidth="1.5" strokeOpacity="0.6" fill="none" />
          <line x1="8" y1="150" x2="192" y2="150" stroke="white" strokeWidth="1.5" strokeOpacity="0.6" />
          <circle cx="100" cy="150" r="24" stroke="white" strokeWidth="1.5" strokeOpacity="0.6" fill="none" />
          <circle cx="100" cy="150" r="2" fill="white" fillOpacity="0.6" />
          <rect x="60" y="8" width="80" height="40" stroke="white" strokeWidth="1.5" strokeOpacity="0.5" fill="none" />
          <rect x="80" y="8" width="40" height="18" stroke="white" strokeWidth="1.5" strokeOpacity="0.5" fill="none" />
          <rect x="60" y="252" width="80" height="40" stroke="white" strokeWidth="1.5" strokeOpacity="0.5" fill="none" />
          <rect x="80" y="274" width="40" height="18" stroke="white" strokeWidth="1.5" strokeOpacity="0.5" fill="none" />
          <circle cx="100" cy="55" r="2" fill="white" fillOpacity="0.5" />
          <circle cx="100" cy="245" r="2" fill="white" fillOpacity="0.5" />
        </svg>

        {players.map((p, i) => {
          const color = p.team === "home" ? homeColor : awayColor;
          const cx = (p.x / 100) * 100;
          const cy = (p.y / 100) * 100;
          return (
            <div
              key={i}
              className="absolute transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center"
              style={{ left: `${cx}%`, top: `${cy}%` }}
              data-testid={`pitch-player-${i}`}
            >
              <div
                className="w-7 h-7 rounded-full border-2 border-white shadow-lg flex items-center justify-center"
                style={{ backgroundColor: color }}
              >
                <span className="text-white font-bold text-[9px]">{p.overall}</span>
              </div>
              <span className="text-white text-[7px] font-semibold mt-0.5 drop-shadow-md truncate max-w-[36px] text-center leading-none">
                {p.name}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
