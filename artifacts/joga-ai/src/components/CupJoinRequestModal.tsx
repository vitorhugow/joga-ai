import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Trophy } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { JogaButton } from "@/components/joga";
import { useAuth } from "@/contexts/AuthContext";
import {
  markNotificationRead,
  processPendingNotifications,
  subscribeToNotifications,
  type AppNotification,
} from "@/lib/notificationsRepository";
import { markPopupNotificationShown } from "@/lib/pushNotifications";

function isCupRequestNotification(n: AppNotification): boolean {
  return n.id.startsWith("cupreq-") && !n.read;
}

const SEEN_KEY_PREFIX = "joga:cupreq-seen:";

/**
 * Guarda síncrona em localStorage — sobrevive ao refresh, sem depender da
 * escrita assíncrona no Firestore (markNotificationRead) ter chegado a tempo.
 */
function isSeenLocally(notifId: string): boolean {
  try {
    return localStorage.getItem(`${SEEN_KEY_PREFIX}${notifId}`) === "1";
  } catch {
    return false;
  }
}

function markSeenLocally(notifId: string): void {
  try {
    localStorage.setItem(`${SEEN_KEY_PREFIX}${notifId}`, "1");
  } catch {
    /* localStorage indisponível — segue só com o Firestore */
  }
}

/**
 * Popup ao admin/capitão quando um membro pede para entrar na Joga Aí Cup.
 * Permite vários pedidos — cada um dispara o seu próprio popup (id único).
 */
export function CupJoinRequestModal() {
  const { userId, isLinked } = useAuth();
  const [, setLocation] = useLocation();
  const [queue, setQueue] = useState<AppNotification[]>([]);
  const shownRef = useRef<Set<string>>(new Set());

  async function markSeen(notifId: string) {
    if (!userId) return;
    try {
      await markNotificationRead(userId, notifId);
    } catch (err) {
      console.warn("[CupJoinRequestModal] markSeen:", err);
    }
  }

  useEffect(() => {
    if (!isLinked || !userId) return;

    void processPendingNotifications(userId);

    const unsub = subscribeToNotifications(userId, (items) => {
      const pending = items.filter(
        (n) => isCupRequestNotification(n) && !shownRef.current.has(n.id) && !isSeenLocally(n.id),
      );
      if (pending.length === 0) return;

      pending.forEach((n) => {
        shownRef.current.add(n.id);
        markPopupNotificationShown(n.id);
        markSeenLocally(n.id);
        void markSeen(n.id);
      });

      setQueue((current) => [...current, ...pending]);
    });

    return unsub;
  }, [isLinked, userId]);

  const current = queue[0] ?? null;

  function dismiss() {
    setQueue((q) => q.slice(1));
  }

  function handleAction() {
    if (!current) return;
    const link = current.link || "/comunidades";
    dismiss();
    setLocation(link);
  }

  if (!current) return null;

  return (
    <Dialog open onOpenChange={(open) => !open && dismiss()}>
      <DialogContent
        className="max-w-sm border-emerald-400/30 text-white text-center p-6"
        style={{ background: "#0f172a" }}
      >
        <div
          className="w-14 h-14 rounded-2xl mx-auto mb-3 flex items-center justify-center"
          style={{ background: "rgba(24,184,94,0.15)", border: "1px solid rgba(24,184,94,0.35)" }}
        >
          <Trophy className="w-7 h-7 text-emerald-300" />
        </div>
        <h2 className="font-display font-black text-white text-xl">{current.title}</h2>
        <p className="text-white/60 text-sm mt-2">{current.body}</p>

        <div className="mt-5 space-y-2">
          <JogaButton variant="primary" size="lg" className="w-full" onClick={handleAction}>
            Ver clube
          </JogaButton>
          <JogaButton variant="ghost" size="md" className="w-full" onClick={dismiss}>
            Agora não
          </JogaButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}
