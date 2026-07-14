import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { addLiveController, removeLiveController } from "@/lib/matchRepository";
import { resolveControllerIds } from "@/lib/liveControllerUtils";
import type { LivePlayer } from "@/lib/preMatchStorage";
import { toast } from "@/hooks/use-toast";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  matchId: string;
  organizerId: string;
  liveControllerIds: string[];
  players: LivePlayer[];
  /** Actualização optimista para UI em tempo real antes do snapshot. */
  onControllersChange?: (nextIds: string[]) => void;
};

export function ManageLiveControllersDialog({
  open,
  onOpenChange,
  matchId,
  organizerId,
  liveControllerIds,
  players,
  onControllersChange,
}: Props) {
  const [busyUid, setBusyUid] = useState<string | null>(null);

  const controllerSet = new Set(resolveControllerIds({ liveControllerIds, organizerId }));
  const rosterWithAccount = players.filter((p) => Boolean(p.userId));
  const sortedPlayers = [
    ...rosterWithAccount.filter((p) => p.userId === organizerId),
    ...rosterWithAccount.filter((p) => p.userId !== organizerId),
  ];

  async function handleToggle(uid: string, nextEnabled: boolean) {
    if (uid === organizerId) return;

    const prevIds = resolveControllerIds({ liveControllerIds, organizerId });
    const optimistic = nextEnabled
      ? [...new Set([...prevIds, uid])]
      : prevIds.filter((id) => id !== uid);
    onControllersChange?.(optimistic);

    setBusyUid(uid);
    try {
      if (nextEnabled) {
        await addLiveController(matchId, uid);
      } else {
        await removeLiveController(matchId, uid, organizerId);
      }
    } catch (err) {
      onControllersChange?.(prevIds);
      console.warn("[ManageLiveControllers] toggle:", err);
      toast({
        title: "Não foi possível actualizar controladores",
        description: err instanceof Error ? err.message : "Tenta novamente.",
        variant: "destructive",
      });
    } finally {
      setBusyUid(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0a0f1a] border-white/10 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display font-black">Gerir controladores</DialogTitle>
          <DialogDescription className="text-white/50">
            Escolhe quem pode registar golos e gerir o jogo ao vivo. O organizador tem sempre controlo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 max-h-72 overflow-y-auto">
          {sortedPlayers.length === 0 ? (
            <p className="text-white/45 text-sm text-center py-4">
              Nenhum jogador com conta no plantel.
            </p>
          ) : (
            sortedPlayers.map((player) => {
              const uid = player.userId!;
              const isOrganizer = uid === organizerId;
              const enabled = controllerSet.has(uid);

              return (
                <div
                  key={uid}
                  className="flex items-center justify-between gap-3 rounded-2xl px-3 py-2.5"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">{player.name}</p>
                    {isOrganizer ? (
                      <p className="text-emerald-400/80 text-xs mt-0.5">
                        Organizador — sempre com controlo
                      </p>
                    ) : (
                      <p className="text-white/35 text-xs mt-0.5">Pode controlar</p>
                    )}
                  </div>

                  <Switch
                    checked={enabled}
                    disabled={isOrganizer || busyUid === uid}
                    onCheckedChange={(checked) => void handleToggle(uid, checked)}
                    aria-label={isOrganizer ? "Organizador" : `Controlador ${player.name}`}
                  />
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
