import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { KeyRound } from "lucide-react";
import { isProActive } from "@/lib/entitlements";
import { ProFeatureBadge } from "@/components/ProFeatureBadge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { JogaButton } from "@/components/joga";
import {
  updateProfileSettings,
  type UserProfile,
} from "@/lib/userRepository";
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfile } from "@/hooks/useUserProfile";
import { toast } from "@/hooks/use-toast";

type ProfileEditDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: UserProfile;
};

export function ProfileEditDialog({
  open,
  onOpenChange,
  profile,
}: ProfileEditDialogProps) {
  const { userId, isLinked, firebaseUser, resetPassword } = useAuth();
  const { refresh } = useUserProfile();

  const [displayName, setDisplayName] = useState("");
  const [instagram, setInstagram] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [showInstagramPublic, setShowInstagramPublic] = useState(false);
  const [showWhatsappPublic, setShowWhatsappPublic] = useState(false);
  const pro = isProActive(profile.entitlements);
  const [saving, setSaving] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [error, setError] = useState("");
  const syncedOnOpenRef = useRef(false);

  const accountEmail = firebaseUser?.email ?? "";
  const hasEmailProvider = Boolean(
    firebaseUser?.providerData.some((p) => p.providerId === "password"),
  );

  useEffect(() => {
    if (!open) {
      syncedOnOpenRef.current = false;
      return;
    }
    if (syncedOnOpenRef.current) return;
    syncedOnOpenRef.current = true;
    setDisplayName(profile.displayName ?? "");
    setInstagram(profile.instagram ? `@${profile.instagram.replace(/^@/, "")}` : "");
    setWhatsapp(profile.whatsapp ?? "");
    setShowInstagramPublic(Boolean(profile.showInstagramPublic));
    setShowWhatsappPublic(Boolean(profile.showWhatsappPublic));
    setError("");
  }, [
    open,
    profile.displayName,
    profile.instagram,
    profile.whatsapp,
    profile.showInstagramPublic,
    profile.showWhatsappPublic,
  ]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const name = displayName.trim();
    if (!name) {
      setError("Indica o teu nome.");
      return;
    }
    if (!userId) return;

    setSaving(true);
    setError("");
    try {
      await updateProfileSettings(
        userId,
        {
          displayName: name,
          instagram,
          whatsapp,
          showInstagramPublic,
          showWhatsappPublic,
        },
        !isLinked,
      );
      if (isLinked) await refresh();
      onOpenChange(false);
      toast({ title: "Perfil atualizado" });
    } catch {
      setError(
        isLinked
          ? "Não foi possível sincronizar na nuvem. Verifica a ligação e tenta outra vez."
          : "Não foi possível guardar. Tenta outra vez.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handlePasswordReset() {
    if (!accountEmail) {
      setError("Esta conta não tem email associado.");
      return;
    }
    setResetBusy(true);
    setError("");
    try {
      await resetPassword(accountEmail);
      toast({
        title: "Email enviado",
        description: "Segue o link para definir uma nova password.",
      });
    } catch {
      setError("Não foi possível enviar o email de recuperação.");
    } finally {
      setResetBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0a0f1a] border-white/10 text-white max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Editar perfil</DialogTitle>
          <DialogDescription className="text-white/50">
            Nome, redes sociais e conta. A carta (foto, número, posição) edita-se em Editar carta.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-white/40">
              Nome completo
            </label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Como te chamam na pelada"
              className="mt-1.5 w-full rounded-xl px-4 py-3 text-sm bg-white/6 border border-white/10 text-white focus:outline-none focus:border-emerald-500/50"
              data-testid="input-profile-name"
            />
          </div>

          <div className="space-y-3 pt-1 border-t border-white/8">
            <p className="text-[10px] font-bold uppercase tracking-wider text-white/40">
              Redes sociais (opcional)
            </p>

            <div>
              <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-white/40">
                Instagram
                <ProFeatureBadge tier="player" />
              </label>
              {pro ? (
                <input
                  value={instagram}
                  onChange={(e) => setInstagram(e.target.value)}
                  placeholder="@utilizador ou link"
                  className="mt-1.5 w-full rounded-xl px-4 py-3 text-sm bg-white/6 border border-white/10 text-white focus:outline-none focus:border-emerald-500/50"
                  data-testid="input-profile-instagram"
                />
              ) : (
                <Link href="/premium" className="block">
                  <div
                    className="mt-1.5 w-full rounded-xl px-4 py-3 text-sm flex items-center justify-between"
                    style={{ background: "rgba(230,182,76,0.06)", border: "1px dashed rgba(230,182,76,0.35)" }}
                    data-testid="input-profile-instagram-locked"
                  >
                    <span className="text-white/45">Mostra o teu Instagram na carta e no perfil</span>
                    <ProFeatureBadge tier="player" />
                  </div>
                </Link>
              )}
              {pro && (
                <label className="mt-2 flex items-center gap-2 text-white/55 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showInstagramPublic}
                    onChange={(e) => setShowInstagramPublic(e.target.checked)}
                    className="accent-emerald-500"
                    data-testid="checkbox-profile-instagram-public"
                  />
                  Mostrar no perfil público
                </label>
              )}
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-white/40">
                WhatsApp
              </label>
              <input
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                placeholder="+351 912 345 678 ou wa.me/..."
                className="mt-1.5 w-full rounded-xl px-4 py-3 text-sm bg-white/6 border border-white/10 text-white focus:outline-none focus:border-emerald-500/50"
                data-testid="input-profile-whatsapp"
              />
              <label className="mt-2 flex items-center gap-2 text-white/55 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={showWhatsappPublic}
                  onChange={(e) => setShowWhatsappPublic(e.target.checked)}
                  className="accent-emerald-500"
                  data-testid="checkbox-profile-whatsapp-public"
                />
                Mostrar no perfil público
              </label>
            </div>
          </div>

          {isLinked && (
            <div className="space-y-2 pt-1 border-t border-white/8">
              <p className="text-[10px] font-bold uppercase tracking-wider text-white/40">
                Conta
              </p>
              {accountEmail && (
                <p className="text-white/55 text-sm truncate">{accountEmail}</p>
              )}
              {hasEmailProvider && accountEmail && (
                <JogaButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="gap-2 text-white/60"
                  disabled={resetBusy || saving}
                  onClick={() => void handlePasswordReset()}
                  data-testid="button-reset-password"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  {resetBusy ? "A enviar…" : "Enviar email para alterar password"}
                </JogaButton>
              )}
              {!hasEmailProvider && (
                <p className="text-white/35 text-xs leading-relaxed">
                  Entraste com Google — a password gere-se na tua conta Google.
                </p>
              )}
            </div>
          )}

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <JogaButton
            type="submit"
            variant="primary"
            size="lg"
            className="w-full"
            disabled={saving}
            data-testid="button-profile-save"
          >
            {saving ? "A guardar…" : "Guardar perfil"}
          </JogaButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
