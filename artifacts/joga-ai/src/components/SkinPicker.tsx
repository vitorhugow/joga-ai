/**
 * SkinPicker — seleção debaixo da carta (perfil próprio).
 * Botões fixos (Normal + Embaixador) e lista vertical de skins PRO.
 */

import { Lock } from "lucide-react";
import { doc, updateDoc } from "firebase/firestore";
import { useLocation } from "wouter";
import { db, isFirebaseConfigured } from "@/lib/firebase";
import { toast } from "@/hooks/use-toast";
import { CARD_SKINS, canUseSkin, effectiveSkinId, type CardSkin } from "@/lib/cardSkins";
import type { UserProfile } from "@/lib/userRepository";
import { ProFeatureBadge } from "@/components/ProFeatureBadge";

type Props = {
  profile: UserProfile;
  onSkinChange?: (skinId: string) => void;
};

function SkinButton({
  skin,
  profile,
  selected,
  onPick,
}: {
  skin: CardSkin;
  profile: UserProfile;
  selected: boolean;
  onPick: (skinId: string) => void;
}) {
  const usable = canUseSkin(skin, profile);

  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={() => onPick(skin.id)}
      className="w-full rounded-2xl px-3 py-2.5 text-xs font-black flex items-center gap-2 transition-transform active:scale-[0.98] text-left"
      style={{
        background: selected ? `${skin.accent}26` : "rgba(255,255,255,0.05)",
        border: `1px solid ${selected ? skin.accent : "rgba(255,255,255,0.10)"}`,
        color: selected ? skin.accent : usable ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.35)",
      }}
    >
      <span
        className="w-3 h-3 rounded-full shrink-0"
        style={{ background: skin.accent, opacity: usable ? 1 : 0.35 }}
      />
      <span className="flex-1 min-w-0 truncate">{skin.name}</span>
      {skin.symbol && <span className="text-sm shrink-0">{skin.symbol}</span>}
      {skin.access === "pro" && <ProFeatureBadge tier="player" className="scale-90 shrink-0" />}
      {!usable && skin.access !== "pro" && <Lock className="w-3 h-3 shrink-0" />}
    </button>
  );
}

export function SkinPicker({ profile, onSkinChange }: Props) {
  const [, setLocation] = useLocation();
  const active = effectiveSkinId(profile);

  const classica = CARD_SKINS.find((s) => s.id === "classica")!;
  const embaixador = CARD_SKINS.find((s) => s.id === "embaixador")!;
  const proSkins = CARD_SKINS.filter((s) => s.access === "pro");

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
    <div className="mt-3 max-w-sm mx-auto">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30 text-center flex items-center justify-center gap-1.5">
        Skin da carta
        <ProFeatureBadge tier="player" />
      </p>

      <div className="grid grid-cols-2 gap-2 mt-2" role="listbox" aria-label="Skins base">
        <SkinButton skin={classica} profile={profile} selected={active === classica.id} onPick={(id) => void pick(id)} />
        <SkinButton skin={embaixador} profile={profile} selected={active === embaixador.id} onPick={(id) => void pick(id)} />
      </div>

      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30 mt-3 mb-2 flex items-center gap-1.5">
        Skins PRO
        <ProFeatureBadge tier="player" className="scale-90" />
      </p>

      <div
        className="flex flex-col gap-1.5 max-h-[168px] overflow-y-auto pr-0.5"
        role="listbox"
        aria-label="Skins PRO"
      >
        {proSkins.map((skin) => (
          <SkinButton
            key={skin.id}
            skin={skin}
            profile={profile}
            selected={skin.id === active}
            onPick={(id) => void pick(id)}
          />
        ))}
      </div>
    </div>
  );
}
