import { useEffect, useRef, useState } from "react";
import { MapPin, Goal } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { JogaButton } from "@/components/joga";
import { saveUserPreferences, type UserProfile } from "@/lib/userRepository";
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfile } from "@/hooks/useUserProfile";

const SUGGESTED_CITIES = ["Lisboa", "Porto", "Braga", "Setúbal", "Coimbra", "Faro", "Aveiro"];

const FIELD_TYPES = [
  { value: "futsal" as const, label: "Futsal" },
  { value: "fut5" as const, label: "F5" },
  { value: "fut7" as const, label: "F7" },
  { value: "futebol11" as const, label: "F11" },
];

type Step = "city" | "fieldType";

type PreferencesSetupDialogProps = {
  open: boolean;
  onComplete: () => void;
  profile: UserProfile;
};

export function PreferencesSetupDialog({
  open,
  onComplete,
  profile,
}: PreferencesSetupDialogProps) {
  const { userId, isLinked } = useAuth();
  const { refresh } = useUserProfile();
  const syncedRef = useRef(false);

  const [step, setStep] = useState<Step>("city");
  const [city, setCity] = useState("");
  const [fieldType, setFieldType] = useState<UserProfile["preferredFieldType"]>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      syncedRef.current = false;
      return;
    }
    if (syncedRef.current) return;
    syncedRef.current = true;
    setStep("city");
    setCity(profile.city ?? "");
    setFieldType(profile.preferredFieldType);
  }, [open, profile]);

  async function finish(preferences: {
    city?: string;
    preferredFieldType?: UserProfile["preferredFieldType"];
  }) {
    setSaving(true);
    try {
      await saveUserPreferences(
        userId,
        {
          ...preferences,
          preferencesPromptCompleted: true,
        },
        !isLinked,
      );
      if (isLinked) await refresh();
      onComplete();
    } finally {
      setSaving(false);
    }
  }

  function handleCityContinue() {
    setStep("fieldType");
  }

  function handleCitySkip() {
    setStep("fieldType");
  }

  async function handleFieldTypeContinue() {
    await finish({
      city: city.trim() || undefined,
      preferredFieldType: fieldType,
    });
  }

  async function handleFieldTypeSkip() {
    await finish({
      city: city.trim() || undefined,
    });
  }

  return (
    <Dialog open={open}>
      <DialogContent
        className="bg-[#0a0f1a] border-white/10 text-white max-w-md"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        {step === "city" ? (
          <>
            <DialogHeader>
              <DialogTitle className="font-display text-xl flex items-center gap-2">
                <MapPin className="w-5 h-5 text-emerald-400" />
                Onde costumas jogar?
              </DialogTitle>
              <DialogDescription className="text-white/50">
                Ajuda-nos a mostrar jogos perto de ti. Opcional — podes saltar.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 mt-2">
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Ex: Lisboa"
                className="w-full rounded-xl px-4 py-3 text-sm bg-white/6 border border-white/10 text-white focus:outline-none focus:border-emerald-500/50"
                data-testid="input-pref-city"
                autoFocus
              />

              <div className="flex flex-wrap gap-2">
                {SUGGESTED_CITIES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCity(c)}
                    className="rounded-full px-3 py-1.5 text-sm font-semibold transition-colors"
                    style={
                      city === c
                        ? { background: "rgba(74,222,128,0.15)", color: "#4ade80", border: "1px solid rgba(74,222,128,0.35)" }
                        : { background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.1)" }
                    }
                  >
                    {c}
                  </button>
                ))}
              </div>

              <div className="flex gap-2 pt-1">
                <JogaButton
                  type="button"
                  variant="ghost"
                  size="lg"
                  className="flex-1"
                  disabled={saving}
                  onClick={handleCitySkip}
                  data-testid="button-pref-city-skip"
                >
                  Saltar
                </JogaButton>
                <JogaButton
                  type="button"
                  variant="primary"
                  size="lg"
                  className="flex-1"
                  disabled={saving}
                  onClick={handleCityContinue}
                  data-testid="button-pref-city-continue"
                >
                  {saving ? "A guardar…" : "Continuar"}
                </JogaButton>
              </div>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="font-display text-xl flex items-center gap-2">
                <Goal className="w-5 h-5 text-emerald-400" />
                Que tipo de futebol preferes?
              </DialogTitle>
              <DialogDescription className="text-white/50">
                Para futuras recomendações. Opcional — podes saltar.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-2">
                {FIELD_TYPES.map((ft) => (
                  <button
                    key={ft.value}
                    type="button"
                    onClick={() => setFieldType(ft.value)}
                    className="rounded-xl py-3 text-sm font-bold transition-colors"
                    style={
                      fieldType === ft.value
                        ? { background: "rgba(74,222,128,0.15)", border: "1.5px solid rgba(74,222,128,0.4)", color: "#4ade80" }
                        : { background: "rgba(255,255,255,0.05)", border: "1.5px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.6)" }
                    }
                    data-testid={`pref-field-${ft.value}`}
                  >
                    {ft.label}
                  </button>
                ))}
              </div>

              <div className="flex gap-2 pt-1">
                <JogaButton
                  type="button"
                  variant="ghost"
                  size="lg"
                  className="flex-1"
                  disabled={saving}
                  onClick={() => void handleFieldTypeSkip()}
                  data-testid="button-pref-field-skip"
                >
                  Saltar
                </JogaButton>
                <JogaButton
                  type="button"
                  variant="primary"
                  size="lg"
                  className="flex-1"
                  disabled={saving}
                  onClick={() => void handleFieldTypeContinue()}
                  data-testid="button-pref-field-continue"
                >
                  {saving ? "A guardar…" : "Concluir"}
                </JogaButton>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
