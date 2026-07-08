import { useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, Crown, Search, Shield, UserX } from "lucide-react";
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
  type AdminUserRow,
} from "@/lib/adminRepository";
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
      </div>
    </JogaPage>
  );
}
