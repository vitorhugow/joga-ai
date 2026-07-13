import { MapPin, Users } from "lucide-react";
import { Link } from "wouter";
import { FieldCardBackground } from "@/components/FieldCardBackground";
import { getMatchRoutePath, getMatchStatusLabel } from "@/lib/matchRepository";
import { formatMatchPriceChip } from "@/lib/formatMatchPrice";
import { getMatchScheduleLines } from "@/lib/formatMatchSchedule";

interface MatchCardProps {
  id: string;
  title: string;
  proBadge?: boolean;
  paymentsEnabled?: boolean;
  city: string;
  location: string;
  gameType: string;
  fieldType?: string;
  level: string;
  date: string;
  scheduledDate?: string;
  scheduledTime?: string;
  spotsRemaining: string;
  price?: string;
  status?: string;
  returnTo?: string;
}

const gameTypeMeta: Record<string, { label: string; emoji: string; color: string; bg: string }> = {
  futsal: { label: "Futsal", emoji: "🥅", color: "#f472b6", bg: "rgba(244,114,182,0.14)" },
  fut5: { label: "Fut 5", emoji: "5️⃣", color: "#60a5fa", bg: "rgba(96,165,250,0.14)" },
  fut7: { label: "Fut 7", emoji: "7️⃣", color: "#34d399", bg: "rgba(52,211,153,0.14)" },
  futebol11: { label: "Fut 11", emoji: "1️⃣1️⃣", color: "#a78bfa", bg: "rgba(167,139,250,0.14)" },
};

const levelStyle: Record<string, { color: string; label: string; strip: string; emoji: string }> = {
  recreativo: { color: "#4ade80", label: "Recreativo", strip: "#16a34a", emoji: "😊" },
  misto: { color: "#60a5fa", label: "Misto", strip: "#2563eb", emoji: "⚖️" },
  competitivo: { color: "#f87171", label: "Competitivo", strip: "#dc2626", emoji: "🔥" },
};

const ACTIVE_STATUSES = new Set(["ao_vivo", "aguardando_auditoria", "auditada"]);

const statusBadgeStyle: Record<string, { background: string; color: string; emoji: string }> = {
  configurando: { background: "rgba(96,165,250,0.15)", color: "#60a5fa", emoji: "📋" },
  ao_vivo: { background: "rgba(248,113,113,0.15)", color: "#f87171", emoji: "🔴" },
  aguardando_auditoria: { background: "rgba(250,204,21,0.15)", color: "#facc15", emoji: "🗳️" },
  auditada: { background: "rgba(250,204,21,0.15)", color: "#facc15", emoji: "✅" },
};

