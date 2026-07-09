import { useEffect, useState, type ReactNode } from "react";
import { JogaButton } from "@/components/joga";
import { ProFeatureBadge } from "@/components/ProFeatureBadge";
import { ProUpgradeDialog } from "@/components/ProUpgradeDialog";
import { trackEvent } from "@/lib/analytics";

type ProLockedOverlayProps = {
  title: string;
  subtitle: string;
  tier?: "player" | "organizer";
  feature: string;
  children: ReactNode;
};

export function ProLockedOverlay({
  title,
  subtitle,
  tier = "player",
  feature,
  children,
}: ProLockedOverlayProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    trackEvent("pro_gate_seen", { feature });
  }, [feature]);

  return (
    <div className="relative rounded-3xl overflow-hidden">
      <div
        className="pointer-events-none select-none"
        style={{ filter: "blur(6px)" }}
        aria-hidden
      >
        {children}
      </div>

      <div
        className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-5 py-6 text-center"
        style={{ background: "rgba(2,6,23,0.55)" }}
      >
        <ProFeatureBadge tier={tier} />
        <h3 className="font-display font-black text-white text-lg leading-tight">{title}</h3>
        <p className="text-white/55 text-sm leading-relaxed max-w-xs">{subtitle}</p>
        <JogaButton
          variant="gold"
          size="md"
          className="mt-1"
          onClick={() => {
            trackEvent("pro_gate_clicked", { feature });
            setDialogOpen(true);
          }}
        >
          Desbloquear com PRO
        </JogaButton>
      </div>

      <ProUpgradeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        featureTitle={title}
        featureDescription={subtitle}
        tier={tier}
      />
    </div>
  );
}
