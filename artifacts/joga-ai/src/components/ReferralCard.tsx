/**
 * ReferralCard — "Convida 3 amigos que joguem uma pelada → skin exclusiva".
 * Mostrado apenas no próprio perfil.
 */

import { useEffect, useState } from "react";
import { arrayUnion, doc, updateDoc } from "firebase/firestore";
import { db, isFirebaseConfigured } from "@/lib/firebase";
import { toast } from "@/hooks/use-toast";
import {
  getReferralLink,
  getReferralWhatsAppLink,
  loadReferralProgress,
  REFERRAL_GOAL,
  REFERRAL_SKIN_ID,
  type ReferralProgress,
} from "@/lib/referral";
import { JogaCard } from "@/components/joga";

type Props = {
  uid: string;
  unlockedSkins?: string[];
};

export function ReferralCard({ uid, unlockedSkins }: Props) {
  const [progress, setProgress] = useState<ReferralProgress | null>(null);
  const alreadyUnlocked = unlockedSkins?.includes(REFERRAL_SKIN_ID) ?? false;

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    loadReferralProgress(uid).then((p) => {
      if (cancelled) return;
      setProgress(p);
      // Desbloqueio: grava a skin no próprio perfil (escrita own-doc, permitida)
      if (p.unlocked && !alreadyUnlocked && isFirebaseConfigured()) {
        updateDoc(doc(db, "users", uid), {
          unlockedSkins: arrayUnion(REFERRAL_SKIN_ID),
        })
          .then(() => {
            toast({
              title: "Skin Embaixador desbloqueada! 🎉",
              description:
                "Trouxeste 3 amigos para o jogo. A tua skin exclusiva fica disponível com as cartas premium, muito em breve.",
            });
          })
          .catch((err) => console.warn("[referral] unlock:", err));
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(getReferralLink(uid));
      toast({ title: "Link copiado!", description: "Cola no grupo da pelada." });
    } catch {
      toast({ title: "Não foi possível copiar", description: getReferralLink(uid) });
    }
  }

  const qualified = progress?.qualified ?? 0;
  const done = alreadyUnlocked || (progress?.unlocked ?? false);

  return (
    <JogaCard variant="arena" padding="lg" className="relative overflow-hidden">
      <img
        src="/home/band-stands.webp"
        alt=""
        aria-hidden="true"
        loading="lazy"
        decoding="async"
        className="absolute inset-0 w-full h-full object-cover"
        style={{ opacity: 0.55, objectPosition: "center 40%" }}
        onError={(e) => { e.currentTarget.remove(); }}
      />
      <div className="absolute inset-0" style={{ background: "linear-gradient(155deg, rgba(10,15,26,0.75) 0%, rgba(10,15,26,0.55) 55%, rgba(10,15,26,0.35) 100%)" }} />

      <div className="relative z-10">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300/70">
          Convida a malta
        </p>
        <h3 className="font-display font-black text-white text-lg mt-1">
          {done ? "Skin Embaixador desbloqueada 🏅" : "Ganha uma skin exclusiva"}
        </h3>
        <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.45)" }}>
          {done
            ? "Obrigado por espalhares o jogo. A skin fica disponível com as cartas premium."
            : `Convida ${REFERRAL_GOAL} amigos que joguem uma pelada e desbloqueia a skin Embaixador na tua carta.`}
        </p>

        {!done && (
          <div className="flex items-center gap-2 mt-3" aria-label={`${qualified} de ${REFERRAL_GOAL} amigos qualificados`}>
            {Array.from({ length: REFERRAL_GOAL }).map((_, i) => (
              <div
                key={i}
                className="h-2 flex-1 rounded-full"
                style={{
                  background:
                    i < qualified ? "#10b981" : "rgba(255,255,255,0.10)",
                }}
              />
            ))}
            <span className="text-xs font-bold text-white/60 ml-1">
              {qualified}/{REFERRAL_GOAL}
            </span>
          </div>
        )}

        <div className="flex gap-2 mt-4">
          <a
            href={getReferralWhatsAppLink(uid)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 rounded-2xl py-3 text-center font-black text-sm text-white"
            style={{ background: "#10b981" }}
          >
            Convidar no WhatsApp
          </a>
          <button
            type="button"
            onClick={() => void copyLink()}
            className="rounded-2xl px-4 py-3 font-black text-sm text-white/80"
            style={{ background: "rgba(255,255,255,0.08)" }}
          >
            Copiar link
          </button>
        </div>
      </div>
    </JogaCard>
  );
}
