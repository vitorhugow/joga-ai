import { useState } from "react";
import { Trophy, Target, TrendingUp, Star, ChevronLeft } from "lucide-react";
import { Link } from "wouter";
import { useUserProfile } from "@/hooks/useUserProfile";
import { calculateOverall } from "@/lib/cardUtils";
import { profileToPlayerCard } from "@/lib/userRepository";
import { JogaChip, JogaPage } from "@/components/joga";

type Category = "overall" | "golos" | "assistencias" | "notas";

const categories: { key: Category; label: string; icon: typeof Trophy; color: string; glow: string }[] = [
  { key: "overall", label: "Overall", icon: Star, color: "#fbbf24", glow: "rgba(251,191,36,0.3)" },
  { key: "golos", label: "Golos", icon: Target, color: "#4ade80", glow: "rgba(74,222,128,0.3)" },
  { key: "assistencias", label: "Assist.", icon: TrendingUp, color: "#60a5fa", glow: "rgba(96,165,250,0.3)" },
  { key: "notas", label: "Notas", icon: Star, color: "#c084fc", glow: "rgba(192,132,252,0.3)" },
];

const posColors: Record<string, string> = {
  AVA: "#22c55e",
  DEF: "#60a5fa",
  MEI: "#c084fc",
  GR: "#fbbf24",
};

export default function Ranking() {
  const { profile } = useUserProfile();
  const player = profileToPlayerCard(profile);
  const myOverall = calculateOverall(player.attributes);
  const [category, setCategory] = useState<Category>("overall");

  const entries =
    profile.profileComplete && profile.seasonStats.matches > 0
      ? [
          {
            rank: 1,
            name: player.name,
            position: player.position,
            overall: myOverall,
            value:
              category === "overall"
                ? myOverall
                : category === "golos"
                  ? profile.seasonStats.goals
                  : category === "notas"
                    ? Number(profile.lastMatchRating ?? profile.seasonStats.averageRating ?? 0).toFixed(1)
                    : profile.seasonStats.assists,
            isMe: true,
          },
        ]
      : [];

  const cat = categories.find((c) => c.key === category)!;

  return (
    <JogaPage theme="dark" padded={false} className="pb-28">
      <div className="relative px-4 pt-5 pb-4 flex items-center gap-3">
        <Link href="/" className="joga-tap">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center border border-white/12 bg-white/6">
            <ChevronLeft className="w-5 h-5 text-white" />
          </div>
        </Link>
        <div>
          <p className="text-white/40 text-[10px] font-bold uppercase tracking-[0.2em]">Liga</p>
          <h1 className="font-display font-black text-white text-2xl">Ranking</h1>
        </div>
      </div>

      <div className="px-4 space-y-4">
        <div className="flex gap-2 flex-wrap">
          {categories.map((c) => (
            <JogaChip
              key={c.key}
              label={c.label}
              active={category === c.key}
              onClick={() => setCategory(c.key)}
              testId={`ranking-cat-${c.key}`}
            />
          ))}
        </div>

        {entries.length === 0 ? (
          <div className="text-center py-20">
            <Trophy className="w-12 h-12 text-white/20 mx-auto mb-4" />
            <h2 className="font-display font-black text-white text-xl">Ainda não há ranking</h2>
            <p className="text-white/40 text-sm mt-2 max-w-xs mx-auto">
              Joga peladas e os teus números aparecem aqui quando houver dados reais.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {entries.map((entry) => (
              <div
                key={entry.rank}
                className="rounded-2xl px-4 py-3 flex items-center gap-3"
                style={{
                  background: "rgba(22,163,74,0.08)",
                  border: "1px solid rgba(74,222,128,0.2)",
                }}
              >
                <div
                  className="w-11 h-11 rounded-full flex flex-col items-center justify-center shrink-0"
                  style={{
                    background: `radial-gradient(circle, ${posColors[entry.position] || "#9ca3af"}cc, ${posColors[entry.position] || "#9ca3af"}55)`,
                    border: `2px solid ${posColors[entry.position] || "#9ca3af"}88`,
                  }}
                >
                  <span className="font-black text-white text-sm leading-none">{entry.overall}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-emerald-300 truncate">{entry.name} (Tu)</p>
                  <p className="text-white/35 text-xs">{entry.position}</p>
                </div>
                <span className="font-display font-black text-xl" style={{ color: cat.color }}>
                  {entry.value}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </JogaPage>
  );
}
