interface MatchEvent {
  id: string;
  type: string;
  player: string;
  time: string;
  team?: "home" | "away";
}

interface LiveMatchPanelProps {
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  matchTime: string;
  events: MatchEvent[];
  isRunning?: boolean;
}

const eventConfig: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  golo:           { label: "GOLO",    color: "#4ade80", bg: "rgba(74,222,128,0.12)",  icon: "⚽" },
  assistencia:    { label: "ASSIST.", color: "#60a5fa", bg: "rgba(96,165,250,0.12)",  icon: "🎯" },
  defesa:         { label: "DEFESA",  color: "#c084fc", bg: "rgba(192,132,252,0.12)", icon: "🧤" },
  cartao_amarelo: { label: "CARTÃO",  color: "#fbbf24", bg: "rgba(251,191,36,0.12)",  icon: "🟨" },
  cartao_vermelho:{ label: "CARTÃO V",color: "#f87171", bg: "rgba(248,113,113,0.12)", icon: "🟥" },
  falta:          { label: "FALTA",   color: "#fb923c", bg: "rgba(251,146,60,0.12)",  icon: "⚠️" },
};

export function LiveMatchPanel({ homeTeam, awayTeam, homeScore, awayScore, matchTime, events, isRunning }: LiveMatchPanelProps) {
  const leading = homeScore > awayScore ? "home" : homeScore < awayScore ? "away" : null;

  return (
    <div className="space-y-3" data-testid="live-match-panel">

      {/* ── SCOREBOARD ── */}
      <div
        className="relative rounded-3xl overflow-hidden"
        style={{
          background: "linear-gradient(160deg, #020d18 0%, #041424 40%, #071e30 100%)",
          boxShadow: "0 8px 40px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06)",
        }}
      >
        {/* Stadium lights top glow */}
        <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 50% -20%, rgba(22,163,74,0.18) 0%, transparent 55%)" }} />
        {/* Subtle pitch lines */}
        <div className="absolute inset-0" style={{
          backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 28px, rgba(255,255,255,0.025) 28px, rgba(255,255,255,0.025) 29px)",
        }} />

        {/* AO VIVO pill */}
        <div className="relative flex justify-center pt-4 pb-0">
          {isRunning ? (
            <div className="flex items-center gap-2 px-4 py-1.5 rounded-full" style={{ background: "rgba(220,38,38,0.85)", border: "1px solid rgba(248,113,113,0.4)" }}>
              <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
              <span className="text-white text-[11px] font-black uppercase tracking-[0.2em]">Ao Vivo</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-4 py-1.5 rounded-full" style={{ background: "rgba(251,191,36,0.15)", border: "1px solid rgba(251,191,36,0.3)" }}>
              <div className="w-2 h-2 rounded-full bg-amber-400" />
              <span className="text-amber-400 text-[11px] font-black uppercase tracking-[0.2em]">Pausado</span>
            </div>
          )}
        </div>

        {/* Teams + Score */}
        <div className="relative flex items-center px-4 py-5 gap-2">
          {/* Home team */}
          <div className="flex-1 flex flex-col items-center gap-2">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center font-display font-black text-white text-lg"
              style={{ background: "linear-gradient(135deg, #15803d, #16a34a)", boxShadow: "0 4px 12px rgba(22,163,74,0.4)" }}
            >
              {homeTeam.slice(0,2).toUpperCase()}
            </div>
            <p
              className="font-display font-black text-center uppercase leading-tight"
              style={{ fontSize: "0.75rem", letterSpacing: "0.06em", color: leading === "home" ? "#4ade80" : "rgba(255,255,255,0.75)" }}
            >
              {homeTeam}
            </p>
          </div>

          {/* Score block */}
          <div className="flex flex-col items-center gap-2 shrink-0">
            <div className="flex items-center gap-1">
              <span
                className="font-display font-black leading-none tabular-nums"
                style={{
                  fontSize: "4rem",
                  color: leading === "home" ? "#4ade80" : "white",
                  textShadow: leading === "home" ? "0 0 30px rgba(74,222,128,0.5)" : "none",
                }}
                data-testid="home-score"
              >
                {homeScore}
              </span>
              <span className="font-display font-thin text-white/20" style={{ fontSize: "2.5rem", margin: "0 2px" }}>:</span>
              <span
                className="font-display font-black leading-none tabular-nums"
                style={{
                  fontSize: "4rem",
                  color: leading === "away" ? "#60a5fa" : "white",
                  textShadow: leading === "away" ? "0 0 30px rgba(96,165,250,0.5)" : "none",
                }}
                data-testid="away-score"
              >
                {awayScore}
              </span>
            </div>
            {/* Timer */}
            <div
              className="flex items-center gap-1.5 px-3 py-1 rounded-full"
              style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)" }}
            >
              <div className={`w-1.5 h-1.5 rounded-full ${isRunning ? "bg-red-400 animate-pulse" : "bg-amber-400"}`} />
              <span className="font-display font-bold text-white/80" style={{ fontSize: "0.9rem", fontVariantNumeric: "tabular-nums" }}>
                {matchTime}
              </span>
            </div>
          </div>

          {/* Away team */}
          <div className="flex-1 flex flex-col items-center gap-2">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center font-display font-black text-white text-lg"
              style={{ background: "linear-gradient(135deg, #1d4ed8, #2563eb)", boxShadow: "0 4px 12px rgba(37,99,235,0.4)" }}
            >
              {awayTeam.slice(0,2).toUpperCase()}
            </div>
            <p
              className="font-display font-black text-center uppercase leading-tight"
              style={{ fontSize: "0.75rem", letterSpacing: "0.06em", color: leading === "away" ? "#60a5fa" : "rgba(255,255,255,0.75)" }}
            >
              {awayTeam}
            </p>
          </div>
        </div>
      </div>

      {/* ── EVENT FEED ── */}
      {events.length > 0 && (
        <div
          className="rounded-2xl overflow-hidden"
          style={{ background: "#0d1117", border: "1px solid rgba(255,255,255,0.07)" }}
        >
          <div className="px-4 py-2.5 flex items-center gap-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30">Eventos</span>
            <span className="ml-auto text-[10px] font-bold text-white/20">{events.length}</span>
          </div>
          <div className="max-h-44 overflow-y-auto">
            {events.map((event) => {
              const cfg = eventConfig[event.type] || { label: event.type, color: "#9ca3af", bg: "rgba(156,163,175,0.1)", icon: "•" };
              return (
                <div
                  key={event.id}
                  className="px-4 py-2.5 flex items-center gap-3"
                  style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                  data-testid={`event-${event.id}`}
                >
                  <div
                    className="w-7 h-7 rounded-xl flex items-center justify-center shrink-0 text-base"
                    style={{ background: cfg.bg }}
                  >
                    {cfg.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: cfg.color }}>{cfg.label}</span>
                    <span className="text-white/80 text-sm font-semibold ml-2">{event.player}</span>
                  </div>
                  <span className="font-display font-bold text-white/30 text-xs shrink-0">{event.time}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
