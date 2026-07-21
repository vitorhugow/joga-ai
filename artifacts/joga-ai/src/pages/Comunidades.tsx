import { Search, Plus, X, Users } from "lucide-react";
import { SponsorSlot } from "@/components/SponsorSlot";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  loadCommunities,
  loadMyCommunities,
  type Community,
} from "@/lib/communityRepository";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthGate } from "@/contexts/AuthGateContext";
import { JogaChip, JogaPage } from "@/components/joga";
import { imageDisplaySrc, resolveCommunityCover } from "@/lib/imageUtils";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

const gameTypeLabel: Record<string, string> = {
  futsal: "Futsal",
  fut5: "Fut 5",
  fut7: "Fut 7",
  futebol11: "Fut 11",
};

const gameTypeAccent: Record<string, { color: string; bg: string }> = {
  futsal: { color: "#c084fc", bg: "rgba(192,132,252,0.2)" },
  fut5: { color: "#60a5fa", bg: "rgba(96,165,250,0.2)" },
  fut7: { color: "#4ade80", bg: "rgba(74,222,128,0.2)" },
  futebol11: { color: "#fbbf24", bg: "rgba(251,191,36,0.2)" },
};

const clubColors = [
  "linear-gradient(135deg, #15803d, #16a34a)",
  "linear-gradient(135deg, #1d4ed8, #2563eb)",
  "linear-gradient(135deg, #7c3aed, #6d28d9)",
  "linear-gradient(135deg, #b91c1c, #dc2626)",
  "linear-gradient(135deg, #b45309, #d97706)",
];

const PITCH_BG = `url("data:image/svg+xml,%3Csvg width='80' height='80' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 40 L80 40' stroke='rgba(255,255,255,0.04)' stroke-width='1'/%3E%3Ccircle cx='40' cy='40' r='20' stroke='rgba(255,255,255,0.03)' stroke-width='1' fill='none'/%3E%3C/svg%3E")`;

