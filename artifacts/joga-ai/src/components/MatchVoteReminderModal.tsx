import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Bell, Trophy, ChevronRight, Euro } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { JogaButton } from "@/components/joga";
import { useAuth } from "@/contexts/AuthContext";
import {
  markNotificationRead,
  processPendingNotifications,
  subscribeToNotifications,
  type AppNotification,
} from "@/lib/notificationsRepository";
import { loadMatchFromFirestore } from "@/lib/matchRepository";

type PopupKind = "vote" | "pay" | "generic";

function isPopupNotification(n: AppNotification): boolean {
  return (
    n.priority === "popup" ||
    n.id.startsWith("vote-") ||
    n.id.startsWith("pay-")
  );
}

function popupKind(n: AppNotification): PopupKind {
  if (n.id.startsWith("vote-")) return "vote";
  if (n.id.startsWith("pay-")) return "pay";
  return "generic";
}

function popupLabel(kind: PopupKind): string {
  if (kind === "vote") return "Pelada terminada";
  if (kind === "pay") return "Pagamento pendente";
  return "Aviso importante";
}

function popupCta(kind: PopupKind): string {
  if (kind === "vote") return "Votar agora";
  if (kind === "pay") return "Ver a pelada";
  return "Ver detalhes";
}

/**
 * Pop-up global: notificações com priority "popup" (e legado vote-/pay-)
 * aparecem em tempo real sem abrir o sino.
 */
export function MatchVoteReminderModal() {
  const { userId, isLinked } = useAuth();
  const [, setLocation] = useLocation();
  const [queue, setQueue] = useState<AppNotification[]>([]);
  const shownRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!isLinked || !userId) return;

    void processPendingNotifications(userId);

    const unsub = subscribeToNotifications(userId, (items) => {
      const pending = items.filter(
        (n) => isPopupNotification(n) && !n.read && !shownRef.current.has(n.id),
      );
      if (pending.length === 0) return;

      pending.forEach((n) => shownRef.current.add(n.id));

      void Promise.all(
        pending.map(async (n) => {
          if (!n.id.startsWith("vote-")) return n;
          const matchId = n.id.replace(/^vote-/, "");
          try {
            const match = await loadMatchFromFirestore(matchId);
            if (match && match.status !== "aguardando_auditoria" && match.status !== "auditada") {
              void markNotificationRead(userId, n.id);
              return null;
            }
          } catch {
            /* se a consulta falhar, mostra na mesma por segurança */
          }
          return n;
        }),
      ).then((results) => {
        const valid = results.filter((n): n is AppNotification => n !== null);
        if (valid.length > 0) setQueue((current) => [...current, ...valid]);
      });
    });

    return unsub;
  }, [isLinked, userId]);

  const current = queue[0] ?? null;
  const kind = current ? popupKind(current) : "generic";

  function dismiss() {
    setQueue((q) => q.slice(1));
  }

  function handleAction() {
    if (!current) return;
    const link = current.link || "/jogos";
    if (userId) void markNotificationRead(userId, current.id);
    dismiss();
    setLocation(link);
  }

  function handleLater() {
    dismiss();
  }

  if (!current) return null;

  return (
    <Dialog open onOpenChange={(open) => !open && handleLater()}>
      <DialogContent
        className="max-w-sm border-amber-400/25 text-white text-center p-0 overflow-hidden"
        style={{ background: "#0f172a" }}
      >
        <div
          className="p-6 pb-5"
          style={{ background: "linear-gradient(160deg, rgba(250,204,21,0.16), rgba(15,23,42,0))" }}
        >
          <div
            className="w-14 h-14 rounded-2xl mx-auto mb-3 flex items-center justify-center"
            style={{ background: "rgba(250,204,21,0.15)", border: "1px solid rgba(250,204,21,0.3)" }}
          >
            {kind === "pay" ? (
              <Euro className="w-7 h-7 text-amber-300" />
            ) : kind === "vote" ? (
              <Trophy className="w-7 h-7 text-amber-300" />
            ) : (
              <Bell className="w-7 h-7 text-amber-300" />
            )}
          </div>
          <p className="text-amber-300 text-[10px] font-black uppercase tracking-[0.22em]">
            {popupLabel(kind)}
          </p>
          <h2 className="font-display font-black text-white text-2xl mt-1">
            {current.title}
          </h2>
          <p className="text-white/60 text-sm mt-2">
            {current.body || "Tens um aviso novo na app."}
          </p>
        </div>

        <div className="px-6 pb-6 space-y-2">
          <JogaButton variant="gold" size="lg" className="w-full gap-2" onClick={handleAction}>
            {popupCta(kind)}
            <ChevronRight className="w-4 h-4" />
          </JogaButton>
          <JogaButton variant="ghost" size="md" className="w-full" onClick={handleLater}>
            Agora não
          </JogaButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}
