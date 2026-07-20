import { useEffect, useMemo, useState } from "react";
import { Search, SlidersHorizontal, Plus, X } from "lucide-react";
import { Link } from "wouter";
import { MatchCard } from "@/components/MatchCard";
import { loadMyMatches, subscribeAvailableMatches, type MatchListing } from "@/lib/communityRepository";
import { useAuthGate } from "@/contexts/AuthGateContext";
import { useAuth } from "@/contexts/AuthContext";
import { JogaButton, JogaChip, JogaPage } from "@/components/joga";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

const PITCH_BG = `url("data:image/svg+xml,%3Csvg width='80' height='80' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 40 L80 40' stroke='rgba(255,255,255,0.04)' stroke-width='1'/%3E%3Ccircle cx='40' cy='40' r='20' stroke='rgba(255,255,255,0.03)' stroke-width='1' fill='none'/%3E%3C/svg%3E")`;

const cities = ["todas", "Lisboa", "Porto", "Braga", "Setúbal"];
const cityLabels: Record<string, string> = { todas: "Todas", Lisboa: "Lisboa", Porto: "Porto", Braga: "Braga", Setúbal: "Setúbal" };
const types = ["todos", "futsal", "fut5", "fut7", "futebol11"];
const typeLabels: Record<string, string> = { todos: "Todos", futsal: "Futsal", fut5: "Fut 5", fut7: "Fut 7", futebol11: "Fut 11" };