function CommunityCard({
  id,
  name,
  city,
  memberCount,
  gameType,
  coverImage,
  coverUrl,
  joined,
  proActive,
}: {
  id: string;
  name: string;
  city: string;
  memberCount: number;
  gameType: string;
  coverImage?: string;
  coverUrl?: string;
  joined?: boolean;
  proActive?: boolean;
}) {
  const accent = gameTypeAccent[gameType] || { color: "#9ca3af", bg: "rgba(156,163,175,0.2)" };
  const abbr = name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const clubBg = clubColors[parseInt(id, 36) % clubColors.length];
  const coverSrc = resolveCommunityCover({ coverUrl, coverImage });

  return (
    <Link href={`/comunidades/${id}`} data-testid={`community-card-${id}`}>
      <div
        className="rounded-2xl overflow-hidden active:scale-[0.98] transition-all"
        style={{
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 2px 16px rgba(0,0,0,0.3)",
        }}
      >
        <div className="relative h-28 overflow-hidden">
          {coverSrc ? (
            <img src={imageDisplaySrc(coverSrc)} alt={name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full" style={{ background: clubBg }} />
          )}
          <div
            className="absolute inset-0"
            style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.7) 100%)" }}
          />
          <div className="absolute left-3 bottom-3 flex items-end gap-2.5">
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center font-display font-black text-white shadow-lg shrink-0"
              style={{ background: clubBg, border: "2px solid rgba(255,255,255,0.25)", fontSize: "0.9rem" }}
            >
              {abbr}
            </div>
            <div>
              <h3 className="font-display font-black text-white text-base leading-tight drop-shadow">
                {name}
                {proActive && (
                  <span className="ml-1.5 text-[9px] font-black uppercase text-amber-300">✦ PRO</span>
                )}
              </h3>
              <p className="text-white/55 text-xs font-medium">📍 {city}</p>
            </div>
          </div>
          <div
            className="absolute top-3 right-3 px-2.5 py-1 rounded-full text-[11px] font-black"
            style={{ background: accent.bg, color: accent.color, backdropFilter: "blur(8px)" }}
          >
            {gameTypeLabel[gameType] || gameType}
          </div>
        </div>

        <div
          className="px-4 py-3 flex items-center justify-between"
          style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}
        >
          <div className="flex items-center gap-1.5 text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>
            <Users className="w-3.5 h-3.5" />
            <span className="font-medium">{memberCount} membros</span>
          </div>
          <div
            className="text-xs font-black px-3 py-1.5 rounded-full"
            style={
              joined
                ? {
                    background: "rgba(74,222,128,0.12)",
                    color: "#4ade80",
                    border: "1px solid rgba(74,222,128,0.25)",
                  }
                : { background: "linear-gradient(135deg, #15803d, #16a34a)", color: "white" }
            }
          >
            {joined ? "✓ Membro" : "Ver"}
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function Comunidades() {
  useDocumentTitle("Clubes");
  const { userId } = useAuth();
  const { requireLinked } = useAuthGate();
  const [, setLocation] = useLocation();
  const [location] = useLocation();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("todas");
  const [view, setView] = useState<"descobrir" | "minhas">("minhas");
  const [allCommunities, setAllCommunities] = useState<Community[]>([]);
  const [myCommunities, setMyCommunities] = useState<Community[]>([]);
  const [loadingCommunities, setLoadingCommunities] = useState(true);

  useEffect(() => {
    setLoadingCommunities(true);
    Promise.all([
      loadCommunities(userId),
      userId ? loadMyCommunities(userId) : Promise.resolve([] as Community[]),
    ])
      .then(([all, mine]) => {
        setAllCommunities(all);
        setMyCommunities(mine);
      })
      .finally(() => setLoadingCommunities(false));
  }, [userId, location]);

  const mergedMyCommunities = useMemo(() => {
    const byId = new Map<string, Community>();
    for (const c of myCommunities) byId.set(c.id, c);
    for (const c of allCommunities.filter((row) => row.isMember)) {
      if (!byId.has(c.id)) byId.set(c.id, { ...c, isMember: true });
    }
    return Array.from(byId.values());
  }, [myCommunities, allCommunities]);

  const filters = ["todas", "fut5", "fut7", "futebol11"];
  const filterLabels: Record<string, string> = {
    todas: "Todas",
    fut5: "Fut 5",
    fut7: "Fut 7",
    futebol11: "Fut 11",
  };

  function matchesGameTypeFilter(gameType: string) {
    if (filter === "todas") return true;
    if (filter === "fut5") return gameType === "fut5" || gameType === "futsal";
    return gameType === filter;
  }

  function matchesSearch(c: Community) {
    return (
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.city.toLowerCase().includes(search.toLowerCase())
    );
  }

  const filtered = allCommunities.filter(
    (c) => matchesSearch(c) && matchesGameTypeFilter(c.gameType),
  );

  const myIds = new Set(mergedMyCommunities.map((c) => c.id));
  const discoverList = filtered.filter(
    (c) => !myIds.has(c.id) && !c.isMember && !(c as Community & { joinPending?: boolean }).joinPending,
  );
  const myFilteredList = mergedMyCommunities.filter(
    (c) => matchesSearch(c) && matchesGameTypeFilter(c.gameType),
  );

  return (
    <JogaPage theme="dark" padded={false}>
      <div
        className="relative overflow-hidden"
        style={{ background: "linear-gradient(155deg, #031408 0%, #052010 28%, #0a5a1e 65%, #0d6826 100%)" }}
      >
        <img
          src="/home/hero-ball.webp"
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          className="absolute inset-0 w-full h-full object-cover"
          style={{ objectPosition: "center 35%" }}
          onError={(e) => { e.currentTarget.style.display = "none"; }}
        />
        <div className="absolute inset-0" style={{ background: "linear-gradient(155deg, rgba(3,20,8,0.55) 0%, rgba(5,32,16,0.5) 28%, rgba(10,90,30,0.38) 65%, rgba(13,104,38,0.28) 100%)" }} />
        <div className="absolute inset-0" style={{ backgroundImage: PITCH_BG, backgroundSize: "80px 80px" }} />
        <div
          className="absolute inset-0"
          style={{ background: "radial-gradient(ellipse at 50% 110%, rgba(22,163,74,0.2) 0%, transparent 60%)" }}
        />

        <div className="relative flex items-center justify-between px-5 pt-5 pb-3">
          <div>
            <p className="text-white/35 text-[10px] font-black uppercase tracking-[0.22em]">Explorar</p>
            <h1 className="font-display font-black text-white text-2xl tracking-tight">Clubes</h1>
          </div>
          <button
            type="button"
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl active:scale-95 transition-transform"
            style={{ background: "rgba(74,222,128,0.15)", border: "1.5px solid rgba(74,222,128,0.3)" }}
            data-testid="button-create-community"
            onClick={() => {
              if (requireLinked({ mode: "register", title: "Cria conta para criar clube" })) {
                setLocation("/comunidades/criar");
              }
            }}
          >
            <Plus className="w-4 h-4 text-emerald-400" />
            <span className="text-emerald-400 text-sm font-bold">Criar</span>
          </button>
        </div>

        <div className="relative px-5 pb-10">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/35 pointer-events-none" />
            <input
              type="search"
              placeholder="Pesquisar clubes, cidade..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-3 rounded-2xl text-sm focus:outline-hidden"
              style={{
                background: "rgba(255,255,255,0.09)",
                border: "1px solid rgba(255,255,255,0.14)",
                color: "white",
                caretColor: "#4ade80",
              }}
              data-testid="input-search-communities"
            />
          </div>
        </div>
      </div>

      <div
        className="relative z-10 -mt-5 rounded-t-[24px] px-4 pt-4 space-y-5"
        style={{ background: "#0a0f1a" }}
      >
        <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl" style={{ background: "rgba(255,255,255,0.05)" }}>
          <button
            type="button"
            onClick={() => setView("minhas")}
            data-testid="tab-minhas-comunidades"
            className="py-2.5 rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-1.5"
            style={
              view === "minhas"
                ? { background: "rgba(74,222,128,0.15)", color: "#4ade80", border: "1px solid rgba(74,222,128,0.3)" }
                : { background: "transparent", color: "rgba(255,255,255,0.45)", border: "1px solid transparent" }
            }
          >
            Minhas
            {mergedMyCommunities.length > 0 && (
              <span
                className="text-[10px] font-black px-1.5 py-0.5 rounded-full"
                style={{
                  background: view === "minhas" ? "rgba(74,222,128,0.25)" : "rgba(255,255,255,0.1)",
                  color: view === "minhas" ? "#4ade80" : "rgba(255,255,255,0.5)",
                }}
              >
                {mergedMyCommunities.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setView("descobrir")}
            data-testid="tab-descobrir-comunidades"
            className="py-2.5 rounded-xl text-sm font-bold transition-colors"
            style={
              view === "descobrir"
                ? { background: "rgba(74,222,128,0.15)", color: "#4ade80", border: "1px solid rgba(74,222,128,0.3)" }
                : { background: "transparent", color: "rgba(255,255,255,0.45)", border: "1px solid transparent" }
            }
          >
            Descobrir
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {filters.map((f) => (
            <JogaChip
              key={f}
              label={filterLabels[f]}
              active={filter === f}
              onClick={() => setFilter(f)}
              testId={`filter-${f}`}
            />
          ))}
          {filter !== "todas" && (
            <button
              type="button"
              onClick={() => setFilter("todas")}
              className="shrink-0 flex items-center gap-1 px-3 py-2 rounded-full text-sm font-bold"
              style={{
                background: "rgba(239,68,68,0.12)",
                color: "#f87171",
                border: "1px solid rgba(239,68,68,0.2)",
              }}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {loadingCommunities && (
          <p className="text-white/40 text-sm text-center py-4">A carregar clubes…</p>
        )}

        {!loadingCommunities && view === "minhas" ? (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display font-black text-white text-lg">As Minhas</h2>
              <span
                className="text-xs font-bold px-2.5 py-1 rounded-full"
                style={{ color: "rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.06)" }}
              >
                {myFilteredList.length}
              </span>
            </div>
            {myFilteredList.length === 0 ? (
              <div className="text-center py-16 flex flex-col items-center gap-4">
                <div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl"
                  style={{ background: "rgba(255,255,255,0.05)" }}
                >
                  🙋
                </div>
                <div>
                  <p className="font-display font-bold text-white text-lg">
                    {mergedMyCommunities.length === 0 ? "Ainda não entraste em nenhum" : "Sem resultados"}
                  </p>
                  <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.35)" }}>
                    {mergedMyCommunities.length === 0
                      ? "Explora em «Descobrir» e entra num clube da tua zona."
                      : "Tenta outra pesquisa ou filtro."}
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                {myFilteredList.map((c) => (
                  <CommunityCard key={c.id} {...c} joined />
                ))}
              </div>
            )}
          </div>
        ) : (
          !loadingCommunities && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-display font-black text-white text-lg">
                  {search || filter !== "todas" ? "Resultados" : "Descobrir"}
                </h2>
                <span
                  className="text-xs font-bold px-2.5 py-1 rounded-full"
                  style={{ color: "rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.06)" }}
                >
                  {discoverList.length}
                </span>
              </div>
              {discoverList.length === 0 ? (
                <div className="text-center py-16 flex flex-col items-center gap-4">
                  <div
                    className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl"
                    style={{ background: "rgba(255,255,255,0.05)" }}
                  >
                    🏟️
                  </div>
                  <div>
                    <p className="font-display font-bold text-white text-lg">Sem clubes ainda</p>
                    <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.35)" }}>
                      Sê o primeiro a criar um clube para a tua malta.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-5">
                  {discoverList.map((c) => (
                    <CommunityCard key={c.id} {...c} joined={false} />
                  ))}
                </div>
              )}
            </div>
          )
        )}

        {!loadingCommunities && <SponsorSlot className="mt-6" />}
      </div>
    </JogaPage>
  );
}
