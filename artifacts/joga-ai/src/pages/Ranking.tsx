import { useEffect, useMemo, useState } from "react";
import { Trophy, Target, TrendingUp, Star, ChevronLeft, Globe2 } from "lucide-react";
import { Link } from "wouter";
import { useUserProfile } from "@/hooks/useUserProfile";
import { calculateOverall } from "@/lib/cardUtils";
import { loadGlobalRanking, profileToPlayerCard, type PublicPlayerProfile } from "@/lib/userRepository";
import { useUserId } from "@/contexts/AuthContext";
import { loadBlockedIds, filterBlocked } from "@/lib/blockRepository";
import { JogaChip, JogaPage } from "@/components/joga";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { imageDisplaySrc } from "@/lib/imageUtils";

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

function categoryValue(entry: PublicPlayerProfile, category: Category): number {
  switch (category) {
    case "golos":
      return entry.seasonStats?.goals ?? 0;
    case "assistencias":
      return entry.seasonStats?.assists ?? 0;
    case "notas":
      return entry.seasonStats?.averageRating ?? 0;
    default:
      return entry.overall;
  }
}

function formatValue(value: number, category: Category): string {
  if (category === "notas") return value > 0 ? value.toFixed(1) : "—";
  return String(value);
}

export default function Ranking() {
  useDocumentTitle("Ranking");
  const userId = useUserId();
  const { profile } = useUserProfile();
  const player = profileToPlayerCard(profile);
  const myOverall = calculateOverall(player.attributes);
  const [category, setCategory] = useState<Category>("overall");
  const [players, setPlayers] = useState<PublicPlayerProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!userId) {
      setBlockedIds(new Set());
      return;
    }
    void loadBlockedIds(userId).then(setBlockedIds);
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadGlobalRanking()
      .then((remote) => {
        if (cancelled) return;

        const byId = new Map<string, PublicPlayerProfile>();
        for (const entry of remote) byId.set(entry.userId, entry);

        // Garante que o próprio jogador aparece, mesmo que a leitura global
        // falhe/esteja a meio de propagar (regras não são instantâneas).
        if (profile.profileComplete && userId && !byId.has(userId)) {
          byId.set(userId, {
            userId,
            displayName: profile.displayName,
            position: profile.position,
            photoUrl: profile.photoUrl,
            overall: myOverall,
            shirtNumber: profile.shirtNumber,
            title: profile.title,
            attributes: profile.attributes,
            seasonStats: profile.seasonStats,
          });
        }

        setPlayers([...byId.values()]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, profile.profileComplete]);

  const ranked = useMemo(() => {
    return filterBlocked(players, blockedIds)
      .sort((a, b) => categoryValue(b, category) - categoryValue(a, category))
      .slice(0, 50)
      .map((entry, index) => ({ ...entry, rank: index + 1 }));
  }, [players, category, blockedIds]);

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
          <p className="text-white/40 text-[10px] font-bold uppercase tracking-[0.2em] flex items-center gap-1.5">
            <Globe2 className="w-3 h-3" />
            Liga Global
          </p>
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

        {loading ? (
          <p className="text-white/40 text-sm text-center py-10">A carregar a liga global…</p>
        ) : ranked.length === 0 ? (
          <div className="text-center py-20">
            <Trophy className="w-12 h-12 text-white/20 mx-auto mb-4" />
            <h2 className="font-display font-black text-white text-xl">Liga em breve</h2>
            <p className="text-white/40 text-sm mt-2 max-w-xs mx-auto">
              Completa o teu cartão de jogador para apareceres no ranking global.
            </p>
          </div>
        ) : (
          <>
            <p className="text-white/35 text-xs text-center mb-1">
              Top {ranked.length} jogadores de todas as comunidades, por {cat.label.toLowerCase()}.
            </p>
            <div className="space-y-2">
              {ranked.map((entry) => {
                const isMe = entry.userId === userId;
                return (
                  <Link key={entry.userId} href={`/jogador/${entry.userId}`}>
                    <div
                      className="rounded-2xl px-4 py-3 flex items-center gap-3 active:scale-[0.98] transition-transform"
                      style={
                        isMe
                          ? { background: "rgba(22,163,74,0.08)", border: "1px solid rgba(74,222,128,0.2)" }
                          : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }
                      }
                    >
                      <span
                        className="w-6 text-center font-display font-black text-sm shrink-0"
                        style={{ color: entry.rank <= 3 ? "#fbbf24" : "rgba(255,255,255,0.35)" }}
                      >
                        {entry.rank}
                      </span>

                      {entry.photoUrl ? (
                        <img
                          src={imageDisplaySrc(entry.photoUrl)}
                          alt={entry.displayName}
                          className="w-11 h-11 rounded-full object-cover shrink-0"
                          style={{ border: `2px solid ${posColors[entry.position] || "#9ca3af"}88` }}
                        />
                      ) : (
                        <div
                          className="w-11 h-11 rounded-full flex flex-col items-center justify-center shrink-0"
                          style={{
                            background: `radial-gradient(circle, ${posColors[entry.position] || "#9ca3af"}cc, ${posColors[entry.position] || "#9ca3af"}55)`,
                            border: `2px solid ${posColors[entry.position] || "#9ca3af"}88`,
                          }}
                        >
                          <span className="font-black text-white text-sm leading-none">{entry.overall}</span>
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <p
                          className="font-semibold truncate"
                          style={{ color: isMe ? "#6ee7a5" : "rgba(255,255,255,0.85)" }}
                        >
                          {entry.displayName}
                          {isMe ? " (Tu)" : ""}
                        </p>
                        <p className="text-white/35 text-xs">{entry.position} · OVR {entry.overall}</p>
                      </div>
                      <span className="font-display font-black text-xl" style={{ color: cat.color }}>
                        {formatValue(categoryValue(entry, category), category)}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </div>
    </JogaPage>
  );
}
