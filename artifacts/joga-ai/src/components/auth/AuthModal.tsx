import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { JogaLogo } from "@/components/brand";
import { LoginPanel } from "./LoginPanel";

export type AuthModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  initialMode?: "login" | "register";
  title?: string;
  description?: string;
};

export function AuthModal({
  open,
  onOpenChange,
  onSuccess,
  initialMode = "register",
  title = "Entra no Joga AI",
  description = "Cria a tua conta para montar a carta, organizar peladas e evoluir de verdade.",
}: AuthModalProps) {
  const [panelKey, setPanelKey] = useState(0);

  useEffect(() => {
    if (open) setPanelKey((k) => k + 1);
  }, [open, initialMode]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-white/10 bg-[#0a0f1a]/98 backdrop-blur-xl text-white p-6 sm:p-7 rounded-2xl shadow-2xl [&>button]:text-white/50 [&>button]:hover:text-white [&>button]:top-5 [&>button]:right-5">
        <div className="flex justify-center mb-3">
          <JogaLogo variant="badge" size="md" />
        </div>
        <DialogTitle className="font-display font-black text-2xl text-white text-center pr-6">
          {title}
        </DialogTitle>
        <DialogDescription className="text-white/45 text-sm text-center -mt-1 mb-2">
          {description}
        </DialogDescription>
        <LoginPanel
          key={panelKey}
          bare
          compact
          initialMode={initialMode}
          onSuccess={() => {
            onSuccess?.();
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
