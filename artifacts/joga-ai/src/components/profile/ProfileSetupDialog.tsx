import { useEffect, useRef, useState } from "react";
import { Camera } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { JogaButton } from "@/components/joga";
import { PhotoCropDialog } from "@/components/profile/PhotoCropDialog";
import {
  completeUserProfile,
  updateUserProfile,
  ProfilePhotoTooLargeError,
  type UserProfile,
} from "@/lib/userRepository";
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfile } from "@/hooks/useUserProfile";

const POSITIONS = [
  { value: "AVA", label: "Avançado" },
  { value: "MEI", label: "Médio" },
  { value: "DEF", label: "Defesa" },
  { value: "GR", label: "Guarda-redes" },
] as const;

const MAX_PHOTO_BYTES = 10 * 1024 * 1024; // 10 MB — a foto é comprimida ao enquadrar

type ProfileSetupDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
  dismissible?: boolean;
  profile?: UserProfile | null;
};

export function ProfileSetupDialog({
  open,
  onOpenChange,
  onComplete,
  dismissible = true,
  profile,
}: ProfileSetupDialogProps) {
  const { userId, isLinked } = useAuth();
  const { refresh } = useUserProfile();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isEditing = Boolean(profile?.profileComplete);

  const [displayName, setDisplayName] = useState("");
  const [position, setPosition] = useState("AVA");
  const [shirtNumber, setShirtNumber] = useState("10");
  const [photoUrl, setPhotoUrl] = useState<string | undefined>();
  const [instagram, setInstagram] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [showInstagramPublic, setShowInstagramPublic] = useState(false);
  const [showWhatsappPublic, setShowWhatsappPublic] = useState(false);
  const [cropSource, setCropSource] = useState<string | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const syncedOnOpenRef = useRef(false);

  useEffect(() => {
    if (!open) {
      syncedOnOpenRef.current = false;
      return;
    }
    if (syncedOnOpenRef.current) return;
    syncedOnOpenRef.current = true;
    setDisplayName(profile?.displayName ?? "");
    setPosition(profile?.position ?? "AVA");
    setShirtNumber(String(profile?.shirtNumber ?? 10));
    setPhotoUrl(profile?.photoUrl);
    setInstagram(profile?.instagram ? `@${profile.instagram.replace(/^@/, "")}` : "");
    setWhatsapp(profile?.whatsapp ?? "");
    setShowInstagramPublic(Boolean(profile?.showInstagramPublic));
    setShowWhatsappPublic(Boolean(profile?.showWhatsappPublic));
    setError("");
  }, [
    open,
    profile?.displayName,
    profile?.position,
    profile?.shirtNumber,
    profile?.photoUrl,
    profile?.instagram,
    profile?.whatsapp,
    profile?.showInstagramPublic,
    profile?.showWhatsappPublic,
  ]);

  function handlePhotoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Escolhe uma imagem (JPG, PNG ou WebP).");
      return;
    }

    if (file.size > MAX_PHOTO_BYTES) {
      setError("Imagem demasiado grande. Usa uma foto até 10 MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setCropSource(reader.result);
        setCropOpen(true);
        setError("");
      }
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const name = displayName.trim();
    if (name.length < 2) {
      setError("Indica o teu nome (mínimo 2 caracteres).");
      return;
    }
    const num = Number(shirtNumber);
    if (!Number.isFinite(num) || num < 1 || num > 99) {
      setError("Número da camisola entre 1 e 99.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const input = {
        displayName: name,
        position,
        shirtNumber: num,
        photoUrl,
      };

      const socialInput = isEditing
        ? {
            instagram,
            whatsapp,
            showInstagramPublic,
            showWhatsappPublic,
          }
        : undefined;

      const saveTask = isEditing
        ? updateUserProfile(
            userId,
            { displayName: name, shirtNumber: num, photoUrl, ...socialInput },
            !isLinked,
          )
        : completeUserProfile(userId, input, !isLinked);

      await Promise.race([
        saveTask,
        new Promise<never>((_, reject) => {
          window.setTimeout(
            () => reject(new Error("auth/timeout")),
            25_000,
          );
        }),
      ]);

      if (isLinked) {
        await refresh();
      }

      onComplete();
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ProfilePhotoTooLargeError) {
        setError(err.message);
      } else if (String((err as Error)?.message ?? err).includes("auth/timeout")) {
        setError("O guardar demorou demasiado. Verifica a ligação e tenta outra vez.");
      } else {
        setError(
          isLinked
            ? "Não foi possível sincronizar na nuvem. Verifica a ligação e tenta outra vez."
            : "Não foi possível guardar. Tenta outra vez.",
        );
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PhotoCropDialog
        open={cropOpen}
        imageSrc={cropSource}
        onOpenChange={setCropOpen}
        onApply={(cropped) => setPhotoUrl(cropped)}
      />

      <Dialog open={open} onOpenChange={dismissible ? onOpenChange : undefined}>
      <DialogContent
        className="bg-[#0a0f1a] border-white/10 text-white max-w-md"
        onPointerDownOutside={(e) => {
          if (!dismissible) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (!dismissible) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle className="font-display text-xl">
            {isEditing ? "Editar carta" : "Monta a tua carta"}
          </DialogTitle>
          <DialogDescription className="text-white/50">
            {isEditing
              ? "Atualiza nome, número e foto. A posição e os atributos não mudam aqui."
              : "Nome, posição e foto — leva 10 segundos. A posição só pode ser escolhida agora."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="relative w-20 h-20 rounded-2xl overflow-hidden shrink-0 cursor-pointer"
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1.5px solid rgba(255,255,255,0.12)",
              }}
              data-testid="button-setup-photo"
            >
              <img
                src={photoUrl || "/demo-player.svg"}
                alt="Foto do jogador"
                className="w-full h-full object-cover"
              />
              <span
                className="absolute inset-0 flex items-center justify-center"
                style={{ background: "rgba(0,0,0,0.35)" }}
              >
                <Camera className="w-5 h-5 text-white/90" />
              </span>
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-white/40">
                Foto do jogador
              </p>
              <p className="text-white/45 text-xs mt-1 leading-relaxed">
                Toca para escolher da galeria. Aparece na carta.
              </p>
              {photoUrl && (
                <button
                  type="button"
                  onClick={() => setPhotoUrl(undefined)}
                  className="text-red-400/80 text-xs font-semibold mt-2 cursor-pointer"
                >
                  Remover foto
                </button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePhotoChange}
            />
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-white/40">
              Nome
            </label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Ex: O teu nome"
              className="mt-1.5 w-full rounded-xl px-4 py-3 text-sm bg-white/6 border border-white/10 text-white focus:outline-none focus:border-emerald-500/50"
              data-testid="input-setup-name"
              autoFocus
            />
          </div>

          {isEditing ? (
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-white/40">
                Posição
              </label>
              <div
                className="mt-1.5 rounded-xl px-4 py-3 text-sm font-bold"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "1.5px solid rgba(255,255,255,0.08)",
                  color: "rgba(255,255,255,0.55)",
                }}
              >
                {POSITIONS.find((p) => p.value === position)?.label ?? position}
                <span className="block text-white/30 text-[11px] font-medium mt-1">
                  Definida no cadastro — não pode ser alterada.
                </span>
              </div>
            </div>
          ) : (
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-white/40">
                Posição
              </label>
              <div className="grid grid-cols-2 gap-2 mt-1.5">
                {POSITIONS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setPosition(p.value)}
                    className="rounded-xl py-2.5 text-sm font-bold transition-colors"
                    style={
                      position === p.value
                        ? { background: "rgba(74,222,128,0.15)", border: "1.5px solid rgba(74,222,128,0.4)", color: "#4ade80" }
                        : { background: "rgba(255,255,255,0.05)", border: "1.5px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.6)" }
                    }
                    data-testid={`setup-position-${p.value}`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <p className="text-white/30 text-[11px] mt-1.5">
                Escolhe com cuidado — não podes mudar depois.
              </p>
            </div>
          )}

          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-white/40">
              Nº camisola
            </label>
            <input
              type="number"
              min={1}
              max={99}
              value={shirtNumber}
              onChange={(e) => setShirtNumber(e.target.value)}
              className="mt-1.5 w-full rounded-xl px-4 py-3 text-sm bg-white/6 border border-white/10 text-white focus:outline-none focus:border-emerald-500/50"
              data-testid="input-setup-shirt"
            />
            <p className="text-white/30 text-[11px] mt-1.5">
              Guardado no perfil; a carta ainda não mostra o número visualmente.
            </p>
          </div>

          {isEditing && (
            <div className="space-y-3 pt-1 border-t border-white/8">
              <p className="text-[10px] font-bold uppercase tracking-wider text-white/40">
                Redes sociais (opcional)
              </p>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-white/40">
                  Instagram
                </label>
                <input
                  value={instagram}
                  onChange={(e) => setInstagram(e.target.value)}
                  placeholder="@utilizador ou link"
                  className="mt-1.5 w-full rounded-xl px-4 py-3 text-sm bg-white/6 border border-white/10 text-white focus:outline-none focus:border-emerald-500/50"
                  data-testid="input-setup-instagram"
                />
                <label className="mt-2 flex items-center gap-2 text-white/55 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showInstagramPublic}
                    onChange={(e) => setShowInstagramPublic(e.target.checked)}
                    className="accent-emerald-500"
                    data-testid="checkbox-instagram-public"
                  />
                  Mostrar no perfil público
                </label>
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
                  data-testid="input-setup-whatsapp"
                />
                <label className="mt-2 flex items-center gap-2 text-white/55 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showWhatsappPublic}
                    onChange={(e) => setShowWhatsappPublic(e.target.checked)}
                    className="accent-emerald-500"
                    data-testid="checkbox-whatsapp-public"
                  />
                  Mostrar no perfil público
                </label>
              </div>
            </div>
          )}

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <JogaButton
            type="submit"
            variant="primary"
            size="lg"
            className="w-full"
            disabled={saving}
            data-testid="button-setup-submit"
          >
            {saving ? "A guardar…" : isEditing ? "Guardar alterações" : "Criar carta"}
          </JogaButton>
        </form>
      </DialogContent>
    </Dialog>
    </>
  );
}