export function MatchCard({
  id,
  title,
  proBadge,
  paymentsEnabled,
  city,
  location,
  gameType,
  fieldType,
  level,
  date,
  scheduledDate,
  scheduledTime,
  spotsRemaining,
  price,
  status,
  returnTo,
}: MatchCardProps) {
  const isActiveMatch = status ? ACTIVE_STATUSES.has(status) : false;
  const isLotado = spotsRemaining === "Lotado";
  const lvl = levelStyle[level] || { color: "rgba(255,255,255,0.4)", label: level, strip: "#64748b", emoji: "⚽" };
  const game = gameTypeMeta[gameType] || { label: gameType, emoji: "⚽", color: "#94a3b8", bg: "rgba(148,163,184,0.14)" };
  const routePath = getMatchRoutePath(id, status);
  const href = returnTo
    ? `${routePath}?from=${encodeURIComponent(returnTo)}`
    : routePath;
  const statusLabel = getMatchStatusLabel(status);
  const badgeStyle = statusBadgeStyle[status ?? "configurando"] ?? statusBadgeStyle.configurando;
  const priceChip = formatMatchPriceChip(price);
  const schedule = getMatchScheduleLines({ date, scheduledDate, scheduledTime });
  const resolvedFieldType = fieldType ?? gameType;

  return (
    <Link href={href}>
      <div
        className="relative flex items-stretch overflow-hidden rounded-2xl joga-tap"
        style={{
          background: "linear-gradient(135deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.03) 100%)",
          border: paymentsEnabled
            ? "1px solid rgba(251,191,36,0.22)"
            : "1px solid rgba(255,255,255,0.08)",
          boxShadow: paymentsEnabled
            ? "0 4px 20px rgba(251,191,36,0.08), 0 2px 12px rgba(0,0,0,0.25)"
            : "0 2px 12px rgba(0,0,0,0.25)",
        }}
        data-testid={`match-card-${id}`}
      >
        <FieldCardBackground fieldType={resolvedFieldType} />

        <div
          className="relative z-10 w-1.5 shrink-0 self-stretch"
          style={{ background: lvl.strip, borderRadius: "0 4px 4px 0" }}
        />

        <div className="relative z-10 flex-1 px-4 py-3.5 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-2">
            <h3 className="font-display font-bold text-white text-base leading-tight">
              {title}
              {proBadge && (
                <span
                  className="ml-1.5 align-middle inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide"
                  style={{ background: "rgba(251,191,36,0.14)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.35)" }}
                >
                  ✦ Clube PRO
                </span>
              )}
            </h3>
            {status && (
              <span
                className="text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0"
                style={{ background: badgeStyle.background, color: badgeStyle.color }}
              >
                {badgeStyle.emoji} {statusLabel}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 text-xs mb-2 font-bold text-white">
            <MapPin className="w-3 h-3 shrink-0" style={{ color: "#f87171" }} />
            <span className="truncate">📍 {location}, {city}</span>
          </div>

          <div className="text-xs mb-0.5 font-bold text-white">
            📅 {schedule.dateLine}
          </div>
          {schedule.timeLine && (
            <div className="text-xs mb-3 font-bold text-white/90">
              🕐 {schedule.timeLine}
            </div>
          )}
          {!schedule.timeLine && <div className="mb-3" />}

          <div className="flex flex-wrap gap-1.5 mb-3">
            <span
              className="text-[10px] font-bold px-2 py-1 rounded-lg"
              style={{ background: game.bg, color: game.color }}
            >
              {game.emoji} {game.label}
            </span>
            <span
              className="text-[10px] font-bold px-2 py-1 rounded-lg"
              style={{ background: `${lvl.color}18`, color: lvl.color }}
            >
              {lvl.emoji} {lvl.label}
            </span>
            {priceChip && (
              <span
                className="text-[10px] font-bold px-2 py-1 rounded-lg"
                style={{ background: "rgba(251,191,36,0.12)", color: "#fbbf24" }}
              >
                {priceChip}
              </span>
            )}
            {paymentsEnabled && (
              <span
                className="text-[10px] font-bold px-2 py-1 rounded-lg"
                style={{ background: "rgba(16,185,129,0.14)", color: "#34d399", border: "1px solid rgba(16,185,129,0.28)" }}
                data-testid={`match-payment-online-${id}`}
              >
                💳 Pagamento Online
              </span>
            )}
          </div>

          <div className="flex items-center justify-end">
            {isActiveMatch ? (
              <div
                className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full shrink-0"
                style={{ background: badgeStyle.background, color: badgeStyle.color }}
                data-testid={`match-spots-${id}`}
              >
                {status === "ao_vivo" ? "🔴 Em curso" : "🗳️ A votar"}
              </div>
            ) : (
              <div
                className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full shrink-0"
                style={isLotado
                  ? { background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.25)" }
                  : { background: "rgba(74,222,128,0.12)", color: "#4ade80" }
                }
                data-testid={`match-spots-${id}`}
              >
                <Users className="w-3 h-3" />
                {isLotado ? "🚫 Lotado" : `👥 ${spotsRemaining}`}
              </div>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
