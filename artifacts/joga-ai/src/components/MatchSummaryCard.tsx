import { Trophy } from "lucide-react";

interface MatchSummaryCardProps {
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  date: string;
  gameType: string;
}

export function MatchSummaryCard({ homeTeam, awayTeam, homeScore, awayScore, date, gameType }: MatchSummaryCardProps) {
  const homeWin = homeScore > awayScore;
  const awayWin = awayScore > homeScore;
  const draw = homeScore === awayScore;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden" data-testid="match-summary-card">
      <div className="bg-linear-to-r from-slate-700 to-slate-900 px-4 py-2 flex items-center justify-between">
        <span className="text-xs text-white/60 font-medium">{gameType}</span>
        <span className="text-xs text-white/60">{date}</span>
      </div>
      <div className="px-4 py-5 flex items-center justify-between gap-4">
        <div className="flex-1 text-center">
          <p className={`font-display font-bold text-sm uppercase tracking-wide ${homeWin ? "text-gray-900" : "text-gray-400"}`}>{homeTeam}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`font-display font-black text-4xl leading-none ${homeWin ? "text-primary" : "text-gray-500"}`}>{homeScore}</span>
          <span className="text-gray-300 font-light text-2xl">-</span>
          <span className={`font-display font-black text-4xl leading-none ${awayWin ? "text-primary" : "text-gray-500"}`}>{awayScore}</span>
        </div>
        <div className="flex-1 text-center">
          <p className={`font-display font-bold text-sm uppercase tracking-wide ${awayWin ? "text-gray-900" : "text-gray-400"}`}>{awayTeam}</p>
        </div>
      </div>
      {draw && (
        <div className="px-4 pb-3 text-center">
          <span className="text-xs text-gray-400 font-medium">Empate</span>
        </div>
      )}
    </div>
  );
}
