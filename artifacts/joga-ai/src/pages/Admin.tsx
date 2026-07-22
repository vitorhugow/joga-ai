import { useState, useEffect } from "react";
import { Link } from "wouter";
import { ArrowLeft, Crown, Flag, Search, Shield, Trophy, UserX } from "lucide-react";
import { JogaButton, JogaPage } from "@/components/joga";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useAppAdmin } from "@/hooks/useAppAdmin";
import { useAuth } from "@/contexts/AuthContext";
import { isProActive } from "@/lib/entitlements";
import type { EntitlementPlan } from "@/lib/entitlements";
import {
  adminFindUsers,
  adminGrantPro,
  adminLoadUser,
  adminRevokePro,
  adminUnlockSkin,
  adminLoadOpenReports,
  adminUpdateReportStatus,
  type AdminUserRow,
  type AdminReport,
} from "@/lib/adminRepository";
import { loadCommunities, type Community } from "@/lib/communityRepository";
import {
  loadActiveTournamentConfig,
  subscribeTournamentTeams,
  adminUpdateTeamStatus,
  adminDeleteTeam,
  adminRegisterTeam,
  TournamentTeamAlreadyRegisteredError,
  type TournamentTeam,
} from "@/lib/tournamentRepository";
import { AdminFieldPhotos } from "@/components/admin/AdminFieldPhotos";
import { toast } from "@/hooks/use-toast";

const ADMIN_FIELD =
  "w-full rounded-xl px-3 py-2.5 text-sm text-white bg-[#0f172a] border border-white/20 outline-none focus:border-emerald-500/60 placeholder:text-white/40 [color-scheme:dark]";

