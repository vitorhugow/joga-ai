import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import { Bell, Check, CheckCheck, Loader2, UserPlus, X } from "lucide-react";
import {
  approveJoinRequest,
  loadPendingJoinRequestsForAdmin,
  rejectJoinRequest,
  type AdminJoinRequest,
} from "@/lib/communityRepository";
import {
  loadNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  processPendingNotifications,
  subscribeToNotifications,
  type AppNotification,
} from "@/lib/notificationsRepository";
import { toast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthGate } from "@/contexts/AuthGateContext";

type NotificationsBellProps = {
  userId?: string | null;
  isLinked?: boolean;
  className?: string;
  iconClassName?: string;
};

type InboxTab = "para-ti" | "pedidos";

function formatTime(value?: string) {
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

export function NotificationsBell({
  userId: userIdProp,
  isLinked: isLinkedProp,
  className = "",
  iconClassName = "w-4 h-4 text-white",
}: NotificationsBellProps) {
  const auth = useAuth();
  const { requireLinked } = useAuthGate();
  const userId = userIdProp ?? auth.userId;
  const isLinked = isLinkedProp ?? auth.isLinked;

  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<InboxTab>("para-ti");
  const [loading, setLoading] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [requests, setRequests] = useState<AdminJoinRequest[]>([]);
  const [actingOn, setActingOn] = useState<string | null>(null);

  const loadRequests = useCallback(async () => {
    if (!isLinked || !userId) {
      setRequests([]);
      return;
    }

    try {
      const pending = await loadPendingJoinRequestsForAdmin(userId);
      setRequests(pending);
    } catch {
      setRequests([]);
    }
  }, [isLinked, userId]);

  useEffect(() => {
    if (!isLinked || !userId) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    void processPendingNotifications(userId);
    const unsub = subscribeToNotifications(userId, (items, unread) => {
      setNotifications(items);
      setUnreadCount(unread);
    });
    return unsub;
  }, [isLinked, userId]);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  useEffect(() => {
    if (!open || !isLinked || !userId) return;

    setLoading(true);
    const timeout = window.setTimeout(() => setLoading(false), 12_000);

    void Promise.all([loadNotifications(userId), loadRequests(), processPendingNotifications(userId)])
      .then(([items]) => setNotifications(items))
      .finally(() => {
        window.clearTimeout(timeout);
        setLoading(false);
      });

    return () => window.clearTimeout(timeout);
  }, [open, isLinked, userId, loadRequests]);

  function handleOpen() {
    if (!requireLinked({ mode: "register", title: "Cria conta para ver notificações" })) {
      return;
    }
    setOpen(true);
  }

  async function handleMarkRead(notif: AppNotification) {
    if (!userId || notif.read) return;
    await markNotificationRead(userId, notif.id);
    setNotifications((current) =>
      current.map((n) => (n.id === notif.id ? { ...n, read: true } : n)),
    );
    setUnreadCount((c) => Math.max(0, c - 1));
  }

  async function handleMarkAllRead() {
    if (!userId) return;
    await markAllNotificationsRead(userId);
    setNotifications((current) => current.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
  }

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

  const badgeCount = unreadCount + requests.length;

  return (
    <>
      <button
        type="button"
        className={`relative w-9 h-9 rounded-full flex items-center justify-center ${className}`}
        style={{ background: className ? undefined : "rgba(255,255,255,0.1)" }}
        onClick={handleOpen}
        data-testid="button-notifications"
        aria-label="Notificações"
      >
        <Bell className={iconClassName} />
        {badgeCount > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center text-[10px] font-black text-white"
            style={{ background: "#ef4444", border: className ? "2px solid white" : "2px solid #031408" }}
          >
            {badgeCount > 9 ? "9+" : badgeCount}
          </span>
        )}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-w-md border-white/10 text-white p-0 overflow-hidden"
          style={{ background: "#0f172a" }}
        >
          <DialogHeader className="px-5 pt-5 pb-3 border-b border-white/8">
            <div className="flex items-center justify-between gap-2">
              <DialogTitle className="font-display font-black text-lg text-white flex items-center gap-2">
                <Bell className="w-5 h-5 text-emerald-400" />
                Notificações
              </DialogTitle>
              {unreadCount > 0 && tab === "para-ti" && (
                <button
                  type="button"
                  onClick={() => void handleMarkAllRead()}
                  className="text-xs font-bold text-emerald-400 flex items-center gap-1"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  Marcar lidas
                </button>
              )}
            </div>
            <div className="flex gap-2 mt-3">
              {([
                { key: "para-ti" as const, label: "Para ti", count: unreadCount },
                { key: "pedidos" as const, label: "Pedidos", count: requests.length },
              ]).map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setTab(item.key)}
                  className="flex-1 py-2 rounded-xl text-xs font-bold transition-colors"
                  style={
                    tab === item.key
                      ? { background: "rgba(74,222,128,0.15)", color: "#4ade80", border: "1px solid rgba(74,222,128,0.3)" }
                      : { background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.5)", border: "1px solid rgba(255,255,255,0.08)" }
                  }
                >
                  {item.label}
                  {item.count > 0 ? ` (${item.count})` : ""}
                </button>
              ))}
            </div>
          </DialogHeader>

          <div className="max-h-[60vh] overflow-y-auto px-4 py-4 space-y-3">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-10 text-white/50">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">A carregar…</span>
              </div>
            ) : tab === "para-ti" ? (
              notifications.length === 0 ? (
                <div className="text-center py-10 px-4">
                  <div
                    className="w-14 h-14 rounded-2xl mx-auto mb-3 flex items-center justify-center"
                    style={{ background: "rgba(255,255,255,0.06)" }}
                  >
                    <Bell className="w-6 h-6 text-white/30" />
                  </div>
                  <p className="text-white/70 text-sm font-semibold">Sem notificações</p>
                  <p className="text-white/35 text-xs mt-1">
                    Avisos de peladas, notas e comunidades aparecem aqui.
                  </p>
                </div>
              ) : (
                notifications.map((notif) => (
                  <div
                    key={notif.id}
                    className="rounded-2xl p-4"
                    style={{
                      background: notif.read ? "rgba(255,255,255,0.03)" : "rgba(74,222,128,0.08)",
                      border: `1px solid ${notif.read ? "rgba(255,255,255,0.06)" : "rgba(74,222,128,0.2)"}`,
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white">{notif.title}</p>
                        <p className="text-xs text-white/50 mt-1">{notif.body}</p>
                        <p className="text-[10px] text-white/30 mt-1">{formatTime(notif.createdAt)}</p>
                      </div>
                      {!notif.read && (
                        <button
                          type="button"
                          onClick={() => void handleMarkRead(notif)}
                          className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
                          style={{ background: "rgba(255,255,255,0.06)" }}
                          aria-label="Marcar como lida"
                        >
                          <Check className="w-4 h-4 text-white/50" />
                        </button>
                      )}
                    </div>
                    {notif.link && (
                      <Link
                        href={notif.link}
                        className="inline-block mt-3 text-xs font-bold text-emerald-400"
                        onClick={() => {
                          void handleMarkRead(notif);
                          setOpen(false);
                        }}
                      >
                        Ver →
                      </Link>
                    )}
                  </div>
                ))
              )
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
                          {formatTime(request.requestedAt)}
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
