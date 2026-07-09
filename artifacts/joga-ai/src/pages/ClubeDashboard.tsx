import { useEffect, useMemo, useState } from "react";
import { Link, useRoute } from "wouter";
import { ChevronLeft } from "lucide-react";
import { JogaButton, JogaCard, JogaPage } from "@/components/joga";
import { SectionHeader } from "@/components/SectionHeader";
import { LeaderboardCard } from "@/components/LeaderboardCard";
import { ProFeatureBadge } from "@/components/ProFeatureBadge";
import { ProUpgradeDialog } from "@/components/ProUpgradeDialog";
import {
  loadCommunity,
  loadCommunityMatches,
  loadCommunityMembers,
  type Community,
  type MatchListing,
} from "@/lib/communityRepository";
import {
  loadCommunityPlayerStats,
  computeLeaderboard,
  type CommunityPlayerStats,
} from "@/lib/communityStatsRepository";
import { countActiveMensalistas } from "@/lib/mensalistaRepository";
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfile } from "@/hooks/useUserProfile";
import { isOrganizerProForCommunity } from "@/lib/entitlements";
import { loadMatchFromFirestore } from "@/lib/matchRepository";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

function formatEuro(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",") + "€";
}

export default function ClubeDashboard() {
  const { userId } = useAuth();
  const { profile } = useUserProfile();
  const [, params] = useRoute("/comunidades/:id/dashboard");
  const id = params?.id ?? "";

  const [community, setCommunity] = useState<Community | null>(null);
  const [matches, setMatches] = useState<MatchListing[]>([]);
  const [stats, setStats] = useState<CommunityPlayerStats[]>([]);
  const [mensalistaCount, setMensalistaCount] = useState(0);
  const [pendingPayments, setPendingPayments] = useState(0);
  const [monthRevenueCents, setMonthRevenueCents] = useState(0);
  const [proDialogOpen, setProDialogOpen] = useState(false);

  const orgPro = isOrganizerProForCommunity(profile?.entitlements, id);
  useDocumentTitle(community ? `Dashboard · ${community.name}` : "Dashboard");

  useEffect(() => {
    if (!id) return;
    void loadCommunity(id, userId).then(setCommunity);
    void loadCommunityMatches(id, 30).then(setMatches);
    void loadCommunityPlayerStats(id).then(setStats);
    void countActiveMensalistas(id).then(setMensalistaCount);
  }, [id, userId]);

  useEffect(() => {
    if (!id || matches.length === 0) return;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    void (async () => {
      let revenue = 0;
      let pending = 0;
      const recent = matches.slice(0, 10);

      for (const m of matches) {
        const full = await loadMatchFromFirestore(m.id);
        if (!full || full.status !== "concluida") continue;
        const ended = full.savedAt ? new Date(String(full.savedAt)).getTime() : 0;
        if (ended < monthStart) continue;
        const payments = Array.isArray((full as { peladaPayments?: unknown }).peladaPayments)
          ? ((full as { peladaPayments: Array<Record<string, unknown>> }).peladaPayments)
          : [];
        for (const p of payments) {
          const cents = Number(p.organizerPriceCents ?? p.amountCents) || 0;
          if (p.paidVia === "mensalista") continue;
          revenue += cents;
        }
      }

      const nextMatch = matches.find((m) => m.status === "configurando");
      if (nextMatch) {
        const full = await loadMatchFromFirestore(nextMatch.id);
        if (full?.paymentsEnabled) {
          const players = Array.isArray(full.players) ? full.players : [];
          pending = players.filter((p) => !p.paid && p.userId).length;
        }
      }

      const mensalistaMonthly = (community?.mensalista?.priceCents ?? 0) * mensalistaCount;
      setMonthRevenueCents(revenue + mensalistaMonthly);
      setPendingPayments(pending);
    })();
  }, [matches, id, community?.mensalista?.priceCents, mensalistaCount]);

  const attendanceRows = useMemo(() => {
    const recentIds = new Set(matches.slice(0, 10).map((m) => m.id));
    return stats
      .map((s) => ({
        ...s,
        rate: recentIds.size > 0 ? Math.round((s.matches / Math.min(10, recentIds.size)) * 100) : 0,
      }))
      .sort((a, b) => b.matches - a.matches)
      .slice(0, 8);
  }, [stats, matches]);

  const topScorers = computeLeaderboard(stats, "goals").slice(0, 5);
  const topAssists = computeLeaderboard(stats, "assists").slice(0, 5);
  const topRatings = computeLeaderboard(stats, "avgRating").slice(0, 5);

  if (!community) {
    return (
      <JogaPage theme="dark" className="py-10 text-center">
        <p className="text-white/50">A carregar…</p>
      </JogaPage>
    );
  }

  if (!orgPro) {
    return (
      <JogaPage theme="dark" className="py-8 space-y-4">
        <Link href={`/comunidades/${id}`} className="inline-flex items-center gap-2 text-white/60 text-sm">
          <ChevronLeft className="w-4 h-4" /> Voltar
        </Link>
        <JogaCard variant="arena" className="text-center py-8">
          <ProFeatureBadge tier="organizer" className="mx-auto mb-3" />
          <h1 className="font-display font-black text-white text-xl mb-2">Dashboard do Clube</h1>
          <p className="text-white/50 text-sm mb-4">Métricas, receitas e presenças — exclusivo Clube PRO.</p>
          <JogaButton variant="gold" onClick={() => setProDialogOpen(true)}>
            Desbloquear Clube PRO
          </JogaButton>
        </JogaCard>
        <ProUpgradeDialog
          open={proDialogOpen}
          onOpenChange={setProDialogOpen}
          tier="organizer"
          featureTitle="Dashboard do Clube"
          featureDescription="Presenças, receitas, mensalistas e rankings da época."
        />
      </JogaPage>
    );
  }

  const maxSlots = community.mensalista?.maxSlots;
  const slotsLabel =
    maxSlots != null && maxSlots > 0
      ? `${mensalistaCount}/${maxSlots}`
      : String(mensalistaCount);

  return (
    <JogaPage theme="dark" className="py-5 space-y-5">
      <div className="flex items-center gap-3">
        <Link href={`/comunidades/${id}`} className="joga-tap">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center border border-white/12 bg-white/6">
            <ChevronLeft className="w-5 h-5 text-white" />
          </div>
        </Link>
        <div>
          <div className="flex items-center gap-2">
            <p className="text-white/40 text-[10px] font-bold uppercase tracking-[0.2em]">Clube PRO</p>
            <ProFeatureBadge tier="organizer" />
          </div>
          <h1 className="font-display font-black text-white text-2xl">Dashboard</h1>
          <p className="text-white/45 text-sm">{community.name}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <JogaCard variant="arena" className="py-4 text-center">
          <p className="text-white/40 text-[10px] font-black uppercase">Receita do mês</p>
          <p className="font-display font-black text-emerald-400 text-2xl mt-1">
            {formatEuro(monthRevenueCents)}
          </p>
        </JogaCard>
        <JogaCard variant="arena" className="py-4 text-center">
          <p className="text-white/40 text-[10px] font-black uppercase">Pagamentos pendentes</p>
          <p className="font-display font-black text-amber-300 text-2xl mt-1">{pendingPayments}</p>
        </JogaCard>
        <JogaCard variant="arena" className="py-4 text-center col-span-2">
          <p className="text-white/40 text-[10px] font-black uppercase">Mensalistas activos</p>
          <p className="font-display font-black text-white text-2xl mt-1">{slotsLabel}</p>
        </JogaCard>
      </div>

      <SectionHeader title="Presenças (época)" />
      <div className="space-y-2">
        {attendanceRows.length === 0 ? (
          <p className="text-white/40 text-sm">Ainda sem dados de presença.</p>
        ) : (
          attendanceRows.map((row) => (
            <JogaCard key={row.userId} variant="arena" className="flex items-center justify-between py-3">
              <span className="text-white font-semibold text-sm">{row.name}</span>
              <span className="text-white/50 text-xs">
                {row.matches} jogos · {row.rate}% comparência
              </span>
            </JogaCard>
          ))
        )}
      </div>

      <SectionHeader title="Goleadores" />
      <div className="space-y-2">
        {topScorers.map((row) => (
          <LeaderboardCard
            key={`${row.rank}-${row.name}`}
            rank={row.rank}
            name={row.name}
            position={row.position}
            overall={row.overall}
            statValue={row.value}
            statLabel={row.valueLabel}
          />
        ))}
      </div>

      <SectionHeader title="Assistências" />
      <div className="space-y-2">
        {topAssists.map((row) => (
          <LeaderboardCard
            key={`${row.rank}-${row.name}`}
            rank={row.rank}
            name={row.name}
            position={row.position}
            overall={row.overall}
            statValue={row.value}
            statLabel={row.valueLabel}
          />
        ))}
      </div>

      <SectionHeader title="Notas médias" />
      <div className="space-y-2">
        {topRatings.map((row) => (
          <LeaderboardCard
            key={`${row.rank}-${row.name}`}
            rank={row.rank}
            name={row.name}
            position={row.position}
            overall={row.overall}
            statValue={row.value}
            statLabel={row.valueLabel}
          />
        ))}
      </div>
    </JogaPage>
  );
}
