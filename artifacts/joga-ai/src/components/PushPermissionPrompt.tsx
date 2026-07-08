import { useEffect, useState, useCallback } from "react";
import { Bell } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { JogaButton } from "@/components/joga";
import {
  canOfferPushPrompt,
  recordPushPromptDismissed,
  requestPushPermission,
} from "@/lib/pushNotifications";

type PushPermissionPromptProps = {
  userId?: string | null;
  /** Incrementar para reavaliar após ação significativa */
  trigger: number;
};

/** Dispara o soft-prompt após acção significativa (RSVP, criar pelada, etc.) */
let bumpPushPrompt: (() => void) | null = null;

export function triggerPushSoftPrompt(): void {
  bumpPushPrompt?.();
}

export function PushPermissionPrompt({ userId, trigger }: PushPermissionPromptProps) {
  const [open, setOpen] = useState(false);
  const bump = useCallback(() => {
    if (!userId) return;
    if (canOfferPushPrompt()) setOpen(true);
  }, [userId]);

  useEffect(() => {
    bumpPushPrompt = bump;
    return () => {
      if (bumpPushPrompt === bump) bumpPushPrompt = null;
    };
  }, [bump]);

  useEffect(() => {
    if (trigger > 0) bump();
  }, [trigger, bump]);

  if (!userId) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-sm border-white/10 text-white" style={{ background: "#0f172a" }}>
        <DialogHeader>
          <div className="w-12 h-12 rounded-2xl mx-auto mb-2 flex items-center justify-center bg-emerald-500/15 border border-emerald-500/30">
            <Bell className="w-6 h-6 text-emerald-400" />
          </div>
          <DialogTitle className="text-center font-display">Avisos no telemóvel</DialogTitle>
          <DialogDescription className="text-center text-white/55">
            Recebe avisos de peladas, pagamentos e cancelamentos — mesmo com a app fechada.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 mt-2">
          <JogaButton
            variant="primary"
            size="lg"
            onClick={() => {
              setOpen(false);
              void requestPushPermission(userId);
            }}
          >
            Sim, activar
          </JogaButton>
          <JogaButton
            variant="ghost"
            size="md"
            onClick={() => {
              recordPushPromptDismissed();
              setOpen(false);
            }}
          >
            Agora não
          </JogaButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Hook leve para disparar o soft-prompt após acções significativas */
export function usePushPromptTrigger() {
  const [trigger, setTrigger] = useState(0);
  return {
    pushPromptTrigger: trigger,
    bumpPushPrompt: () => setTrigger((n) => n + 1),
  };
}