function defaultProUntil(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

function formatProStatus(row: AdminUserRow): string {
  const e = row.entitlements;
  if (!isProActive(e)) return "Sem PRO";
  const plan = e?.plan === "organizer_pro" ? "Clube PRO" : "Jogador";
  const until = e?.proUntil
    ? new Date(e.proUntil).toLocaleDateString("pt-PT")
    : "sem data";
  return `PRO ${plan} · até ${until}`;
}

export default function Admin() {
  useDocumentTitle("Admin");
  const { isAdmin, loading: adminLoading } = useAppAdmin();
  const { firebaseUser } = useAuth();

  const [search, setSearch] = useState("");
  const [results, setResults] = useState<AdminUserRow[]>([]);
  const [selected, setSelected] = useState<AdminUserRow | null>(null);
  const [plan, setPlan] = useState<EntitlementPlan>("player_pro");
  const [proUntil, setProUntil] = useState(defaultProUntil);
  const [busy, setBusy] = useState(false);
  const [searched, setSearched] = useState(false);
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [reportsLoading, setReportsLoading] = useState(true);

  const [cupTournamentId, setCupTournamentId] = useState<string | null>(null);
  const [cupTeams, setCupTeams] = useState<TournamentTeam[]>([]);
  const [cupCommunities, setCupCommunities] = useState<Community[]>([]);
  const [cupSearch, setCupSearch] = useState("");
  const [cupBusy, setCupBusy] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    setReportsLoading(true);
    void adminLoadOpenReports()
      .then(setReports)
      .finally(() => setReportsLoading(false));
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    void loadActiveTournamentConfig().then((config) => setCupTournamentId(config?.tournamentId ?? null));
    void loadCommunities().then(setCupCommunities);
  }, [isAdmin]);

  useEffect(() => {
    if (!cupTournamentId) return;
    return subscribeTournamentTeams(cupTournamentId, setCupTeams);
  }, [cupTournamentId]);

  const cupTeamCommunityIds = new Set(cupTeams.map((t) => t.clubId));
  const cupSearchResults = cupSearch.trim()
    ? cupCommunities.filter(
        (c) =>
          !cupTeamCommunityIds.has(c.id) &&
          c.name.toLowerCase().includes(cupSearch.trim().toLowerCase()),
      )
    : [];

  async function handleCupTeamStatus(teamId: string, status: TournamentTeam["status"]) {
    if (!cupTournamentId) return;
    setCupBusy(true);
    try {
      await adminUpdateTeamStatus(cupTournamentId, teamId, status);
      toast({ title: status === "confirmado" ? "Inscrição confirmada" : "Inscrição recusada" });
    } catch (err) {
      console.warn("[Admin] cup status:", err);
      toast({ title: "Erro ao actualizar inscrição", variant: "destructive" });
    } finally {
      setCupBusy(false);
    }
  }

  async function handleCupTeamDelete(teamId: string, name: string) {
    if (!cupTournamentId) return;
    if (!window.confirm(`Excluir a inscrição de «${name}»?`)) return;
    setCupBusy(true);
    try {
      await adminDeleteTeam(cupTournamentId, teamId);
      toast({ title: "Inscrição excluída" });
    } catch (err) {
      console.warn("[Admin] cup delete:", err);
      toast({ title: "Erro ao excluir", variant: "destructive" });
    } finally {
      setCupBusy(false);
    }
  }

  async function handleCupManualRegister(community: Community) {
    if (!cupTournamentId) return;
    setCupBusy(true);
    try {
      await adminRegisterTeam(cupTournamentId, community.id, {
        name: community.name,
        crestUrl: community.branding?.logoUrl,
      });
      setCupSearch("");
      toast({ title: "Clube inscrito!", description: community.name });
    } catch (err) {
      if (err instanceof TournamentTeamAlreadyRegisteredError) {
        toast({ title: "Já estava inscrito", description: err.message });
      } else {
        toast({
          title: "Não foi possível inscrever",
          description: err instanceof Error ? err.message : "Tenta outra vez.",
          variant: "destructive",
        });
      }
    } finally {
      setCupBusy(false);
    }
  }

  async function handleReportAction(reportId: string, status: "resolved" | "dismissed") {
    setBusy(true);
    try {
      await adminUpdateReportStatus(reportId, status);
      setReports((prev) => prev.filter((r) => r.id !== reportId));
      toast({
        title: status === "resolved" ? "Denúncia resolvida" : "Denúncia dispensada",
      });
    } catch (err) {
      console.warn("[Admin] report:", err);
      toast({ title: "Erro ao actualizar denúncia", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function runSearch() {
    setBusy(true);
    setSearched(true);
    try {
      const rows = await adminFindUsers(search);
      setResults(rows);
      setSelected(rows[0] ?? null);
      if (rows.length === 0) {
        toast({ title: "Ninguém encontrado", description: "Tenta uid, email ou nome exacto." });
      }
    } catch (err) {
      console.warn("[Admin] search:", err);
      toast({
        title: "Erro na pesquisa",
        description: "Verifica ligação e permissões de admin.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  async function refreshSelected(uid: string) {
    const row = await adminLoadUser(uid);
    if (row) {
      setSelected(row);
      setResults((prev) => prev.map((r) => (r.uid === uid ? row : r)));
    }
  }

  async function handleGrant() {
    if (!selected) return;
    setBusy(true);
    try {
      const iso = new Date(`${proUntil}T23:59:59.999Z`).toISOString();
      await adminGrantPro(selected.uid, plan, iso);
      await refreshSelected(selected.uid);
      toast({ title: "PRO activado", description: `${selected.displayName} · ${plan}` });
    } catch (err) {
      console.warn("[Admin] grant:", err);
      toast({
        title: "Não foi possível activar PRO",
        description: "Confirma que és admin (appConfig/admins ou VITE_ADMIN_UIDS).",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleRevoke() {
    if (!selected) return;
    setBusy(true);
    try {
      await adminRevokePro(selected.uid);
      await refreshSelected(selected.uid);
      toast({ title: "PRO revogado", description: selected.displayName });
    } catch (err) {
      console.warn("[Admin] revoke:", err);
      toast({ title: "Erro ao revogar", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function handleUnlockEmbaixador() {
    if (!selected) return;
    setBusy(true);
    try {
      await adminUnlockSkin(selected.uid, "embaixador");
      await refreshSelected(selected.uid);
      toast({ title: "Skin Embaixador desbloqueada" });
    } catch (err) {
      console.warn("[Admin] skin:", err);
      toast({ title: "Erro ao desbloquear skin", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  if (adminLoading) {
    return (
      <JogaPage theme="dark" padded={false}>
        <div className="flex min-h-[50vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </JogaPage>
    );
  }

  const loggedIn = Boolean(firebaseUser && !firebaseUser.isAnonymous);

  if (!loggedIn || !isAdmin) {
    return (
      <JogaPage theme="dark" padded={false}>
        <div className="px-4 pt-6 max-w-lg mx-auto text-center">
          <Shield className="w-12 h-12 mx-auto text-white/25 mb-4" />
          <h1 className="font-display font-black text-xl text-white">Acesso restrito</h1>
          <p className="text-white/45 text-sm mt-2">
            Esta área é só para administradores da app.
          </p>
          {loggedIn && firebaseUser && (
            <p className="text-white/30 text-xs mt-4 font-mono break-all">
              {firebaseUser.email ?? "sem email"} · {firebaseUser.uid}
            </p>
          )}
          <Link href="/perfil" className="inline-block mt-6">
            <JogaButton variant="ghost">Voltar ao perfil</JogaButton>
          </Link>
        </div>
      </JogaPage>
    );
  }

  return (
    <JogaPage theme="dark" padded={false}>
      <div className="px-4 pt-4 pb-8 max-w-lg mx-auto space-y-5">
        <div className="flex items-center gap-3">
          <Link href="/perfil">
            <JogaButton variant="ghost" size="sm" className="gap-1.5 px-2">
              <ArrowLeft className="w-4 h-4" />
            </JogaButton>
          </Link>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400/70">
              Administração
            </p>
            <h1 className="font-display font-black text-xl text-white">Gestão PRO manual</h1>
          </div>
        </div>

        <div
          className="rounded-2xl p-4 space-y-3"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <p className="text-white/50 text-xs leading-relaxed">
            Pesquisa por <strong className="text-white/70">uid</strong>,{" "}
            <strong className="text-white/70">email</strong> ou{" "}
            <strong className="text-white/70">nome exacto</strong>. O PRO é gravado em{" "}
            <code className="text-emerald-300/80">entitlements</code> no Firestore.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void runSearch()}
              placeholder="uid, email ou nome"
              className={`flex-1 ${ADMIN_FIELD}`}
              data-testid="admin-search-input"
            />
            <JogaButton
              variant="primary"
              size="sm"
              className="shrink-0 gap-1.5"
              disabled={busy || !search.trim()}
              onClick={() => void runSearch()}
            >
              <Search className="w-4 h-4" />
              Buscar
            </JogaButton>
          </div>
        </div>

        <AdminFieldPhotos disabled={busy} />

        {results.length > 1 && (
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-white/35">
              {results.length} resultados
            </p>
            {results.map((row) => (
              <button
                key={row.uid}
                type="button"
                onClick={() => setSelected(row)}
                className="w-full text-left rounded-xl px-3 py-2.5 text-sm transition-colors"
                style={{
                  background: selected?.uid === row.uid ? "rgba(74,222,128,0.12)" : "rgba(255,255,255,0.04)",
                  border: `1px solid ${selected?.uid === row.uid ? "rgba(74,222,128,0.35)" : "rgba(255,255,255,0.08)"}`,
                }}
              >
                <span className="font-bold text-white">{row.displayName}</span>
                <span className="text-white/40 ml-2 text-xs">{formatProStatus(row)}</span>
              </button>
            ))}
          </div>
        )}

        {selected && (
          <div
            className="rounded-3xl p-5 space-y-4"
            style={{ background: "rgba(74,222,128,0.06)", border: "1.5px solid rgba(74,222,128,0.25)" }}
            data-testid="admin-user-panel"
          >
            <div>
              <h2 className="font-display font-black text-lg text-white">{selected.displayName}</h2>
              <p className="text-white/40 text-xs mt-1 font-mono break-all">{selected.uid}</p>
              {selected.email && (
                <p className="text-white/50 text-sm mt-1">{selected.email}</p>
              )}
              <p className="text-emerald-300/90 text-sm font-bold mt-2">{formatProStatus(selected)}</p>
              {selected.unlockedSkins?.length ? (
                <p className="text-white/40 text-xs mt-1">
                  Skins: {selected.unlockedSkins.join(", ")}
                </p>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className="text-[10px] font-bold uppercase text-white/60">Plano</span>
                <select
                  value={plan}
                  onChange={(e) => setPlan(e.target.value as EntitlementPlan)}
                  className={ADMIN_FIELD}
                >
                  <option value="player_pro" className="bg-[#0f172a] text-white">PRO Jogador</option>
                  <option value="organizer_pro" className="bg-[#0f172a] text-white">Clube PRO</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-[10px] font-bold uppercase text-white/60">Válido até</span>
                <input
                  type="date"
                  value={proUntil}
                  onChange={(e) => setProUntil(e.target.value)}
                  className={ADMIN_FIELD}
                />
              </label>
            </div>

            <JogaButton
              variant="gold"
              size="md"
              className="w-full gap-2"
              disabled={busy}
              onClick={() => void handleGrant()}
              data-testid="admin-grant-pro"
            >
              <Crown className="w-4 h-4" />
              Activar PRO
            </JogaButton>

            <div className="grid grid-cols-2 gap-2">
              <JogaButton
                variant="ghost"
                size="sm"
                className="gap-1.5 text-red-300/90"
                disabled={busy}
                onClick={() => void handleRevoke()}
              >
                <UserX className="w-3.5 h-3.5" />
                Revogar PRO
              </JogaButton>
              <JogaButton
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => void handleUnlockEmbaixador()}
              >
                🏅 Embaixador
              </JogaButton>
            </div>
          </div>
        )}

        {searched && results.length === 0 && !busy && (
          <p className="text-center text-white/35 text-sm">Nenhum utilizador encontrado.</p>
        )}

        <div
          className="rounded-2xl p-4 space-y-3"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <div className="flex items-center gap-2">
            <Flag className="w-4 h-4 text-amber-400" />
            <h2 className="font-display font-black text-white text-lg">Denúncias</h2>
          </div>
          {reportsLoading ? (
            <p className="text-white/40 text-sm">A carregar…</p>
          ) : reports.length === 0 ? (
            <p className="text-white/40 text-sm">Sem denúncias abertas.</p>
          ) : (
            <div className="space-y-3">
              {reports.map((report) => (
                <div
                  key={report.id}
                  className="rounded-xl p-3 space-y-2"
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
                >
                  <p className="text-white text-sm font-bold">
                    {report.targetType === "community" ? "Clube" : "Jogador"} · {report.reason}
                  </p>
                  <p className="text-white/40 text-xs font-mono break-all">
                    alvo: {report.targetId} · de: {report.reporterId}
                  </p>
                  {report.details ? (
                    <p className="text-white/55 text-xs leading-relaxed">{report.details}</p>
                  ) : null}
                  <div className="flex gap-2 pt-1">
                    <JogaButton
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() => void handleReportAction(report.id, "resolved")}
                    >
                      Resolvido
                    </JogaButton>
                    <JogaButton
                      variant="ghost"
                      size="sm"
                      className="text-white/50"
                      disabled={busy}
                      onClick={() => void handleReportAction(report.id, "dismissed")}
                    >
                      Dispensar
                    </JogaButton>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div
          className="rounded-2xl p-4 space-y-3"
          style={{ background: "rgba(230,193,92,0.06)", border: "1px solid rgba(230,193,92,0.22)" }}
        >
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-400" />
            <h2 className="font-display font-black text-white text-lg">Joga Aí Cup</h2>
          </div>

          {!cupTournamentId ? (
            <p className="text-white/40 text-sm">Nenhum torneio activo.</p>
          ) : (
            <>
              <p className="text-white/40 text-xs">
                {cupTeams.length} clube{cupTeams.length !== 1 ? "s" : ""} inscrito{cupTeams.length !== 1 ? "s" : ""}
              </p>

              <div className="space-y-2">
                {cupTeams.map((team) => (
                  <div
                    key={team.id}
                    className="rounded-xl p-3 space-y-2"
                    style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-white text-sm font-bold">{team.name}</span>
                      <span
                        className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full shrink-0"
                        style={
                          team.status === "confirmado"
                            ? { background: "rgba(74,222,128,0.15)", color: "#4ade80" }
                            : team.status === "recusado"
                              ? { background: "rgba(248,113,113,0.15)", color: "#f87171" }
                              : { background: "rgba(251,191,36,0.12)", color: "#fbbf24" }
                        }
                      >
                        {team.status}
                      </span>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {team.status !== "confirmado" && (
                        <JogaButton
                          variant="ghost"
                          size="sm"
                          disabled={cupBusy}
                          onClick={() => void handleCupTeamStatus(team.id, "confirmado")}
                        >
                          Confirmar
                        </JogaButton>
                      )}
                      {team.status !== "recusado" && (
                        <JogaButton
                          variant="ghost"
                          size="sm"
                          className="text-white/50"
                          disabled={cupBusy}
                          onClick={() => void handleCupTeamStatus(team.id, "recusado")}
                        >
                          Recusar
                        </JogaButton>
                      )}
                      <JogaButton
                        variant="ghost"
                        size="sm"
                        className="text-red-300/90"
                        disabled={cupBusy}
                        onClick={() => void handleCupTeamDelete(team.id, team.name)}
                      >
                        Excluir
                      </JogaButton>
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-2 space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/35">
                  Inscrever um clube manualmente
                </p>
                <input
                  type="text"
                  value={cupSearch}
                  onChange={(e) => setCupSearch(e.target.value)}
                  placeholder="Nome do clube"
                  className={ADMIN_FIELD}
                  data-testid="admin-cup-search-input"
                />
                {cupSearchResults.length > 0 && (
                  <div className="space-y-1.5">
                    {cupSearchResults.slice(0, 8).map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        disabled={cupBusy}
                        onClick={() => void handleCupManualRegister(c)}
                        className="w-full text-left rounded-xl px-3 py-2 text-sm flex items-center justify-between gap-2"
                        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                      >
                        <span className="text-white">{c.name}</span>
                        <span className="text-white/35 text-xs">{c.city}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </JogaPage>
  );
}
