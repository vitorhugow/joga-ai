import { useEffect, useRef, useState, useMemo } from "react";
import { Share2, TrendingUp, ChevronRight, ChevronLeft, Shield, LogOut, Link2, Smartphone } from "lucide-react";
import { JogaButton, JogaCard, JogaChip, JogaPage } from "@/components/joga";
import { Link, useRoute } from "wouter";
import { PlayerCard } from "@/components/PlayerCard";
import { ReferralCard } from "@/components/ReferralCard";
import { SkinPicker } from "@/components/SkinPicker";
import { hasPlayerPro, isOrganizerPro } from "@/lib/entitlements";
import { ProFeatureBadge } from "@/components/ProFeatureBadge";
import { ProUpgradeDialog } from "@/components/ProUpgradeDialog";
import { trackEvent } from "@/lib/analytics";
import { ProfileFinanceMenu } from "@/components/ProfileFinanceMenu";
import { profileToPlayerCard, getOverallDeltaFromDeltas, getLastMatchAttributeDeltas, loadUserProfile, createIncompleteSeedProfile, type UserProfile } from "@/lib/userRepository";
import type { PlayerAttributes } from "@/lib/cardUtils";
import { loadMyCommunities, type Community } from "@/lib/communityRepository";
import { loadUserMatchHistory, FREE_HISTORY_LIMIT, INITIAL_HISTORY_VISIBLE, HISTORY_PAGE_SIZE, type UserMatchHistoryEntry } from "@/lib/matchHistoryRepository";
import { ProLockedOverlay } from "@/components/ProLockedOverlay";
import { calculateOverall } from "@/lib/cardUtils";
import { useUserId, useAuth } from "@/contexts/AuthContext";
import { useAuthGate } from "@/contexts/AuthGateContext";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useStripeConnectReturn } from "@/hooks/useStripeConnectReturn";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { ProfileSetupDialog } from "@/components/profile/ProfileSetupDialog";
import { ProfileEditDialog } from "@/components/profile/ProfileEditDialog";
import { ProfileSocialLinks } from "@/components/profile/ProfileSocialLinks";
import { toast } from "@/hooks/use-toast";
import { exportPlayerCardPng, shareOrDownloadPng } from "@/lib/cardExportUtils";
import { badgesFromIds } from "@/lib/badgeCatalog";
import { useAppAdmin } from "@/hooks/useAppAdmin";
import { useJogaConfirm } from "@/hooks/useJogaConfirm";
import { DeleteAccountSection } from "@/components/DeleteAccountSection";
import { ReportBlockActions } from "@/components/ReportBlockActions";
import { loadBlockedIds } from "@/lib/blockRepository";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/* ─── Pitch SVG texture ─── */
const PITCH_BG = `url("data:image/svg+xml,%3Csvg width='80' height='80' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 40 L80 40' stroke='rgba(255,255,255,0.05)' stroke-width='1'/%3E%3Ccircle cx='40' cy='40' r='20' stroke='rgba(255,255,255,0.04)' stroke-width='1' fill='none'/%3E%3C/svg%3E")`;

type BadgeItem = { id: string; name: string; icon: string; rarity: "gold" | "silver" | "bronze"; desc: string };
type PastCardItem = { season: string; overall: number; position: string; current: boolean };

/* ─── Stat tile ─── */
function StatTile({ icon, label, value, accent }: {
  icon: string; label: string; value: number | string; accent: string;
}) {
  return (
    <div
      className="rounded-2xl py-4 px-2 flex flex-col items-center gap-2 border"
      style={{ background: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.08)" }}
    >
      <div className="text-xl leading-none">{icon}</div>
      <div className="font-display font-black leading-none text-3xl" style={{ color: accent }}>{value}</div>
      <div className="text-[10px] font-bold uppercase tracking-wider text-white/40">{label}</div>
    </div>
  );
}

/* ─── Attribute bar ─── */
function AttrBar({ label, value, delta }: { label: string; value: number; delta?: number }) {
  const pct = Math.min(100, value);
  const bar =
    value >= 80 ? "linear-gradient(90deg, #15803d, #4ade80)" :
    value >= 70 ? "linear-gradient(90deg, #1d4ed8, #60a5fa)" :
    value >= 60 ? "linear-gradient(90deg, #b45309, #fbbf24)" :
    value >= 50 ? "linear-gradient(90deg, #c2410c, #fb923c)" :
                  "linear-gradient(90deg, #dc2626, #f87171)";
  const text =
    value >= 80 ? "#4ade80" :
    value >= 70 ? "#60a5fa" :
    value >= 60 ? "#fbbf24" :
    value >= 50 ? "#fb923c" : "#f87171";

  return (
    <div className="flex items-center gap-3 py-0.5" data-testid={`attr-bar-${label.toLowerCase()}`}>
      <span className="text-white/45 font-semibold text-[11px] uppercase tracking-wider shrink-0 w-[88px]">{label}</span>
      <div className="flex-1 rounded-full overflow-hidden h-[9px]" style={{ background: "rgba(255,255,255,0.08)" }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: bar }} />
      </div>
      <div className="flex items-center gap-1 shrink-0 w-[52px] justify-end">
        {delta != null && delta > 0 && (
          <span className="flex items-center text-emerald-400 text-[10px] font-bold" title={`+${delta} nesta pelada`}>
            <TrendingUp className="w-3 h-3" />
            +{delta}
          </span>
        )}
        <span className="font-display font-black text-base" style={{ color: text }}>{value}</span>
      </div>
    </div>
  );
}

