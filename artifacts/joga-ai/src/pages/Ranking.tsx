import { useEffect, useMemo, useState } from "react";
import { Trophy, Target, TrendingUp, Star, ChevronLeft, Globe2, ArrowUp, ArrowDown } from "lucide-react";
import { Link } from "wouter";
import { useUserProfile } from "@/hooks/useUserProfile";
import { calculateOverall } from "@/lib/cardUtils";
import {
  getOverallDeltaFromDeltas,
  loadGlobalRanking,
  profileToPlayerCard,
  type PublicPlayerProfile,
} from "@/lib/userRepository";
import { useUserId } from "@/contexts/AuthContext";
import { loadBlockedIds, filterBlocked } from "@/lib/blockRepository";
import { JogaButton, JogaChip, JogaPage } from "@/components/joga";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { imageDisplaySrc } from "@/lib/imageUtils";
import { PlayerCard } from "@/components/PlayerCard";

type Category = "overall" | "golos" | "assistencias" | "notas";

type RankedEntry = PublicPlayerProfile & { rank: number };

/** Configuração da liga atual — trocar scopeId/título para ligas regionais no futuro */
const LEAGUE = {
  scopeId: "global",
  title: "Liga Global",
  subtitle: "Compete com jogadores de todo o país.",
  ovrHint: "Ganhas OVR ao jogar, marcar, ajudar e seres bem avaliado.",
} as const;

const PODIUM_COLORS = {
  1: { ring: "#fbbf24", label: "Ouro", bg: "rgba(251,191,36,0.12)" },
  2: { ring: "#cbd5e1", label: "Prata", bg: "rgba(203,213,225,0.1)" },
  3: { ring: "#d97706", label: "Bronze", bg: "rgba(217,119,6,0.12)" },
} as const;

