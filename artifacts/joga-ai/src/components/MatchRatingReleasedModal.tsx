import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { ChevronRight, Sparkles, Trophy } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { JogaButton } from "@/components/joga";
import { EvolutionGainsSummary } from "@/components/EvolutionGainsSummary";
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfile } from "@/hooks/useUserProfile";
import { isProActive } from "@/lib/entitlements";
import {
  markNotificationRead,
  processPendingNotifications,
  subscribeToNotifications,
  type AppNotification,
} from "@/lib/notificationsRepository";
import { markPopupNotificationShown } from "@/lib/pushNotifications";
import { loadMatchResult } from "@/lib/matchHistoryRepository";
import { loadEvolutionHistory } from "@/lib/evolutionStorage";
import { formatEvolutionDisplayFromProfile, summarizeGainsForDisplay } from "@/lib/evolutionDisplay";
import { matchSummaryPath } from "@/lib/voteStatusRepository";

type RatingPopupPayload = {
  notification: AppNotification;
  matchId: string;
  rating: number;
  title: string;
};

function isRatingPopupNotification(n: AppNotification): boolean {
  return n.id.startsWith("evo-") && (n.priority === "popup" || n.id.startsWith("evo-"));
}

function ratingCelebrationMessage(rating: number): string {
  if (rating >= 8.5) return "Que exibição!";
  if (rating >= 7) return "Bom jogo!";
  if (rating >= 5.5) return "Boa presença em campo!";
  return "Faz parte — para a próxima!";
}

function parseMatchIdFromEvoNotification(id: string): string {
  return id.replace(/^evo-/, "");
}

/**
 * Popup celebrativo quando as notas da pelada são reveladas.
 * Dispara uma vez por notificação evo-{matchId} (priority popup).
 */
export function MatchRatingReleasedModal() {
  const { userId, isLinked } = useAuth();
  const { profile } = useUserProfile();
  const [, setLocation] = useLocation();
  const [queue, setQueue] = useState<RatingPopupPayload[]>([]);
  const shownRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!isLinked || !userId) return;

    void processPendingNotifications(userId);

    const unsub = subscribeToNotifications(userId, (items) => {
      const pending = items.filter(
        (n) => isRatingPopupNotification(n) && !n.read && !shownRef.current.has(n.id),
      );
      if (pending.length === 0) return;

      pending.forEach((n) => shownRef.current.add(n.id));
      pending.forEach((n) => markPopupNotificationShown(n.id));

      void Promise.all(
        pending.map(async (notification) => {
          const matchId = parseMatchIdFromEvoNotification(notification.id);
          const result = await loadMatchResult(matchId);
          if (!result?.ratingsReleased) return null;

          const playerRating = result.players.find((p) => p.userId === userId)?.rating ?? 0;
          if (playerRating <= 0) return null;

          return {
            notification,
            matchId,
            rating: playerRating,
            title: result.title || notification.body || "Pelada",
          } satisfies RatingPopupPayload;
        }),
      ).then((results) => {
        const valid = results.filter((entry): entry is RatingPopupPayload => entry !== null);
        if (valid.length > 0) setQueue((current) => [...current, ...valid]);
      });
    });

    return unsub;
  }, [isLinked, userId]);

  const current = queue[0] ?? null;

  const evolutionItems = current
    ? (() => {
        const fromProfile = formatEvolutionDisplayFromProfile(profile, current.matchId);
        if (fromProfile.length > 0) return fromProfile;
        const record = loadEvolutionHistory(userId).find((r) => r.matchId === current.matchId);
        if (!record) return [];
        return summarizeGainsForDisplay(record.gains);
      })()
    : [];

  const proNickname = isProActive(profile?.entitlements)
    ? profile?.lastMatchNickname?.label
    : undefined;

  function dismiss() {
    setQueue((q) => q.slice(1));
  }

  function handleAction() {
    if (!current || !userId) return;
    void markNotificationRead(userId, current.notification.id);
    dismiss();
    setLocation(matchSummaryPath(current.matchId, { view: "summary" }));
  }

  function handleLater() {
    if (current && userId) void markNotificationRead(userId, current.notification.id);
    dismiss();
  }

  if (!current) return null;

  return (
    <Dialog open onOpenChange={(open) => !open && handleLater()}>
      <DialogContent
        className="max-w-sm border-amber-400/30 text-white text-center p-0 overflow-hidden z-[60]"
        style={{ background: "#0f172a" }}
      >
        <div
          className="p-6 pb-5"
          style={{ background: "linear-gradient(165deg, rgba(250,204,21,0.22), rgba(16,185,129,0.08), rgba(15,23,42,0))" }}
        >
          <div
            className="w-16 h-16 rounded-2xl mx-auto mb-3 flex items-center justify-center"
            style={{ background: "rgba(250,204,21,0.18)", border: "1px solid rgba(250,204,21,0.35)" }}
          >
            <Trophy className="w-8 h-8 text-amber-300" />
          </div>
          <p className="text-amber-300 text-[10px] font-black uppercase tracking-[0.22em] flex items-center justify-center gap-1">
            <Sparkles className="w-3.5 h-3.5" />
            A tua nota saiu
          </p>
          <div
            className="mt-3 mx-auto w-fit px-5 py-2 rounded-2xl"
            style={{
              background: "rgba(250,204,21,0.12)",
              border: "1px solid rgba(250,204,21,0.35)",
              boxShadow: "0 0 28px rgba(250,204,21,0.2)",
            }}
          >
            <p className="font-display font-black text-amber-200 text-5xl leading-none">
              {current.rating.toFixed(1)}
            </p>
          </div>
          <h2 className="font-display font-black text-white text-2xl mt-3">
            {ratingCelebrationMessage(current.rating)}
          </h2>
          <p className="text-white/55 text-sm mt-2">{current.title}</p>

          {proNickname && (
            <p className="text-emerald-300 text-sm font-bold mt-3">
              Apelido da pelada: <span className="text-white">{proNickname}</span>
            </p>
          )}

          {evolutionItems.length > 0 && (
            <div className="mt-4 text-left">
              <p className="text-emerald-300/80 text-[10px] font-black uppercase tracking-[0.18em] mb-2 text-center">
                Atributos ganhos
              </p>
              <EvolutionGainsSummary items={evolutionItems} />
            </div>
          )}
        </div>

        <div className="px-6 pb-6 space-y-2">
          <JogaButton variant="gold" size="lg" className="w-full gap-2" onClick={handleAction}>
            Ver resumo completo
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
