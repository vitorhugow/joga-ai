import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Trophy, ChevronRight } from "lucide-react";
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

/**
 * Pop-up global: sempre que uma pelada terminar (entra em votação), todos os
 * jogadores ligados recebem uma notificação `vote-{matchId}` em tempo real
 * (Firestore onSnapshot). Este componente fica montado em toda a app e, assim
 * que essa notificação chega, mostra logo um pop-up bem visível — não fica à
 * espera que a pessoa abra o sino de notificações.
 */
export function MatchVoteReminderModal() {
  const { userId, isLinked } = useAuth();
  const [, setLocation] = useLocation();
  const [queue, setQueue] = useState<AppNotification[]>([]);
  const shownRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!isLinked || !userId) return;

    // Garante que peladas antigas que terminaram sem gerar notificação (ex:
    // falha pontual de rede) também acabam por aparecer aqui.
    void processPendingNotifications(userId);

    const unsub = subscribeToNotifications(userId, (items) => {
      const pending = items.filter(
        (n) => n.id.startsWith("vote-") && !n.read && !shownRef.current.has(n.id),
      );
      if (pending.length === 0) return;

      pending.forEach((n) => shownRef.current.add(n.id));

      // Confirma que a pelada ainda está mesmo em votação antes de incomodar
      // — se entretanto foi finalizada sem o voto desta pessoa (ou expirou),
      // não faz sentido mostrar um pop-up para uma votação que já fechou.
      void Promise.all(
        pending.map(async (n) => {
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

  function dismiss() {
    setQueue((q) => q.slice(1));
  }

  function handleVoteNow() {
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
            <Trophy className="w-7 h-7 text-amber-300" />
          </div>
          <p className="text-amber-300 text-[10px] font-black uppercase tracking-[0.22em]">
            Pelada terminada
          </p>
          <h2 className="font-display font-black text-white text-2xl mt-1">
            A tua pelada já acabou!
          </h2>
          <p className="text-white/60 text-sm mt-2">
            {current.body || "Falta só a tua nota para fechar a votação."}
          </p>
        </div>

        <div className="px-6 pb-6 space-y-2">
          <JogaButton variant="gold" size="lg" className="w-full gap-2" onClick={handleVoteNow}>
            Votar agora
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