/* ─── Badge hex ─── */
function BadgeTile({ b }: { b: BadgeItem }) {
  const { grad, glow, label } =
    b.rarity === "gold"
      ? { grad: "linear-gradient(135deg, #fef3c7, #fbbf24, #d97706)", glow: "rgba(251,191,36,0.3)", label: "Ouro" }
      : b.rarity === "silver"
      ? { grad: "linear-gradient(135deg, #f1f5f9, #cbd5e1, #94a3b8)", glow: "rgba(148,163,184,0.3)", label: "Prata" }
      : { grad: "linear-gradient(135deg, #ffedd5, #fb923c, #ea580c)", glow: "rgba(251,146,60,0.3)", label: "Bronze" };

  return (
    <div
      className="flex flex-col items-center gap-1.5 p-2.5 rounded-2xl border"
      style={{ background: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.08)", boxShadow: `0 3px 12px ${glow}` }}
      data-testid={`badge-${b.id}`}
    >
      {/* Hexagonal icon */}
      <div
        className="flex items-center justify-center text-xl"
        style={{
          width: 44, height: 44,
          background: grad,
          clipPath: "polygon(50% 0%, 95% 25%, 95% 75%, 50% 100%, 5% 75%, 5% 25%)",
        }}
      >
        {b.icon}
      </div>
      <p className="font-bold text-white/85 text-[10px] text-center leading-tight">{b.name}</p>
      <div className="h-1 w-8 rounded-full" style={{ background: grad }} />
    </div>
  );
}

/* ─── Match history row ─── */
function MatchHistoryRow({ m }: { m: UserMatchHistoryEntry }) {
  return (
    <JogaCard variant="arena" className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-white font-semibold text-sm truncate">{m.title}</p>
        <p className="text-white/40 text-xs mt-0.5">
          {new Date(m.date).toLocaleDateString("pt-PT")} · {m.goals}G · {m.assists}A
        </p>
      </div>
      <span className="font-display font-black text-emerald-400 text-lg shrink-0">
        {m.rating > 0 ? m.rating.toFixed(1) : "—"}
      </span>
    </JogaCard>
  );
}

/* ─── Past card mini ─── */
function MiniEpoca({ card }: { card: PastCardItem }) {
  const accent = card.position === "DEF" ? "#60a5fa" : card.position === "MEI" ? "#c084fc" : card.position === "GR" ? "#fbbf24" : "#4ade80";
  return (
    <div className="flex flex-col items-center gap-2" data-testid={`past-card-${card.season}`}>
      <div
        className="relative rounded-xl overflow-hidden"
        style={{
          width: 68, height: 94,
          background: "linear-gradient(160deg, #031408, #052010, #0a5a1e)",
          border: card.current ? `2px solid ${accent}` : "1.5px solid rgba(255,255,255,0.08)",
          boxShadow: card.current ? `0 0 16px ${accent}55` : "0 2px 8px rgba(0,0,0,0.25)",
        }}
      >
        <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse at 90% 20%, rgba(80,160,255,0.35), transparent 55%)` }} />
        <div className="absolute inset-0" style={{ background: "linear-gradient(120deg, rgba(255,140,0,0.3) 0%, transparent 45%)" }} />
        <div className="relative flex flex-col h-full p-2">
          <span className="font-display font-black leading-none" style={{ fontSize: 24, color: accent }}>{card.overall}</span>
          <span className="font-display text-[9px] font-bold" style={{ color: "rgba(255,255,255,0.45)", letterSpacing: "0.12em" }}>{card.position}</span>
          {card.current && (
            <div className="mt-auto">
              <span className="text-[7px] font-black px-1.5 py-0.5 rounded font-display" style={{ background: `${accent}25`, color: accent }}>ATUAL</span>
            </div>
          )}
        </div>
      </div>
      <p className="text-white/35 text-[10px] font-medium">{card.season}</p>
    </div>
  );
}

export default function Perfil() {
  const { isLinked, displayName, loading: authLoading, logout, userId: authUserId } = useAuth();
  const { openAuth } = useAuthGate();
  const { confirm, ConfirmDialog } = useJogaConfirm();
  const { isAdmin } = useAppAdmin();

  async function handleLogout() {
    const ok = await confirm({
      title: "Sair da conta?",
      description: "Vais precisar de entrar novamente para aceder ao teu perfil, clubes e peladas.",
      confirmLabel: "Sair",
      cancelLabel: "Cancelar",
      destructive: true,
    });
    if (ok) await logout();
  }
  const userId = useUserId();
  const [, perfilParams] = useRoute("/perfil/:viewId");
  const [, jogadorParams] = useRoute("/jogador/:id");
  const viewUserId =
    jogadorParams?.id ??
    (perfilParams?.viewId && perfilParams.viewId !== "evolucao" ? perfilParams.viewId : undefined);
  const isViewingOther = Boolean(viewUserId && viewUserId !== userId);
  const backHref =
    new URLSearchParams(typeof window !== "undefined" ? window.location.search : "").get("from") ||
    "/comunidades";

  const { profile, refresh, loading: ownProfileLoading } = useUserProfile();
  useStripeConnectReturn(() => void refresh());
  const [viewedProfile, setViewedProfile] = useState<UserProfile | null>(null);
  const [viewLoading, setViewLoading] = useState(Boolean(viewUserId));

  useEffect(() => {
    if (!viewUserId) {
      setViewedProfile(null);
      setViewLoading(false);
      return;
    }
    setViewLoading(true);
    void loadUserProfile(viewUserId, createIncompleteSeedProfile(viewUserId, false), {
      preferRemote: true,
    })
      .then(setViewedProfile)
      .finally(() => setViewLoading(false));
  }, [viewUserId]);

  const activeProfile = (isViewingOther ? viewedProfile : profile) ?? profile;
  const profileLoading = isViewingOther ? viewLoading : ownProfileLoading;
  useDocumentTitle(isViewingOther ? activeProfile?.displayName || "Jogador" : "Perfil");
  const [showSetup, setShowSetup] = useState(false);
  const [showProfileEdit, setShowProfileEdit] = useState(false);
  const [activeTab, setActiveTab] = useState<"atributos" | "estatisticas">("atributos");
  const [isCardExpanded, setIsCardExpanded] = useState(false);
  const [myCommunities, setMyCommunities] = useState<Community[]>([]);
  const [targetBlocked, setTargetBlocked] = useState(false);
  const [matchHistory, setMatchHistory] = useState<UserMatchHistoryEntry[]>([]);
  const [historyVisibleCount, setHistoryVisibleCount] = useState(INITIAL_HISTORY_VISIBLE);
  const [historyCommunityFilter, setHistoryCommunityFilter] = useState("all");
  const [historyPeriodFilter, setHistoryPeriodFilter] = useState<"30d" | "90d" | "season" | "all">("all");
  const cardExportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!userId || isViewingOther) return;
    loadMyCommunities(userId).then(setMyCommunities);
    loadUserMatchHistory(userId).then(setMatchHistory);
  }, [userId, isViewingOther]);

  useEffect(() => {
    if (!isViewingOther || !viewUserId || !userId) {
      setTargetBlocked(false);
      return;
    }
    void loadBlockedIds(userId).then((ids) => setTargetBlocked(ids.has(viewUserId)));
  }, [isViewingOther, viewUserId, userId]);

  const [skinOverride, setSkinOverride] = useState<string | null>(null);
  const [cardDownloadProOpen, setCardDownloadProOpen] = useState(false);
  const player = profileToPlayerCard(activeProfile);
  const playerPro = hasPlayerPro(activeProfile?.entitlements);

  const profileHighlightLabel = useMemo(() => {
    if (!isViewingOther && playerPro && activeProfile?.lastMatchNickname?.label?.trim()) {
      const { label, emoji } = activeProfile.lastMatchNickname;
      return emoji ? `${emoji} ${label}` : label;
    }
    return player.title;
  }, [isViewingOther, playerPro, activeProfile?.lastMatchNickname, player.title]);

  const historyCommunityOptions = useMemo(() => {
    const ids = new Set<string>();
    for (const m of matchHistory) {
      if (m.communityId) ids.add(m.communityId);
    }
    return [...ids].map((id) => {
      const name = myCommunities.find((c) => c.id === id)?.name ?? id.slice(0, 8);
      return { id, name };
    });
  }, [matchHistory, myCommunities]);

  const proFilteredHistory = useMemo(() => {
    if (!playerPro) return matchHistory;
    const now = Date.now();
    const seasonStart = new Date(new Date().getFullYear(), 0, 1).getTime();
    return matchHistory.filter((m) => {
      const t = new Date(m.date).getTime();
      if (historyCommunityFilter !== "all" && m.communityId !== historyCommunityFilter) {
        return false;
      }
      if (historyPeriodFilter === "30d") return now - t <= 30 * 24 * 60 * 60 * 1000;
      if (historyPeriodFilter === "90d") return now - t <= 90 * 24 * 60 * 60 * 1000;
      if (historyPeriodFilter === "season") return t >= seasonStart;
      return true;
    });
  }, [matchHistory, playerPro, historyCommunityFilter, historyPeriodFilter]);

  const visibleFreeHistory = matchHistory.slice(0, Math.min(historyVisibleCount, FREE_HISTORY_LIMIT));
  const lockedPreviewHistory = matchHistory.slice(FREE_HISTORY_LIMIT, FREE_HISTORY_LIMIT + 3);
  const hiddenHistoryCount = Math.max(0, matchHistory.length - FREE_HISTORY_LIMIT);
  const visibleProHistory = proFilteredHistory.slice(0, historyVisibleCount);
  const canShowMoreFreeHistory = historyVisibleCount < Math.min(matchHistory.length, FREE_HISTORY_LIMIT);
  const canShowMoreProHistory = historyVisibleCount < proFilteredHistory.length;
  const orgPro = isOrganizerPro(activeProfile?.entitlements);

  const overall = calculateOverall(player.attributes);
  const attrDeltas = isViewingOther ? undefined : getLastMatchAttributeDeltas(activeProfile, matchHistory[0]?.matchId);
  const overallDelta = getOverallDeltaFromDeltas(player.attributes, attrDeltas);

  const ATTR_LABELS: { key: keyof PlayerAttributes; label: string }[] = [
    { key: "ritmo", label: "Ritmo" },
    { key: "finalizacao", label: "Finalização" },
    { key: "drible", label: "Drible" },
    { key: "passe", label: "Passe" },
    { key: "fisico", label: "Físico" },
    { key: "defesa", label: "Defesa" },
  ];

  const attrs = ATTR_LABELS.map(({ key, label }) => ({
    label,
    value: player.attributes[key],
    delta: attrDeltas?.[key],
  }));

  const badges: BadgeItem[] = badgesFromIds(activeProfile.badges ?? []);
  const pastCards: PastCardItem[] = activeProfile.profileComplete
    ? [{ season: "Atual", overall, position: player.position, current: true }]
    : [];

  async function shareCard() {
    const exportNode = cardExportRef.current;
    if (!exportNode) {
      toast({ title: "Carta indisponível", variant: "destructive" });
      return;
    }

    if (!playerPro) {
      trackEvent("pro_gate_clicked", { feature: "card_download" });
      setCardDownloadProOpen(true);
      return;
    }

    try {
      const blob = await exportPlayerCardPng(exportNode, { pixelRatio: 4 });
      const result = await shareOrDownloadPng(
        blob,
        `joga-ai-carta-${overall}.png`,
        `Carta ${player.name} — Joga AI`,
      );
      if (result === "shared") {
        toast({ title: "Carta partilhada!" });
      } else if (result === "downloaded") {
        toast({ title: "PNG guardado", description: "Imagem da carta descarregada." });
      }
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;
      toast({
        title: "Não foi possível exportar",
        description: "Tenta novamente.",
        variant: "destructive",
      });
    }
  }

  if (isViewingOther && viewLoading) {
    return (
      <JogaPage theme="dark" className="py-10 text-center">
        <p className="text-white/50">A carregar perfil…</p>
      </JogaPage>
    );
  }

  if (isViewingOther && !viewedProfile) {
    return (
      <JogaPage theme="dark" className="py-10 text-center px-4">
        <p className="text-white/50">Perfil não encontrado.</p>
        <Link href={backHref} className="text-emerald-400 text-sm mt-4 inline-block">
          Voltar
        </Link>
      </JogaPage>
    );
  }

  return (
    <JogaPage theme="dark" padded={false} className="pb-28">
      {ConfirmDialog}
      {!isViewingOther && (
      <ProfileSetupDialog
        open={showSetup}
        onOpenChange={setShowSetup}
        dismissible
        profile={profile}
        onComplete={() => {
          setShowSetup(false);
          void refresh();
        }}
      />
      )}

      {!isViewingOther && activeProfile.profileComplete && (
      <ProfileEditDialog
        open={showProfileEdit}
        onOpenChange={setShowProfileEdit}
        profile={activeProfile}
      />
      )}

      {isViewingOther && (
        <div className="px-4 pt-4">
          <Link href={backHref} className="joga-tap inline-flex items-center gap-1 text-white/50 text-sm">
            <ChevronLeft className="w-4 h-4" />
            Voltar
          </Link>
        </div>
      )}

      {!isViewingOther && !authLoading && !isLinked && !activeProfile.profileComplete && (
        <div className="px-4 pt-4">
          <JogaCard
            variant="arena"
            padding="md"
            className="border-emerald-400/25 bg-emerald-400/8"
          >
            <div className="flex items-start gap-3">
              <Link2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-emerald-300 text-[10px] font-bold uppercase tracking-[0.18em]">
                  Monta a tua carta
                </p>
                <p className="text-white/70 text-sm mt-1 leading-relaxed">
                  Cria conta ou entra para montar a tua carta e guardar na nuvem.
                </p>
                <JogaButton
                  variant="primary"
                  size="sm"
                  className="mt-3 gap-1.5"
                  onClick={() =>
                    openAuth({
                      mode: "register",
                      title: "Cria conta para montar a carta",
                      description: "Entra com Google ou email. Se já tens conta, faz login — entras na mesma.",
                    })
                  }
                >
                  Começar
                  <ChevronRight className="w-4 h-4" />
                </JogaButton>
              </div>
            </div>
          </JogaCard>
        </div>
      )}

      {!isViewingOther && !authLoading && !isLinked && activeProfile.profileComplete && (
        <div className="px-4 pt-4">
          <JogaCard
            variant="arena"
            padding="md"
            className="border-amber-400/25 bg-amber-400/8 joga-tap"
            onClick={() => openAuth({
              mode: "register",
              title: "Guardar na nuvem",
              description: "Cria conta para sincronizar a carta e entrar em peladas com a malta.",
            })}
          >
            <div className="flex items-start gap-3">
              <Link2 className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-amber-300 text-[10px] font-bold uppercase tracking-[0.18em]">
                  Carta neste dispositivo
                </p>
                <p className="text-white/70 text-sm mt-1 leading-relaxed">
                  Cria conta quando quiseres guardar na nuvem e jogar online.
                </p>
                <JogaButton variant="gold" size="sm" className="mt-3 gap-1.5">
                  Criar conta / Entrar
                  <ChevronRight className="w-4 h-4" />
                </JogaButton>
              </div>
            </div>
          </JogaCard>
        </div>
      )}

      {!isViewingOther && !authLoading && isLinked && (
        <div className="px-4 pt-4 flex items-center justify-between gap-3">
          <p className="text-white/45 text-sm truncate min-w-0">
            Sessão: <span className="text-white/70 font-medium">{displayName || "Conta ligada"}</span>
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <ProfileFinanceMenu profile={activeProfile} />
            {isAdmin && (
              <Link href="/admin">
                <JogaButton variant="ghost" size="sm" className="gap-1.5 text-emerald-400/90 whitespace-nowrap">
                  <Shield className="w-3.5 h-3.5" />
                  Admin
                </JogaButton>
              </Link>
            )}
            <JogaButton
              variant="ghost"
              size="sm"
              className="gap-1.5 text-white/50 whitespace-nowrap"
              onClick={() => void handleLogout()}
            >
              <LogOut className="w-3.5 h-3.5" />
              Sair
            </JogaButton>
          </div>
        </div>
      )}

      {/* HERO — arena escura */}
      <div className="relative overflow-hidden joga-hero-arena">
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
        <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(3,20,8,0.75) 0%, rgba(5,32,16,0.72) 30%, rgba(8,25,13,0.78) 70%, rgba(10,15,26,0.9) 100%)" }} />
        <div className="absolute inset-0" style={{ backgroundImage: PITCH_BG, backgroundSize: "80px 80px", opacity: 0.4 }} />
        <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(74,222,128,0.12) 0%, transparent 50%)" }} />
        <div className="absolute bottom-0 left-0 right-0 h-8" style={{ background: "linear-gradient(to top, #0a0f1a, transparent)" }} />

        <div className="relative mx-auto w-full" style={{ maxWidth: 760 }}>
          <div className="relative flex items-center justify-between px-4 pt-4 pb-0 sm:px-5 sm:pt-5">
            <h1 className="font-display font-black text-xl tracking-tight text-white" data-testid="header-title">
              {isViewingOther ? `Perfil de ${player.name.split(" ")[0]}` : "O Meu Perfil"}
            </h1>
            {isViewingOther && viewUserId ? (
              <ReportBlockActions
                targetType="user"
                targetId={viewUserId}
                targetLabel={player.name}
                isBlocked={targetBlocked}
                onBlockChange={setTargetBlocked}
              />
            ) : null}
            {!isViewingOther && (
            <div className="flex items-center gap-2 flex-wrap justify-end">
              {!isLinked && <ProfileFinanceMenu profile={activeProfile} />}
              <JogaButton
                variant="ghost"
                size="sm"
                className="rounded-full px-3"
                onClick={() => {
                  if (!isLinked) {
                    openAuth({
                      mode: "register",
                      title: "Cria conta para editar o perfil",
                      description: "Regista-te para guardar nome, redes sociais e conta.",
                    });
                    return;
                  }
                  setShowProfileEdit(true);
                }}
                data-testid="button-edit-profile"
              >
                Editar perfil
              </JogaButton>
              <JogaButton
                variant="ghost"
                size="sm"
                className="rounded-full px-3"
                onClick={() => {
                  if (!isLinked) {
                    openAuth({
                      mode: "register",
                      title: "Cria conta para editar a carta",
                      description: "Regista-te para guardar alterações na nuvem.",
                    });
                    return;
                  }
                  setShowSetup(true);
                }}
                data-testid="button-edit-card"
              >
                Editar carta
              </JogaButton>
              <JogaButton
                variant="ghost"
                size="sm"
                className="rounded-full px-4 gap-1.5"
                data-testid="button-share-card"
                onClick={() => {
                  if (!isLinked) {
                    openAuth({
                      mode: "register",
                      title: "Cria conta para partilhar a carta",
                      description: "Regista-te para exportar e partilhar a tua carta.",
                    });
                    return;
                  }
                  void shareCard();
                }}
              >
                <Share2 className="w-3.5 h-3.5" />
                Partilhar
                <ProFeatureBadge tier="player" />
              </JogaButton>
            </div>
            )}
          </div>

          <div className="relative flex items-start justify-center gap-3 px-3 pt-2 pb-6 sm:gap-6 sm:px-4 sm:pt-3 sm:pb-7">
            <div
              ref={cardExportRef}
              className="fixed left-0 top-0 -z-50 opacity-0 pointer-events-none"
              style={{ width: "min(92vw, 390px)" }}
              aria-hidden
            >
              <PlayerCard
                name={player.name}
                position={player.position}
                attributes={player.attributes}
                shirtNumber={player.shirtNumber}
                title={player.title}
                photoUrl={player.photoUrl}
              skin={skinOverride ?? player.skin}
                size="profile"
                attributeDeltas={attrDeltas}
              />
            </div>
            <button
              type="button"
              onClick={() => setIsCardExpanded(true)}
              className="joga-tap relative shrink-0 w-[158px] h-[219px] sm:w-[194px] sm:h-[268px]"
              style={{ border: 0, background: "transparent", padding: 0 }}
              aria-label="Abrir carta do jogador"
            >
              <div className="absolute top-0 left-1/2 w-[340px] origin-top -translate-x-1/2 scale-[0.465] sm:scale-[0.571] [&_.joga-new-player-card-wrap--profile]:w-full!">
                <PlayerCard
                  name={player.name}
                  position={player.position}
                  attributes={player.attributes}
                  shirtNumber={player.shirtNumber}
                  title={player.title}
                  photoUrl={player.photoUrl}
              skin={skinOverride ?? player.skin}
                  size="profile"
                  attributeDeltas={attrDeltas}
                />
              </div>
            </button>

            <JogaCard variant="arena" className="relative z-10 flex-1 min-w-0 max-w-[240px] bg-white/6! border-white/10! backdrop-blur-md">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] mb-1 text-emerald-300/80">
                {isViewingOther ? "Jogador" : "O Meu Perfil"}
              </p>
              <div className="flex items-start gap-2 flex-wrap">
                <div className="min-w-0">
                  <h2 className="font-display font-black uppercase leading-none tracking-tight text-xl text-white">
                    {player.name.split(" ")[0]}
                  </h2>
                  <h2 className="font-display font-black uppercase leading-none tracking-tight text-xl text-white">
                    {player.name.split(" ").slice(1).join(" ")}
                  </h2>
                </div>
                {(playerPro || orgPro) && (
                  <div className="flex flex-col gap-1.5 shrink-0 pt-0.5" data-testid="profile-pro-badges">
                    {playerPro && (
                      <span
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-wide whitespace-nowrap"
                        style={{ background: "rgba(251,191,36,0.22)", color: "#fde047", border: "1px solid rgba(251,191,36,0.5)", boxShadow: "0 0 12px rgba(251,191,36,0.15)" }}
                      >
                        ✦ PRO Jogador
                      </span>
                    )}
                    {orgPro && (
                      <span
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-wide whitespace-nowrap"
                        style={{ background: "rgba(250,204,21,0.28)", color: "#fef08a", border: "1px solid rgba(250,204,21,0.6)", boxShadow: "0 0 12px rgba(250,204,21,0.2)" }}
                      >
                        ✦ Clube PRO
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-400/25">
                  {player.position}
                </span>
                <span className="text-[11px] font-semibold text-amber-300/90">{profileHighlightLabel}</span>
              </div>

              <div className="grid grid-cols-2 gap-2 mt-2.5">
                {[
                  { v: overall, l: "Overall", c: "#fbbf24" },
                  { v: player.seasonStats.matches, l: "Jogos", c: "#60a5fa" },
                  { v: player.seasonStats.goals, l: "Golos", c: "#4ade80" },
                  { v: player.seasonStats.assists, l: "Assist.", c: "#fb923c" },
                ].map((s) => (
                  <div key={s.l} className="rounded-xl px-2 py-1.5 sm:rounded-2xl sm:py-2 border border-white/8" style={{ background: "rgba(255,255,255,0.04)" }}>
                    <p className="font-display font-black text-2xl leading-none" style={{ color: s.c }}>{s.v}</p>
                    <p className="text-[10px] font-bold mt-0.5 uppercase text-white/40">{s.l}</p>
                  </div>
                ))}
              </div>
            </JogaCard>
          </div>

          {!isViewingOther && activeProfile && (
            <div className="px-3 sm:px-4 pb-2">
              <SkinPicker profile={activeProfile} onSkinChange={setSkinOverride} />
            </div>
          )}
        </div>
      </div>

      <div className="px-4 space-y-4 pt-4">

        <JogaCard variant="arena" className="flex items-center gap-4">
          <div
            className="w-16 h-16 rounded-2xl flex flex-col items-center justify-center shrink-0"
            style={{ background: "linear-gradient(135deg, #042e10, #16a34a)", boxShadow: "0 4px 16px rgba(22,163,74,0.35)" }}
          >
            <span className="font-display font-black text-white text-3xl leading-none">{overall}</span>
            <span className="font-display font-bold text-white/60 text-[0.6rem] tracking-widest">OVR</span>
          </div>

          <div className="flex-1 min-w-0">
            <p className="font-display font-black text-white text-xl leading-tight truncate">{player.name}</p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-400/20">
                {player.position}
              </span>
              <span className="text-[12px] font-semibold text-white/55">{profileHighlightLabel}</span>
            </div>
            <p className="text-white/35 text-[11px] mt-1 font-medium">Época 2024/25</p>
          </div>

          <div className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, rgba(251,191,36,0.25), rgba(245,158,11,0.15))", border: "1px solid rgba(251,191,36,0.3)" }}>
            <span className="text-lg">🌟</span>
          </div>
        </JogaCard>

        <div className="grid grid-cols-4 gap-2.5">
          <StatTile icon="📅" label="Jogos"   value={player.seasonStats.matches} accent="#94a3b8" />
          <StatTile icon="⚽" label="Golos"   value={player.seasonStats.goals}   accent="#4ade80" />
          <StatTile icon="🎯" label="Assist." value={player.seasonStats.assists} accent="#60a5fa" />
          <StatTile icon="🏆" label="MVP"     value={player.seasonStats.mvp}     accent="#fbbf24" />
        </div>

        <ProfileSocialLinks profile={activeProfile} />

        <JogaCard variant="arena" padding="none" className="overflow-hidden">
          <div className="flex gap-2 p-3 border-b border-white/8">
            {(["atributos", "estatisticas"] as const).map((t) => (
              <JogaChip
                key={t}
                label={t === "atributos" ? "Atributos" : "Estatísticas"}
                active={activeTab === t}
                onClick={() => setActiveTab(t)}
                testId={`tab-${t}`}
                className="flex-1 text-center"
              />
            ))}
          </div>

          {activeTab === "atributos" && (
            <div className="px-4 py-5">
              <div className="flex items-center justify-between mb-5 pb-4 border-b border-white/8">
                <div>
                  <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest">Overall</p>
                  <p className="font-display font-black text-white text-5xl leading-none">{overall}</p>
                </div>
                <div className="flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm bg-emerald-500/12 text-emerald-300 border border-emerald-400/20">
                  <TrendingUp className="w-4 h-4" />
                  {overallDelta > 0 ? `+${overallDelta} última pelada` : "Sem subida recente"}
                </div>
              </div>
              <div className="space-y-3">
                {attrs.map((a) => (
                  <AttrBar key={a.label} label={a.label} value={a.value} delta={a.delta} />
                ))}
              </div>
              <div className="flex items-center justify-between mt-5 pt-4 text-[11px] border-t border-white/8">
                <span className="text-white/40 font-medium">Próxima evolução</span>
                <span className="text-emerald-400 font-semibold">Joga mais 2 partidas →</span>
              </div>
            </div>
          )}

          {activeTab === "estatisticas" && (
            <div className="px-4 py-4">
              {player.seasonStats.matches === 0 ? (
                <p className="text-white/40 text-sm text-center py-6">Sem estatísticas ainda. Joga a tua primeira pelada!</p>
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { icon: "⚽", label: "Golos", v: String(player.seasonStats.goals) },
                    { icon: "🎯", label: "Assist.", v: String(player.seasonStats.assists) },
                    { icon: "📅", label: "Jogos", v: String(player.seasonStats.matches) },
                    { icon: "🏆", label: "MVPs", v: String(player.seasonStats.mvp) },
                  ].map((s) => (
                    <div key={s.label} className="rounded-xl p-3 flex flex-col items-center gap-1.5 text-center border border-white/8" style={{ background: "rgba(255,255,255,0.04)" }}>
                      <span className="text-xl">{s.icon}</span>
                      <p className="font-display font-black text-white text-xl leading-none">{s.v}</p>
                      <p className="text-white/35 text-[9px] font-semibold uppercase tracking-wide leading-tight">{s.label}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </JogaCard>

        {badges.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display font-black text-white text-lg">Distintivos</h2>
            <span className="text-xs font-semibold text-white/45 bg-white/6 px-2.5 py-1 rounded-full border border-white/8">{badges.length} desbloqueados</span>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {badges.map((b) => <BadgeTile key={b.id} b={b} />)}
          </div>
        </div>
        )}

        {pastCards.length > 0 && (
        <div>
          <h2 className="font-display font-black text-white text-lg mb-3">Épocas</h2>
          <div className="flex gap-4 overflow-x-auto pb-1">
            {pastCards.map((card) => <MiniEpoca key={card.season} card={card} />)}
          </div>
        </div>
        )}

        {!isViewingOther && (
        <div>
          <h2 className="font-display font-black text-white text-lg mb-3">Peladas anteriores</h2>
          {matchHistory.length === 0 ? (
            <p className="text-white/40 text-sm">Ainda não jogaste peladas registadas.</p>
          ) : playerPro ? (
            <>
              <div className="flex flex-wrap gap-2 mb-3">
                {historyCommunityOptions.length > 0 && (
                  <Select value={historyCommunityFilter} onValueChange={setHistoryCommunityFilter}>
                    <SelectTrigger className="w-[160px] h-9 bg-white/5 border-white/10 text-white text-xs">
                      <SelectValue placeholder="Clube" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os clubes</SelectItem>
                      {historyCommunityOptions.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Select
                  value={historyPeriodFilter}
                  onValueChange={(v) => setHistoryPeriodFilter(v as typeof historyPeriodFilter)}
                >
                  <SelectTrigger className="w-[140px] h-9 bg-white/5 border-white/10 text-white text-xs">
                    <SelectValue placeholder="Período" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30d">Últimos 30 dias</SelectItem>
                    <SelectItem value="90d">Últimos 90 dias</SelectItem>
                    <SelectItem value="season">Época atual</SelectItem>
                    <SelectItem value="all">Tudo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {proFilteredHistory.length === 0 ? (
                <p className="text-white/40 text-sm">Nenhuma partida com estes filtros.</p>
              ) : (
                <div className="space-y-2">
                  {visibleProHistory.map((m) => <MatchHistoryRow key={m.matchId} m={m} />)}
                </div>
              )}
              {canShowMoreProHistory && (
                <JogaButton
                  variant="ghost"
                  size="sm"
                  className="mt-3 w-full"
                  onClick={() => setHistoryVisibleCount((count) => count + HISTORY_PAGE_SIZE)}
                >
                  Ver mais
                </JogaButton>
              )}
            </>
          ) : (
            <>
              <div className="space-y-2">
                {visibleFreeHistory.map((m) => <MatchHistoryRow key={m.matchId} m={m} />)}
              </div>
              {canShowMoreFreeHistory && (
                <JogaButton
                  variant="ghost"
                  size="sm"
                  className="mt-3 w-full"
                  onClick={() => setHistoryVisibleCount((count) => count + HISTORY_PAGE_SIZE)}
                >
                  Ver mais
                </JogaButton>
              )}
              {hiddenHistoryCount > 0 && (
                <div className="mt-3">
                  <ProLockedOverlay
                    feature="full_match_history"
                    title="Histórico completo"
                    subtitle={`Tens mais ${hiddenHistoryCount} partidas no teu arquivo.`}
                  >
                    <div className="space-y-2">
                      {lockedPreviewHistory.map((m) => <MatchHistoryRow key={m.matchId} m={m} />)}
                    </div>
                  </ProLockedOverlay>
                </div>
              )}
            </>
          )}
        </div>
        )}

        {!isViewingOther && (
        <div>
          <h2 className="font-display font-black text-white text-lg mb-3">Clubes</h2>
          {myCommunities.length === 0 ? (
            <p className="text-white/40 text-sm">Ainda não pertences a nenhum clube.</p>
          ) : (
          <div className="flex gap-2.5 overflow-x-auto pb-1">
            {myCommunities.slice(0, 6).map((c) => (
              <Link key={c.id} href={`/comunidades/${c.id}`} className="joga-tap shrink-0">
                <JogaCard variant="arena" className="flex items-center gap-2.5 py-3!" data-testid={`community-tag-${c.id}`}>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 joga-btn-primary">
                    <span className="font-display font-black text-white text-sm">{c.name[0]}</span>
                  </div>
                  <div>
                    <p className="text-white text-xs font-semibold truncate max-w-[90px]">{c.name}</p>
                    <p className="text-white/40 text-[10px] font-medium">{c.memberCount} membros</p>
                  </div>
                </JogaCard>
              </Link>
            ))}
          </div>
          )}
        </div>
        )}

        {/* ════════════════════════════════════
            Referral — Convida a malta
        ════════════════════════════════════ */}
        {!isViewingOther && userId && (
          <ReferralCard uid={userId} unlockedSkins={activeProfile?.unlockedSkins} />
        )}

        {/* ════════════════════════════════════
            CTA — Ver Evolução
        ════════════════════════════════════ */}
        {!isViewingOther && (
        <Link href="/perfil/evolucao" className="block">
          <JogaButton
            variant="primary"
            size="lg"
            className="gap-3"
            data-testid="button-go-evolution"
          >
            <Shield className="w-5 h-5 text-white/70" />
            Ver Evolução
            <ProFeatureBadge tier="player" />
            <ChevronRight className="w-5 h-5 text-white/50" />
          </JogaButton>
        </Link>
        )}

        {!isViewingOther && isLinked && <DeleteAccountSection />}

        {!isViewingOther && (
          <Link href="/instalar" className="block text-center">
            <span className="inline-flex items-center gap-1.5 text-white/35 text-xs font-semibold hover:text-white/55 transition-colors">
              <Smartphone className="w-3.5 h-3.5" />
              Como instalar a app
            </span>
          </Link>
        )}

      </div>

      {isCardExpanded && (
        <div
          className="fixed inset-0 z-9999 flex items-center justify-center px-4 py-6 cursor-pointer"
          style={{ background: "rgba(2,6,23,0.82)", backdropFilter: "blur(10px)" }}
          onClick={() => setIsCardExpanded(false)}
          role="button"
          aria-label="Fechar carta"
        >
          <div className="relative" onClick={(event) => event.stopPropagation()}>
            <JogaButton
              variant="ghost"
              size="sm"
              className="absolute -top-12 right-0"
              onClick={() => setIsCardExpanded(false)}
            >
              Fechar
            </JogaButton>

            <PlayerCard
              name={player.name}
              position={player.position}
              attributes={player.attributes}
              shirtNumber={player.shirtNumber}
              title={player.title}
              photoUrl={player.photoUrl}
              skin={skinOverride ?? player.skin}
              size="profile"
              attributeDeltas={attrDeltas}
            />
          </div>
        </div>
      )}

      <ProUpgradeDialog
        open={cardDownloadProOpen}
        onOpenChange={setCardDownloadProOpen}
        featureTitle="Descarregar carta em HD"
        featureDescription="Exporta a tua carta de jogador em alta resolução para partilhar nas redes."
        tier="player"
      />
    </JogaPage>
  );
}