const categories: { key: Category; label: string; icon: typeof Trophy; color: string }[] = [
  { key: "overall", label: "Overall", icon: Star, color: "#fbbf24" },
  { key: "golos", label: "Golos", icon: Target, color: "#4ade80" },
  { key: "assistencias", label: "Assist.", icon: TrendingUp, color: "#60a5fa" },
  { key: "notas", label: "Notas", icon: Star, color: "#c084fc" },
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

function entryToCardProps(entry: PublicPlayerProfile) {
  return {
    name: entry.displayName,
    position: entry.position,
    shirtNumber: entry.shirtNumber,
    title: entry.title,
    attributes: entry.attributes,
    photoUrl: entry.photoUrl ? imageDisplaySrc(entry.photoUrl) : undefined,
  };
}

function evolutionLabel(entry: PublicPlayerProfile): string | null {
  if (!entry.lastAttributeDeltas || Object.keys(entry.lastAttributeDeltas).length === 0) {
    return null;
  }
  const delta = getOverallDeltaFromDeltas(entry.attributes, entry.lastAttributeDeltas);
  if (delta === 0) return null;
  return delta > 0 ? `+${delta} OVR` : `${delta} OVR`;
}

function PodiumCard({
  entry,
  place,
}: {
  entry: RankedEntry;
  place: 1 | 2 | 3;
}) {
  const style = PODIUM_COLORS[place];
  const evo = evolutionLabel(entry);
  const cardWidth = place === 1 ? 96 : 84;

  return (
    <Link href={`/jogador/${entry.userId}`} className="flex flex-col items-center joga-tap min-w-0">
      <div
        className="relative rounded-2xl px-2 pt-3 pb-2 w-full flex flex-col items-center"
        style={{
          background: style.bg,
          border: `1.5px solid ${style.ring}44`,
        }}
      >
        <span
          className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full"
          style={{ background: style.ring, color: "#0a0f1a" }}
        >
          {place}.º
        </span>
        <div style={{ width: cardWidth, flexShrink: 0 }}>
          <PlayerCard {...entryToCardProps(entry)} size="small" className="w-full! max-w-full!" />
        </div>
        <p className="font-display font-black text-white text-sm mt-2 truncate max-w-full text-center">
          {entry.displayName}
        </p>
        <p className="text-white/50 text-sm font-semibold">OVR {entry.overall}</p>
        {evo && (
          <p className="text-emerald-400 text-xs font-bold mt-0.5">{evo}</p>
        )}
      </div>
    </Link>
  );
}

function UserLeagueCard({
  rank,
  overall,
  hasPlayed,
  weeklyDelta,
}: {
  rank: number | null;
  overall: number;
  hasPlayed: boolean;
  weeklyDelta?: number | null;
}) {
  if (!hasPlayed) {
    return (
      <div
        className="rounded-2xl px-4 py-4 text-center"
        style={{
          background: "linear-gradient(135deg, rgba(22,163,74,0.1), rgba(22,163,74,0.04))",
          border: "1.5px solid rgba(74,222,128,0.25)",
        }}
      >
        <p className="text-white/70 text-sm leading-relaxed">
          Joga a tua primeira pelada para entrares na Liga.
        </p>
        <Link href="/jogos">
          <JogaButton variant="primary" size="sm" className="mt-3">
            Ver jogos abertos
          </JogaButton>
        </Link>
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl px-4 py-3.5 flex items-center justify-between gap-3"
      style={{
        background: "linear-gradient(135deg, rgba(22,163,74,0.14), rgba(22,163,74,0.05))",
        border: "1.5px solid rgba(74,222,128,0.3)",
        boxShadow: "0 4px 20px rgba(22,163,74,0.12)",
      }}
      data-testid="user-league-card"
    >
      <div>
        <p className="text-white/40 text-[10px] font-bold uppercase tracking-[0.18em]">A tua posição</p>
        <p className="font-display font-black text-3xl text-white mt-0.5">
          #{rank ?? "—"}
        </p>
        {weeklyDelta != null && weeklyDelta !== 0 && (
          <p
            className="flex items-center gap-1 text-sm font-bold mt-1"
            style={{ color: weeklyDelta > 0 ? "#4ade80" : "#f87171" }}
          >
            {weeklyDelta > 0 ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />}
            {weeklyDelta > 0 ? `+${weeklyDelta}` : weeklyDelta} esta semana
          </p>
        )}
      </div>
      <div className="text-right">
        <p className="text-white/40 text-[10px] font-bold uppercase tracking-[0.18em]">OVR atual</p>
        <p className="font-display font-black text-3xl text-emerald-400">{overall}</p>
      </div>
    </div>
  );
}

export default function Ranking() {
  useDocumentTitle(LEAGUE.title);
  const userId = useUserId();
  const { profile } = useUserProfile();
  const player = profileToPlayerCard(profile);
  const myOverall = calculateOverall(player.attributes);
  const [category, setCategory] = useState<Category>("overall");
  const [players, setPlayers] = useState<PublicPlayerProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set());

  const hasPlayed = (profile.seasonStats?.matches ?? 0) > 0;

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
            lastAttributeDeltas: profile.lastAttributeDeltas,
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
  }, [userId, profile.profileComplete, profile.displayName, profile.position, profile.photoUrl, profile.shirtNumber, profile.title, profile.attributes, profile.seasonStats, profile.lastAttributeDeltas, myOverall]);

  const fullRanked = useMemo((): RankedEntry[] => {
    return filterBlocked(players, blockedIds)
      .sort((a, b) => categoryValue(b, category) - categoryValue(a, category))
      .map((entry, index) => ({ ...entry, rank: index + 1 }));
  }, [players, category, blockedIds]);

  const myRank = useMemo(() => {
    if (!userId) return null;
    const found = fullRanked.find((e) => e.userId === userId);
    return found?.rank ?? null;
  }, [fullRanked, userId]);

  const podium = fullRanked.slice(0, 3);
  const listFrom4 = fullRanked.slice(3, 50);
  const cat = categories.find((c) => c.key === category)!;

  const podiumOrder: Array<{ entry: RankedEntry; place: 1 | 2 | 3 }> = [
    podium[1] ? { entry: podium[1], place: 2 } : null,
    podium[0] ? { entry: podium[0], place: 1 } : null,
    podium[2] ? { entry: podium[2], place: 3 } : null,
  ].filter(Boolean) as Array<{ entry: RankedEntry; place: 1 | 2 | 3 }>;

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
            {LEAGUE.title}
          </p>
          <h1 className="font-display font-black text-white text-2xl">{LEAGUE.title}</h1>
          <p className="text-white/45 text-sm mt-0.5">{LEAGUE.subtitle}</p>
        </div>
      </div>

      <div className="px-4 space-y-4">
        <UserLeagueCard
          rank={myRank}
          overall={myOverall}
          hasPlayed={hasPlayed && profile.profileComplete}
          weeklyDelta={null}
        />

        <p className="text-white/35 text-sm text-center leading-snug">{LEAGUE.ovrHint}</p>

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
          <p className="text-white/40 text-sm text-center py-10">A carregar a {LEAGUE.title.toLowerCase()}…</p>
        ) : fullRanked.length === 0 ? (
          <div className="text-center py-20">
            <Trophy className="w-12 h-12 text-white/20 mx-auto mb-4" />
            <h2 className="font-display font-black text-white text-xl">Liga em breve</h2>
            <p className="text-white/40 text-sm mt-2 max-w-xs mx-auto">
              Completa o teu cartão de jogador para apareceres na liga.
            </p>
          </div>
        ) : (
          <>
            {podium.length > 0 && (
              <div
                className="grid gap-2 items-end pt-2"
                style={{ gridTemplateColumns: "1fr 1.15fr 1fr" }}
                data-testid="ranking-podium"
              >
                {podiumOrder.map(({ entry, place }) => (
                  <div
                    key={entry.userId}
                    className={place === 1 ? "pt-0" : "pt-4"}
                  >
                    <PodiumCard entry={entry} place={place} />
                  </div>
                ))}
              </div>
            )}

            {listFrom4.length > 0 && (
              <div className="space-y-2">
                {listFrom4.map((entry) => {
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
                          className="w-7 text-center font-display font-black text-sm shrink-0"
                          style={{ color: "rgba(255,255,255,0.35)" }}
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
                          <p className="text-white/40 text-sm">{entry.position} · OVR {entry.overall}</p>
                        </div>
                        <span className="font-display font-black text-xl" style={{ color: cat.color }}>
                          {formatValue(categoryValue(entry, category), category)}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </JogaPage>
  );
}
