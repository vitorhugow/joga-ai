import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import { Bell, Check, Loader2, UserPlus, X } from "lucide-react";
import {
  approveJoinRequest,
  loadPendingJoinRequestsForAdmin,
  rejectJoinRequest,
  type AdminJoinRequest,
} from "@/lib/communityRepository";
import { toast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type NotificationsPanelProps = {
  userId?: string | null;
  isLinked: boolean;
};

function formatRequestTime(value?: string) {
  if (!value) return "Agora";
  try {
    return new Date(value).toLocaleString("pt-PT", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "Recente";
  }
}

export function NotificationsBell({ userId, isLinked }: NotificationsPanelProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [requests, setRequests] = useState<AdminJoinRequest[]>([]);
  const [actingOn, setActingOn] = useState<string | null>(null);

  const loadRequests = useCallback(async () => {
    if (!isLinked || !userId) {
      setRequests([]);
      return;
    }

    setLoading(true);
    try {
      const pending = await loadPendingJoinRequestsForAdmin(userId);
      setRequests(pending);
    } finally {
      setLoading(false);
    }
  }, [isLinked, userId]);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  useEffect(() => {
    if (!open) return;
    void loadRequests();
  }, [open, loadRequests]);

  async function handleApprove(request: AdminJoinRequest) {
    const key = `${request.communityId}-${request.userId}`;
    setActingOn(key);
    try {
      await approveJoinRequest(request.communityId, request.userId, request.displayName);
      setRequests((current) =>
        current.filter(
          (item) =>
            !(item.communityId === request.communityId && item.userId === request.userId),
        ),
      );
      toast({
        title: "Pedido aceite",
        description: `${request.displayName} entrou em ${request.communityName}.`,
      });
    } catch (error) {
      console.warn(error);
      toast({
        title: "Não foi possível aceitar",
        description: "Tenta novamente dentro de instantes.",
        variant: "destructive",
      });
    } finally {
      setActingOn(null);
    }
  }

  async function handleReject(request: AdminJoinRequest) {
    const key = `${request.communityId}-${request.userId}`;
    setActingOn(key);
    try {
      await rejectJoinRequest(request.communityId, request.userId);
      setRequests((current) =>
        current.filter(
          (item) =>
            !(item.communityId === request.communityId && item.userId === request.userId),
        ),
      );
      toast({
        title: "Pedido recusado",
        description: `O pedido de ${request.displayName} foi recusado.`,
      });
    } catch (error) {
      console.warn(error);
      toast({
        title: "Não foi possível recusar",
        description: "Tenta novamente dentro de instantes.",
        variant: "destructive",
      });
    } finally {
      setActingOn(null);
    }
  }

  const pendingCount = requests.length;

  return (
    <>
      <button
        type="button"
        className="relative w-9 h-9 rounded-full flex items-center justify-center"
        style={{ background: "rgba(255,255,255,0.1)" }}
        onClick={() => {
          if (!isLinked || !userId) {
            toast({
              title: "Entra na tua conta",
              description: "As notificações de comunidade ficam disponíveis com conta ligada.",
            });
            return;
          }
          setOpen(true);
        }}
        data-testid="button-notifications"
        aria-label="Notificações"
      >
        <Bell className="w-4 h-4 text-white" />
        {pendingCount > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center text-[10px] font-black text-white"
            style={{ background: "#ef4444", border: "2px solid #031408" }}
          >
            {pendingCount > 9 ? "9+" : pendingCount}
          </span>
        )}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-w-md border-white/10 text-white p-0 overflow-hidden"
          style={{ background: "#0f172a" }}
        >
          <DialogHeader className="px-5 pt-5 pb-3 border-b border-white/8">
            <DialogTitle className="font-display font-black text-lg text-white flex items-center gap-2">
              <Bell className="w-5 h-5 text-emerald-400" />
              Notificações
            </DialogTitle>
            <p className="text-sm text-white/45 text-left">
              Pedidos de entrada nas tuas comunidades
            </p>
          </DialogHeader>

          <div className="max-h-[60vh] overflow-y-auto px-4 py-4 space-y-3">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-10 text-white/50">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">A carregar pedidos...</span>
              </div>
            ) : requests.length === 0 ? (
              <div className="text-center py-10 px-4">
                <div
                  className="w-14 h-14 rounded-2xl mx-auto mb-3 flex items-center justify-center"
                  style={{ background: "rgba(255,255,255,0.06)" }}
                >
                  <UserPlus className="w-6 h-6 text-white/30" />
                </div>
                <p className="text-white/70 text-sm font-semibold">Sem pedidos pendentes</p>
                <p className="text-white/35 text-xs mt-1">
                  Quando alguém pedir para entrar numa tua comunidade, aparece aqui.
                </p>
              </div>
            ) : (
              requests.map((request) => {
                const key = `${request.communityId}-${request.userId}`;
                const busy = actingOn === key;

                return (
                  <div
                    key={key}
                    className="rounded-2xl p-4"
                    style={{
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.08)",
                    }}
                    data-testid={`join-request-${request.communityId}-${request.userId}`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-display font-black text-white"
                        style={{ background: "linear-gradient(135deg, #16a34a, #047857)" }}
                      >
                        {request.displayName.slice(0, 1).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-white truncate">
                          {request.displayName}
                        </p>
                        <p className="text-xs text-white/45 mt-0.5">
                          quer entrar em{" "}
                          <Link
                            href={`/comunidades/${request.communityId}`}
                            className="text-emerald-400 font-semibold"
                            onClick={() => setOpen(false)}
                          >
                            {request.communityName}
                          </Link>
                        </p>
                        <p className="text-[10px] text-white/30 mt-1">
                          {formatRequestTime(request.requestedAt)}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 mt-4">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleReject(request)}
                        className="h-10 rounded-xl flex items-center justify-center gap-1.5 text-sm font-bold text-white/70 disabled:opacity-50"
                        style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}
                      >
                        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                        Recusar
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleApprove(request)}
                        className="h-10 rounded-xl flex items-center justify-center gap-1.5 text-sm font-bold text-white disabled:opacity-50"
                        style={{ background: "linear-gradient(135deg, #15803d, #16a34a)" }}
                      >
                        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        Aceitar
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
