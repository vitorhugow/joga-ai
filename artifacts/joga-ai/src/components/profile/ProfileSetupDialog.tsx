import { useEffect, useRef, useState } from "react";
import { Camera, Minus, Plus } from "lucide-react";
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
import {
  ALLOCATION_MAX_PER_ATTRIBUTE,
  ALLOCATION_MIN_PER_ATTRIBUTE,
  ALLOCATION_TOTAL_POINTS,
  ATTRIBUTE_KEYS,
  allocationPointsRemaining,
  calculateOverall,
  createInitialAllocation,
  isValidInitialAllocation,
  type PlayerAttributes,
} from "@/lib/cardUtils";
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfile } from "@/hooks/useUserProfile";
import { hasPlayerPro } from "@/lib/entitlements";
import { ProFeatureBadge } from "@/components/ProFeatureBadge";
import { ProUpgradeDialog } from "@/components/ProUpgradeDialog";

const POSITIONS = [
  { value: "AVA", label: "Avançado" },
  { value: "MEI", label: "Médio" },
  { value: "DEF", label: "Defesa" },
  { value: "GR", label: "Guarda-redes" },
] as const;

const ATTRIBUTE_LABELS: Record<keyof PlayerAttributes, string> = {
  ritmo: "Ritmo",
  finalizacao: "Finalização",
  passe: "Passe",
  defesa: "Defesa",
  drible: "Drible",
  fisico: "Físico",
};

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

  const [step, setStep] = useState<"info" | "attributes">("info");
  const [displayName, setDisplayName] = useState("");
  const [position, setPosition] = useState("AVA");
  const [photoUrl, setPhotoUrl] = useState<string | undefined>();
  const [attributes, setAttributes] = useState<PlayerAttributes>(createInitialAllocation);
  const [cropSource, setCropSource] = useState<string | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showProEditDialog, setShowProEditDialog] = useState(false);
  const syncedOnOpenRef = useRef(false);
  const pro = hasPlayerPro(profile?.entitlements);

  useEffect(() => {
    if (!open) {
      syncedOnOpenRef.current = false;
      return;
    }
    if (syncedOnOpenRef.current) return;
    syncedOnOpenRef.current = true;
    setStep("info");
    setDisplayName(profile?.displayName ?? "");
    setPosition(profile?.position ?? "AVA");
    setPhotoUrl(profile?.photoUrl);
    setAttributes(createInitialAllocation());
    setError("");
  }, [open, profile]);

  const remainingPoints = allocationPointsRemaining(attributes);
  const previewOverall = calculateOverall(attributes);

  function adjustAttribute(key: keyof PlayerAttributes, delta: number) {
    setAttributes((prev) => {
      const current = prev[key];
      const remaining = allocationPointsRemaining(prev);
      let next = current + delta;
      next = Math.max(ALLOCATION_MIN_PER_ATTRIBUTE, Math.min(ALLOCATION_MAX_PER_ATTRIBUTE, next));
      const actualDelta = next - current;
      if (actualDelta > 0 && actualDelta > remaining) {
        next = current + remaining;
      }
      return { ...prev, [key]: next };
    });
  }

  function handleInfoSubmit(e: React.FormEvent) {
    e.preventDefault();
    const name = displayName.trim();
    if (name.length < 2) {
      setError("Indica o teu nome (mínimo 2 caracteres).");
      return;
    }

    if (isEditing && !pro) {
      const nameChanged = name !== (profile?.displayName ?? "").trim();
      const positionChanged = position !== (profile?.position ?? "AVA");
      if (nameChanged || positionChanged) {
        setShowProEditDialog(true);
        return;
      }
    }

    setError("");

    if (isEditing) {
      void saveProfile();
      return;
    }

    setStep("attributes");
  }

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

  async function saveProfile() {
    const name = displayName.trim();

    if (!isEditing && !isValidInitialAllocation(attributes)) {
      setError(`Distribui todos os ${ALLOCATION_TOTAL_POINTS} pontos antes de continuar.`);
      return;
    }

    setSaving(true);
    setError("");
    try {
      const input = {
        displayName: name,
        position,
        shirtNumber: profile?.shirtNumber ?? 10,
        photoUrl,
        attributes: isEditing ? undefined : attributes,
      };

      const saveTask = isEditing
        ? updateUserProfile(
            userId,
            pro
              ? { displayName: name, position, photoUrl }
              : { photoUrl },
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
            {isEditing
              ? "Editar carta"
              : step === "attributes"
                ? "Distribui os atributos"
                : "Monta a tua carta"}
          </DialogTitle>
          <DialogDescription className="text-white/50">
            {isEditing
              ? pro
                ? "Atualiza nome, posição e foto. Os atributos não mudam aqui."
                : "Atualiza a foto. Nome e posição são recursos PRO."
              : step === "attributes"
                ? `Reparte ${ALLOCATION_TOTAL_POINTS} pontos pelos 6 atributos, no máximo ${ALLOCATION_MAX_PER_ATTRIBUTE} em cada. É a tua carta — decide onde é que és melhor.`
                : "Nome, posição e foto — leva 10 segundos. A posição só pode ser escolhida agora."}
          </DialogDescription>
        </DialogHeader>

        {!isEditing && step === "attributes" ? (
          <div className="space-y-4 mt-2">
            <div
              className="flex items-center justify-between rounded-xl px-4 py-3"
              style={{ background: "rgba(74,222,128,0.1)", border: "1.5px solid rgba(74,222,128,0.25)" }}
            >
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/40">
                  Pontos por distribuir
                </p>
                <p
                  className="font-display font-black text-2xl"
                  style={{ color: remainingPoints === 0 ? "#4ade80" : "white" }}
                >
                  {remainingPoints}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/40">OVR</p>
                <p className="font-display font-black text-2xl text-emerald-400">{previewOverall}</p>
              </div>
            </div>

            <div className="space-y-3">
              {ATTRIBUTE_KEYS.map((key) => (
                <div key={key} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-bold text-white">{ATTRIBUTE_LABELS[key]}</span>
                      <span className="text-sm font-black text-emerald-400">{attributes[key]}</span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${((attributes[key] - ALLOCATION_MIN_PER_ATTRIBUTE) / (ALLOCATION_MAX_PER_ATTRIBUTE - ALLOCATION_MIN_PER_ATTRIBUTE)) * 100}%`,
                          background: "linear-gradient(90deg, #16a34a, #4ade80)",
                        }}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => adjustAttribute(key, -1)}
                      disabled={attributes[key] <= ALLOCATION_MIN_PER_ATTRIBUTE}
                      className="w-8 h-8 rounded-lg flex items-center justify-center disabled:opacity-30"
                      style={{ background: "rgba(255,255,255,0.08)" }}
                      data-testid={`attr-decrement-${key}`}
                    >
                      <Minus className="w-3.5 h-3.5 text-white" />
                    </button>
                    <button
                      type="button"
                      onClick={() => adjustAttribute(key, 1)}
                      disabled={attributes[key] >= ALLOCATION_MAX_PER_ATTRIBUTE || remainingPoints <= 0}
                      className="w-8 h-8 rounded-lg flex items-center justify-center disabled:opacity-30"
                      style={{ background: "rgba(74,222,128,0.15)" }}
                      data-testid={`attr-increment-${key}`}
                    >
                      <Plus className="w-3.5 h-3.5 text-emerald-400" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <div className="flex gap-2">
              <JogaButton
                type="button"
                variant="ghost"
                size="lg"
                onClick={() => setStep("info")}
                data-testid="button-setup-back"
              >
                Voltar
              </JogaButton>
              <JogaButton
                type="button"
                variant="primary"
                size="lg"
                className="flex-1"
                disabled={saving || remainingPoints !== 0}
                onClick={() => void saveProfile()}
                data-testid="button-setup-submit"
              >
                {saving ? "A guardar…" : "Criar carta"}
              </JogaButton>
            </div>
          </div>
        ) : (
        <form onSubmit={handleInfoSubmit} className="space-y-4 mt-2">
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
            <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-white/40">
              Nome
              {isEditing && <ProFeatureBadge tier="player" />}
            </label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Ex: O teu nome"
              readOnly={isEditing && !pro}
              className="mt-1.5 w-full rounded-xl px-4 py-3 text-sm bg-white/6 border border-white/10 text-white focus:outline-none focus:border-emerald-500/50 disabled:opacity-60"
              data-testid="input-setup-name"
              autoFocus
            />
          </div>

          {isEditing ? (
            <div>
              <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-white/40">
                Posição
                <ProFeatureBadge tier="player" />
              </label>
              {pro ? (
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
              ) : (
                <div
                  className="mt-1.5 rounded-xl px-4 py-3 text-sm font-bold"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1.5px solid rgba(255,255,255,0.08)",
                    color: "rgba(255,255,255,0.55)",
                  }}
                >
                  {POSITIONS.find((p) => p.value === position)?.label ?? position}
                </div>
              )}
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

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <JogaButton
            type="submit"
            variant="primary"
            size="lg"
            className="w-full"
            disabled={saving}
            data-testid="button-setup-submit"
          >
            {saving ? "A guardar…" : isEditing ? "Guardar alterações" : "Continuar"}
          </JogaButton>
        </form>
        )}
      </DialogContent>
    </Dialog>

      <ProUpgradeDialog
        open={showProEditDialog}
        onOpenChange={setShowProEditDialog}
        tier="player"
        featureTitle="Editar nome e posição"
        featureDescription="Alterar o nome e a posição na carta é exclusivo PRO Jogador."
      />
    </>
  );
}
