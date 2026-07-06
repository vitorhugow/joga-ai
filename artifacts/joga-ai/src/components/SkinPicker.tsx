/**
 * SkinPicker — chips horizontais debaixo da carta (perfil próprio).
 * Skins bloqueadas mostram cadeado e levam ao /premium (ou explicam o referral).
 */

import { Lock } from "lucide-react";
import { doc, updateDoc } from "firebase/firestore";
import { useLocation } from "wouter";
import { db, isFirebaseConfigured } from "@/lib/firebase";
import { toast } from "@/hooks/use-toast";
import { CARD_SKINS, canUseSkin, effectiveSkinId } from "@/lib/cardSkins";
import type { UserProfile } from "@/lib/userRepository";

type Props = {
  profile: UserProfile;
  onSkinChange?: (skinId: string) => void;
};

export function SkinPicker({ profile, onSkinChange }: Props) {
  const [, setLocation] = useLocation();
  const active = effectiveSkinId(profile);

  async function pick(skinId: string) {
    const skin = CARD_SKINS.find((s) => s.id === skinId);
    if (!skin) return;

    if (!canUseSkin(skin, profile)) {
      if (skin.access === "referral") {
        toast({
          title: "Skin exclusiva de Embaixador",
          description: "Convida 3 amigos que joguem uma pelada para a desbloquear.",
        });
      } else {
        setLocation("/premium");
      }
      return;
    }

    onSkinChange?.(skinId);
    if (isFirebaseConfigured() && !profile.isAnonymous) {
      try {
        await updateDoc(doc(db, "users", profile.uid), { cardSkin: skinId });
      } catch (err) {
        console.warn("[SkinPicker] guardar skin:", err);
      }
    }
  }

  return (
    <div className="mt-3">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30 text-center">
        Skin da carta
      </p>
      <div className="flex gap-2 mt-2 overflow-x-auto pb-1 justify-center" role="listbox" aria-label="Skins da carta">
        {CARD_SKINS.map((skin) => {
          const usable = canUseSkin(skin, profile);
          const selected = skin.id === active;
          return (
            <button
              key={skin.id}
              type="button"
              role="option"
              aria-selected={selected}
              onClick={() => void pick(skin.id)}
              className="shrink-0 rounded-2xl px-3 py-2 text-xs font-black flex items-center gap-1.5 transition-transform active:scale-95"
              style={{
                background: selected ? `${skin.accent}26` : "rgba(255,255,255,0.05)",
                border: `1px solid ${selected ? skin.accent : "rgba(255,255,255,0.10)"}`,
                color: selected ? skin.accent : usable ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.35)",
              }}
            >
              <span
                className="w-3 h-3 rounded-full"
                style={{ background: skin.accent, opacity: usable ? 1 : 0.35 }}
              />
              {skin.name}
              {!usable && <Lock className="w-3 h-3" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
