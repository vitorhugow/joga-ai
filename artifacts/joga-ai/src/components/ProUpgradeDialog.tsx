import { Crown, Sparkles } from "lucide-react";
import { Link } from "wouter";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { JogaButton } from "@/components/joga";
import { ProFeatureBadge } from "@/components/ProFeatureBadge";

type ProUpgradeDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  featureTitle: string;
  featureDescription: string;
  tier?: "player" | "organizer";
};

export function ProUpgradeDialog({
  open,
  onOpenChange,
  featureTitle,
  featureDescription,
  tier = "player",
}: ProUpgradeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-sm border-amber-400/30 text-white p-0 overflow-hidden"
        style={{ background: "#0f172a" }}
      >
        <div
          className="p-6 pb-4 text-center"
          style={{ background: "linear-gradient(160deg, rgba(250,204,21,0.14), rgba(15,23,42,0))" }}
        >
          <div
            className="w-14 h-14 rounded-2xl mx-auto mb-3 flex items-center justify-center"
            style={{ background: "rgba(251,191,36,0.15)", border: "1px solid rgba(251,191,36,0.35)" }}
          >
            <Crown className="w-7 h-7 text-amber-300" />
          </div>
          <div className="flex justify-center mb-2">
            <ProFeatureBadge tier={tier} />
          </div>
          <h2 className="font-display font-black text-xl text-white">{featureTitle}</h2>
          <p className="text-white/55 text-sm mt-2 leading-relaxed">{featureDescription}</p>
        </div>
        <div className="px-6 pb-6 space-y-2">
          <Link href="/premium" onClick={() => onOpenChange(false)}>
            <JogaButton variant="gold" size="lg" className="w-full gap-2">
              <Sparkles className="w-4 h-4" />
              Ver planos PRO
            </JogaButton>
          </Link>
          <JogaButton variant="ghost" size="md" className="w-full" onClick={() => onOpenChange(false)}>
            Agora não
          </JogaButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}
