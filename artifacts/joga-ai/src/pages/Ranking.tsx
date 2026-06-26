import { useState } from "react";
import { Trophy, Target, TrendingUp, Star, ChevronLeft } from "lucide-react";
import { Link } from "wouter";
import { mockData } from "@/data/mockData";
import { calculateOverall } from "@/lib/cardUtils";
import { JogaChip, JogaPage } from "@/components/joga";

const myOverall = calculateOverall(mockData.currentPlayer.attributes);

const rankingData = {
  overall: [
    { rank: 1, name: "Bruno Fernandes", position: "MEI", overall: 74, value: 74,   label: "OVR"   },
    { rank: 2, name: "Pedro Santos",    position: "MEI", overall: 70, value: 70,   label: "OVR"   },
    { rank: 3, name: "Miguel Costa",    position: "GR",  overall: 68, value: 68,   label: "OVR"   },
    { rank: 4, name: "João Silva",      position: "DEF", overall: 65, value: 65,   label: "OVR"   },
    { rank: 5, name: "Diogo Ferreira",  position: "AVA", overall: myOverall, value: myOverall, label: "OVR", isMe: true },
    { rank: 6, name: "Rui Patrício",    position: "AVA", overall: 62, value: 62,   label: "OVR"   },
  ],
  golos: [
    { rank: 1, name: "Bruno Fernandes", position: "MEI", overall: 74, value: 14, label: "Golos" },
    { rank: 2, name: "Rui Patrício",    position: "AVA", overall: 62, value: 11, label: "Golos" },
    { rank: 3, name: "Diogo Ferreira",  position: "AVA", overall: myOverall, value: 8, label: "Golos", isMe: true },
    { rank: 4, name: "Pedro Santos",    position: "MEI", overall: 70, value: 7, label: "Golos" },
    { rank: 5, name: "João Silva",      position: "DEF", overall: 65, value: 3, label: "Golos" },
  ],
  assistencias: [
    { rank: 1, name: "Pedro Santos",   position: "MEI", overall: 70, value: 12, label: "Assist." },
    { rank: 2, name: "Bruno Fernandes",position: "MEI", overall: 74, value: 10, label: "Assist." },
    { rank: 3, name: "Diogo Ferreira", position: "AVA", overall: myOverall, value: 4, label: "Assist.", isMe: true },
    { rank: 4, name: "João Silva",     position: "DEF", overall: 65, value: 3, label: "Assist." },
    { rank: 5, name: "Miguel Costa",   position: "GR",  overall: 68, value: 1, label: "Assist." },
  ],
  notas: [
    { rank: 1, name: "Pedro Santos",   position: "MEI", overall: 70, value: "8.7", label: "Média" },
    { rank: 2, name: "Bruno Fernandes",position: "MEI", overall: 74, value: "8.4", label: "Média" },
    { rank: 3, name: "Diogo Ferreira", position: "AVA", overall: myOverall, value: "8.0", label: "Média", isMe: true },
    { rank: 4, name: "Miguel Costa",   position: "GR",  overall: 68, value: "7.6", label: "Média" },
    { rank: 5, name: "João Silva",     position: "DEF", overall: 65, value: "7.1", label: "Média" },
  ],
};

type Category = "overall" | "golos" | "assistencias" | "notas";

const categories: { key: Category; label: string; icon: typeof Trophy; color: string; glow: string }[] = [
  { key: "overall",      label: "Overall", icon: Star,       color: "#fbbf24", glow: "rgba(251,191,36,0.3)"  },
  { key: "golos",        label: "Golos",   icon: Target,     color: "#4ade80", glow: "rgba(74,222,128,0.3)"  },
  { key: "assistencias", label: "Assist.", icon: TrendingUp, color: "#60a5fa", glow: "rgba(96,165,250,0.3)"  },
  { key: "notas",        label: "Notas",   icon: Star,       color: "#c084fc", glow: "rgba(192,132,252,0.3)" },
];

const posColors: Record<string, string> = {
  AVA: "#22c55e", DEF: "#60a5fa", MEI: "#c084fc", GR: "#fbbf24",
};