export default function Jogos() {
  useDocumentTitle("Jogos");
  const { requireLinked } = useAuthGate();
  const { isLinked, userId } = useAuth();
  const [view, setView] = useState<"descobrir" | "minhas">("descobrir");
  const [search, setSearch] = useState("");
  const [cityFilter, setCityFilter] = useState("todas");
  const [typeFilter, setTypeFilter] = useState("todos");
  const [showFilters, setShowFilters] = useState(false);
  const [allMatches, setAllMatches] = useState<MatchListing[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(true);
  const [myMatches, setMyMatches] = useState<MatchListing[]>([]);
  const [loadingMyMatches, setLoadingMyMatches] = useState(true);

  useEffect(() => {
    setLoadingMatches(true);
    const unsub = subscribeAvailableMatches(
      (matches) => {
        setAllMatches(matches);
        setLoadingMatches(false);
      },
      50,
      userId ?? undefined,
    );
    return unsub;
  }, [userId]);

  /** Partidas já presentes em "Minhas" não repetem em Descobrir. */
  const discoverMatches = useMemo(() => {
    const myIds = new Set(myMatches.map((m) => m.id));
    return allMatches.filter((m) => !myIds.has(m.id));
  }, [allMatches, myMatches]);

  useEffect(() => {
    if (!userId) {
      setMyMatches([]);
      setLoadingMyMatches(false);
      return;
    }
    setLoadingMyMatches(true);
    loadMyMatches(userId)
      .then(setMyMatches)
      .finally(() => setLoadingMyMatches(false));
  }, [userId]);

  const filtered = discoverMatches.filter((m) => {
    const s = m.title.toLowerCase().includes(search.toLowerCase()) || m.city.toLowerCase().includes(search.toLowerCase());
    const c = cityFilter === "todas" || m.city === cityFilter;
    const t = typeFilter === "todos" || m.gameType === typeFilter;
    return s && c && t;
  });

  const available = filtered.filter((m) => m.spotsRemaining !== "Lotado");
  const full = filtered.filter((m) => m.spotsRemaining === "Lotado");
  const hasFilters = cityFilter !== "todas" || typeFilter !== "todos";

  return (
    <JogaPage theme="dark" padded={false} bottomSpace>
      <div className="relative overflow-hidden" style={{ background: "linear-gradient(155deg, #031408 0%, #052010 28%, #0a5a1e 65%, #0d6826 100%)" }}>
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
        <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 50% 110%, rgba(22,163,74,0.2) 0%, transparent 60%)" }} />

        <div className="relative flex items-center justify-between px-5 pt-6 pb-4">
          <div>
            <p className="text-white/35 text-[10px] font-black uppercase tracking-[0.22em]">Descobre</p>
            <h1 className="font-display font-black text-white text-2xl tracking-tight leading-tight">Jogos</h1>
          </div>
          <Link
            href={isLinked ? "/criar-partida" : "#"}
            onClick={(e) => {
              if (!isLinked) {
                e.preventDefault();
                requireLinked({ mode: "register", title: "Cria conta para organizar partidas" });
              }
            }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl active:scale-95 transition-transform"
            style={{ background: "rgba(74,222,128,0.15)", border: "1.5px solid rgba(74,222,128,0.3)" }}
            data-testid="button-create-match-header"
          >
            <Plus className="w-4 h-4 text-emerald-400" />
            <span className="text-emerald-400 text-sm font-bold">Criar</span>
          </Link>
        </div>

        <div className="relative px-5 pb-10">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "rgba(255,255,255,0.35)" }} />
              <input
                type="search"
                placeholder="Pesquisar jogos, cidade..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-2xl text-sm focus:outline-hidden"
                style={{ background: "rgba(255,255,255,0.09)", border: "1px solid rgba(255,255,255,0.14)", color: "white", caretColor: "#4ade80" }}
                data-testid="input-search-matches"
              />
            </div>
            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 active:scale-95 transition-all"
              style={{ background: showFilters ? "rgba(74,222,128,0.2)" : "rgba(255,255,255,0.09)", border: showFilters ? "1.5px solid rgba(74,222,128,0.4)" : "1px solid rgba(255,255,255,0.14)" }}
              data-testid="button-toggle-filters"
            >
              {showFilters ? <X className="w-4 h-4 text-emerald-400" /> : <SlidersHorizontal className="w-4 h-4" style={{ color: "rgba(255,255,255,0.5)" }} />}
            </button>
          </div>

          {showFilters && (
            <div className="mt-3 space-y-3">
              <div className="flex gap-2 overflow-x-auto pb-1">
                {cities.map((c) => (
                  <JogaChip key={c} label={cityLabels[c]} active={cityFilter === c} onClick={() => setCityFilter(c)} />
                ))}
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {types.map((t) => (
                  <JogaChip key={t} label={typeLabels[t]} active={typeFilter === t} onClick={() => setTypeFilter(t)} />
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-9" style={{ background: "#0a0f1a", borderRadius: "20px 20px 0 0" }} />
      </div>

      <div className="px-4 pt-5 space-y-6">
        <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl" style={{ background: "rgba(255,255,255,0.05)" }}>
          <button
            type="button"
            onClick={() => setView("descobrir")}
            data-testid="tab-descobrir-jogos"
            className="py-2.5 rounded-xl text-sm font-bold transition-colors"
            style={
              view === "descobrir"
                ? { background: "rgba(74,222,128,0.15)", color: "#4ade80", border: "1px solid rgba(74,222,128,0.3)" }
                : { background: "transparent", color: "rgba(255,255,255,0.45)", border: "1px solid transparent" }
            }
          >
            Descobrir
          </button>
          <button
            type="button"
            onClick={() => setView("minhas")}
            data-testid="tab-minhas-jogos"
            className="py-2.5 rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-1.5"
            style={
              view === "minhas"
                ? { background: "rgba(74,222,128,0.15)", color: "#4ade80", border: "1px solid rgba(74,222,128,0.3)" }
                : { background: "transparent", color: "rgba(255,255,255,0.45)", border: "1px solid transparent" }
            }
          >
            Minhas
            {myMatches.length > 0 && (
              <span
                className="text-[10px] font-black px-1.5 py-0.5 rounded-full"
                style={{
                  background: view === "minhas" ? "rgba(74,222,128,0.25)" : "rgba(255,255,255,0.1)",
                  color: view === "minhas" ? "#4ade80" : "rgba(255,255,255,0.5)",
                }}
              >
                {myMatches.length}
              </span>
            )}
          </button>
        </div>

        {view === "minhas" ? (
          <section>
            <h2 className="font-display font-black text-white text-lg mb-3">
              As minhas partidas ({myMatches.length})
            </h2>
            {!isLinked ? (
              <div className="rounded-2xl p-6 text-center" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <p className="text-white/50 text-sm">Cria conta para acompanhares as tuas partidas.</p>
                <JogaButton
                  variant="primary"
                  size="sm"
                  className="mt-3"
                  onClick={() => requireLinked({ mode: "register", title: "Cria conta para ver as tuas partidas" })}
                >
                  Criar conta
                </JogaButton>
              </div>
            ) : loadingMyMatches ? (
              <div className="rounded-2xl p-6 text-center" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <p className="text-white/50 text-sm">A carregar as tuas partidas…</p>
              </div>
            ) : myMatches.length === 0 ? (
              <div className="rounded-2xl p-6 text-center" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <p className="text-white/50 text-sm">Ainda não entraste em nenhuma partida ativa.</p>
                <p className="text-white/35 text-xs mt-1">Assim que confirmares presença, ela aparece aqui — mesmo depois de ir para o Ao Vivo.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {myMatches.map((m) => (
                  <MatchCard key={m.id} {...m} returnTo="/jogos" />
                ))}
              </div>
            )}
          </section>
        ) : (
          <>
            {hasFilters && (
              <button type="button" onClick={() => { setCityFilter("todas"); setTypeFilter("todos"); }} className="text-emerald-400 text-xs font-semibold">
                Limpar filtros
              </button>
            )}

            <section>
              <h2 className="font-display font-black text-white text-lg mb-3">
                Com vagas ({available.length})
              </h2>
              {loadingMatches ? (
                <div className="rounded-2xl p-6 text-center" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <p className="text-white/50 text-sm">A carregar jogos…</p>
                </div>
              ) : available.length === 0 ? (
                <div className="rounded-2xl p-6 text-center" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <p className="text-white/50 text-sm">Nenhum jogo encontrado.</p>
                  {isLinked ? (
                    <Link href="/criar-partida" className="inline-block mt-3">
                      <JogaButton variant="primary" size="sm">
                        Criar partida
                      </JogaButton>
                    </Link>
                  ) : (
                    <JogaButton
                      variant="primary"
                      size="sm"
                      className="mt-3"
                      onClick={() => requireLinked({ mode: "register", title: "Cria conta para organizar partidas" })}
                    >
                      Criar partida
                    </JogaButton>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {available.map((m) => (
                    <MatchCard key={m.id} {...m} returnTo="/jogos" />
                  ))}
                </div>
              )}
            </section>

            {full.length > 0 && (
              <section>
                <h2 className="font-display font-black text-white/50 text-lg mb-3">Lotados ({full.length})</h2>
                <div className="space-y-3 opacity-60">
                  {full.map((m) => (
                    <MatchCard key={m.id} {...m} returnTo="/jogos" />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </JogaPage>
  );
}
