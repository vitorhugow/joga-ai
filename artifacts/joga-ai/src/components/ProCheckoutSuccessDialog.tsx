import { Crown, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { JogaButton } from "@/components/joga";
import { ProFeatureBadge } from "@/components/ProFeatureBadge";
import type { EntitlementPlan } from "@/lib/entitlements";

type ProCheckoutSuccessDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: EntitlementPlan | null;
};

const COPY: Record<EntitlementPlan, { title: string; description: string; tier: "player" | "organizer" }> = {
  player_pro: {
    title: "Parabéns! Agora és PRO Jogador ✦",
    description:
      "Skins premium, evolução completa, export HD e estatísticas avançadas — tudo desbloqueado. Bem-vindo ao lado PRO da pelada.",
    tier: "player",
  },
  organizer_pro: {
    title: "Parabéns! Agora és Clube PRO ✦",
    description:
      "Selo nas tuas peladas, recorrentes semanais, lembretes automáticos e ferramentas de clube — inclui tudo do PRO Jogador.",
    tier: "organizer",
  },
};

export function ProCheckoutSuccessDialog({ open, onOpenChange, plan }: ProCheckoutSuccessDialogProps) {
  const key = plan ?? "player_pro";
  const copy = COPY[key];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-sm border-emerald-400/35 text-white p-0 overflow-hidden"
        style={{ background: "#0f172a" }}
      >
        <DialogTitle className="sr-only">{copy.title}</DialogTitle>
        <div
          className="p-6 pb-4 text-center"
          style={{ background: "linear-gradient(160deg, rgba(74,222,128,0.16), rgba(15,23,42,0))" }}
        >
          <div
            className="w-14 h-14 rounded-2xl mx-auto mb-3 flex items-center justify-center"
            style={{ background: "rgba(74,222,128,0.15)", border: "1px solid rgba(74,222,128,0.35)" }}
          >
            <Crown className="w-7 h-7 text-emerald-300" />
          </div>
          <div className="flex justify-center mb-2">
            <ProFeatureBadge tier={copy.tier} />
          </div>
          <h2 className="font-display font-black text-xl text-white">{copy.title}</h2>
          <p className="text-white/55 text-sm mt-2 leading-relaxed">{copy.description}</p>
        </div>
        <div className="px-6 pb-6">
          <JogaButton variant="primary" size="lg" className="w-full gap-2" onClick={() => onOpenChange(false)}>
            <Sparkles className="w-4 h-4" />
            Vamos jogar
          </JogaButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}