/* ── Player avatar circle ── */
function PlayerAvatar({ overall, position, size = "md" }: { overall: number; position: string; size?: "sm" | "md" | "lg" }) {
  const color = posColors[position] || "#9ca3af";
  const dim = size === "lg" ? 56 : size === "md" ? 44 : 36;
  const ovSize = size === "lg" ? "1.4rem" : size === "md" ? "1.1rem" : "0.95rem";
  const posSize = size === "lg" ? "0.6rem" : "0.55rem";
  return (
    <div style={{
      width: dim, height: dim, borderRadius: "50%", flexShrink: 0,
      background: `radial-gradient(circle at 30% 30%, ${color}cc, ${color}55)`,
      border: `2px solid ${color}88`,
      boxShadow: `0 0 12px ${color}44`,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    }}>
      <span style={{ fontWeight: 900, color: "white", fontSize: ovSize, lineHeight: 1, fontFamily: "inherit" }}>{overall}</span>
      <span style={{ fontWeight: 700, color: "rgba(255,255,255,0.55)", fontSize: posSize, letterSpacing: "0.06em" }}>{position}</span>
    </div>
  );
}

export default function Ranking() {
  const [category, setCategory] = useState<Category>("overall");
  const entries = rankingData[category];
  const cat = categories.find((c) => c.key === category)!;
  const top3 = entries.slice(0, 3);
  const myEntry = entries.find((e) => (e as any).isMe);

  return (
    <JogaPage theme="dark" padded={false}>

      {/* ══════════════════════════════════
          HERO — arena dark
      ══════════════════════════════════ */}
      <div
        className="relative overflow-hidden"
        style={{ background: "linear-gradient(160deg, #080d18 0%, #0d1428 50%, #101830 100%)" }}
      >
        {/* Stadium spotlight from top */}
        <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse at 50% -10%, ${cat.glow} 0%, transparent 55%)` }} />
        {/* Diagonal lines texture */}
        <div className="absolute inset-0" style={{ backgroundImage: "repeating-linear-gradient(55deg, transparent, transparent 18px, rgba(255,255,255,0.018) 18px, rgba(255,255,255,0.018) 19px)" }} />

        {/* Header row */}
        <div className="relative flex items-center justify-between px-5 pt-5 pb-2">
          <Link href="/">
            <div className="w-9 h-9 rounded-2xl flex items-center justify-center" style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)" }}>
              <ChevronLeft className="w-5 h-5 text-white" />
            </div>
          </Link>
          <div className="flex flex-col items-center">
            <p className="text-white/30 text-[9px] font-black uppercase tracking-[0.25em]">Classificação</p>
            <p className="font-display font-black text-white text-lg">
              Ranking Global
              <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-amber-400/70 align-middle">Demo</span>
            </p>
          </div>
          <div className="w-9" />
        </div>

        {/* Category selector */}
        <div className="relative flex gap-2 px-5 pb-5 pt-2 overflow-x-auto">
          {categories.map((c) => {
            const isActive = c.key === category;
            return (
              <JogaChip
                key={c.key}
                label={c.label}
                active={isActive}
                onClick={() => setCategory(c.key)}
                color={c.color}
                glow={c.glow}
                testId={`ranking-tab-${c.key}`}
                className="flex items-center gap-1.5"
              />
            );
          })}
        </div>

        {/* ── PODIUM ── */}
        <div className="relative flex items-end justify-center gap-3 px-6 pb-8 pt-2">
          {/* 2nd place */}
          {top3[1] && (
            <div className="flex flex-col items-center gap-2 flex-1">
              <PlayerAvatar overall={top3[1].overall} position={top3[1].position} size="md" />
              <p className="text-white/60 text-[11px] font-bold text-center truncate max-w-[64px]">{top3[1].name.split(" ")[0]}</p>
              <div
                className="w-full flex flex-col items-center justify-end rounded-t-xl py-2"
                style={{ height: 64, background: "linear-gradient(180deg, rgba(148,163,184,0.3), rgba(100,116,139,0.2))", border: "1px solid rgba(148,163,184,0.2)", borderBottom: "none" }}
              >
                <span style={{ fontSize: "1.6rem" }}>🥈</span>
              </div>
            </div>
          )}

          {/* 1st place */}
          {top3[0] && (
            <div className="flex flex-col items-center gap-2 flex-1">
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", top: -18, left: "50%", transform: "translateX(-50%)", fontSize: "1.4rem" }}>👑</span>
                <PlayerAvatar overall={top3[0].overall} position={top3[0].position} size="lg" />
              </div>
              <p className="text-white text-[12px] font-black text-center truncate max-w-[72px]">{top3[0].name.split(" ")[0]}</p>
              <div
                className="w-full flex flex-col items-center justify-end rounded-t-xl py-2"
                style={{
                  height: 96,
                  background: "linear-gradient(180deg, rgba(251,191,36,0.3), rgba(245,158,11,0.15))",
                  border: "1px solid rgba(251,191,36,0.3)",
                  borderBottom: "none",
                  boxShadow: "0 -4px 24px rgba(251,191,36,0.2)",
                }}
              >
                <span style={{ fontSize: "2rem" }}>🥇</span>
              </div>
            </div>
          )}

          {/* 3rd place */}
          {top3[2] && (
            <div className="flex flex-col items-center gap-2 flex-1">
              <PlayerAvatar overall={top3[2].overall} position={top3[2].position} size="md" />
              <p className="text-white/60 text-[11px] font-bold text-center truncate max-w-[64px]">{top3[2].name.split(" ")[0]}</p>
              <div
                className="w-full flex flex-col items-center justify-end rounded-t-xl py-2"
                style={{ height: 44, background: "linear-gradient(180deg, rgba(180,83,9,0.25), rgba(154,52,18,0.15))", border: "1px solid rgba(180,83,9,0.2)", borderBottom: "none" }}
              >
                <span style={{ fontSize: "1.2rem" }}>🥉</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════
          FULL LIST
      ══════════════════════════════════ */}
      <div className="px-4 pt-4 space-y-2.5 pb-4">

        {/* My position callout (if not in top 3) */}
        {myEntry && myEntry.rank > 3 && (
          <div
            className="rounded-2xl px-4 py-3 flex items-center gap-3 mb-4"
            style={{ background: "rgba(22,163,74,0.1)", border: "1.5px solid rgba(22,163,74,0.3)" }}
          >
            <span className="text-emerald-400 text-lg font-black font-display">{myEntry.rank}º</span>
            <div className="flex-1">
              <p className="text-emerald-400 text-sm font-bold">A tua posição</p>
              <p className="text-white/40 text-xs">Joga mais para subir no ranking</p>
            </div>
            <span className="font-display font-black text-emerald-400 text-2xl">{myEntry.value}</span>
          </div>
        )}

        {entries.map((entry, idx) => {
          const isMe = (entry as any).isMe;
          const posColor = posColors[entry.position] || "#9ca3af";
          return (
            <div
              key={entry.rank}
              className="flex items-center gap-3 px-4 py-3 rounded-2xl"
              style={{
                background: isMe ? "rgba(22,163,74,0.08)" : "rgba(255,255,255,0.04)",
                border: isMe ? "1.5px solid rgba(22,163,74,0.25)" : "1px solid rgba(255,255,255,0.06)",
              }}
              data-testid={`ranking-entry-${entry.rank}`}
            >
              {/* Rank */}
              <div className="w-8 shrink-0 text-center">
                {idx < 3 ? (
                  <span className="text-xl">{["🥇","🥈","🥉"][idx]}</span>
                ) : (
                  <span className="font-display font-bold text-white/30 text-lg">{entry.rank}</span>
                )}
              </div>

              {/* Avatar */}
              <div style={{
                width: 38, height: 38, borderRadius: "50%", flexShrink: 0,
                background: `${posColor}22`, border: `1.5px solid ${posColor}55`,
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              }}>
                <span style={{ fontWeight: 900, color: "white", fontSize: "0.9rem", lineHeight: 1 }}>{entry.overall}</span>
                <span style={{ fontWeight: 700, color: "rgba(255,255,255,0.45)", fontSize: "0.48rem", letterSpacing: "0.06em" }}>{entry.position}</span>
              </div>

              {/* Name */}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate" style={{ color: isMe ? "#4ade80" : "rgba(255,255,255,0.85)" }}>
                  {entry.name}{isMe ? " (Tu)" : ""}
                </p>
                <p className="text-[11px]" style={{ color: posColor, opacity: 0.7 }}>{entry.position}</p>
              </div>

              {/* Value */}
              <div className="text-right shrink-0">
                <p className="font-display font-black text-2xl leading-none" style={{ color: idx === 0 ? cat.color : isMe ? "#4ade80" : "rgba(255,255,255,0.9)" }}>
                  {entry.value}
                </p>
                <p className="text-[10px] uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.3)" }}>{entry.label}</p>
              </div>
            </div>
          );
        })}
      </div>
    </JogaPage>
  );
}
