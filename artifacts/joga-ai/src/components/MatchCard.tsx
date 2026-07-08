import { MapPin, Clock, Users } from "lucide-react";
import { Link } from "wouter";
import { getMatchRoutePath, getMatchStatusLabel } from "@/lib/matchRepository";

interface MatchCardProps {
  id: string;
  title: string;
  proBadge?: boolean;
  city: string;
  location: string;
  gameType: string;
  level: string;
  date: string;
  spotsRemaining: string;
  price?: string;
  status?: string;
  returnTo?: string;
}

const gameTypeLabel: Record<string, string> = {
  futsal: "Futsal", fut5: "Fut 5", fut7: "Fut 7", futebol11: "Fut 11",
};

const levelStyle: Record<string, { color: string; label: string; strip: string }> = {
  recreativo:  { color: "#4ade80", label: "Recreativo",  strip: "#16a34a" },
  misto:       { color: "#60a5fa", label: "Misto",       strip: "#2563eb" },
  competitivo: { color: "#f87171", label: "Competitivo", strip: "#dc2626" },
};

const ACTIVE_STATUSES = new Set(["ao_vivo", "aguardando_auditoria", "auditada"]);

const statusBadgeStyle: Record<string, { background: string; color: string }> = {
  configurando: { background: "rgba(96,165,250,0.15)", color: "#60a5fa" },
  ao_vivo: { background: "rgba(248,113,113,0.15)", color: "#f87171" },
  aguardando_auditoria: { background: "rgba(250,204,21,0.15)", color: "#facc15" },
  auditada: { background: "rgba(250,204,21,0.15)", color: "#facc15" },
};

export function MatchCard({
  id,
  title,
  proBadge,
  city,
  location,
  gameType,
  level,
  date,
  spotsRemaining,
  price,
  status,
  returnTo,
}: MatchCardProps) {
  const isActiveMatch = status ? ACTIVE_STATUSES.has(status) : false;
  const isLotado = spotsRemaining === "Lotado";
  const lvl = levelStyle[level] || { color: "rgba(255,255,255,0.4)", label: level, strip: "#64748b" };
  const routePath = getMatchRoutePath(id, status);
  const href = returnTo
    ? `${routePath}?from=${encodeURIComponent(returnTo)}`
    : routePath;
  const statusLabel = getMatchStatusLabel(status);
  const badgeStyle = statusBadgeStyle[status ?? "configurando"] ?? statusBadgeStyle.configurando;

  return (
    <Link href={href}>
      <div
        className="flex overflow-hidden rounded-2xl joga-tap"
        style={{
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 2px 12px rgba(0,0,0,0.25)",
        }}
        data-testid={`match-card-${id}`}
      >
        {/* Left accent strip */}
        <div className="w-1 shrink-0" style={{ background: lvl.strip, borderRadius: "0 4px 4px 0" }} />

        {/* Content */}
        <div className="flex-1 px-4 py-3.5">
          <div className="flex items-start justify-between gap-2 mb-2.5">
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
            <div className="flex flex-col items-end gap-1 shrink-0">
              {status && (
                <span
                  className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                  style={badgeStyle}
                >
                  {statusLabel}
                </span>
              )}
              <span
                className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.6)" }}
              >
                {gameTypeLabel[gameType] || gameType}
              </span>
              <span
                className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: `${lvl.color}18`, color: lvl.color }}
              >
                {lvl.label}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-xs mb-3" style={{ color: "rgba(255,255,255,0.35)" }}>
            <MapPin className="w-3 h-3 shrink-0" />
            <span className="truncate">{location}, {city}</span>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>
              <div className="flex items-center gap-1.5">
                <Clock className="w-3 h-3" />
                <span>{date}</span>
              </div>
              {price && (
                <span style={{ color: "rgba(255,255,255,0.45)", fontWeight: 600 }}>{price}/jogador</span>
              )}
            </div>
            {isActiveMatch ? (
              <div
                className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full shrink-0"
                style={{ background: badgeStyle.background, color: badgeStyle.color }}
                data-testid={`match-spots-${id}`}
              >
                {status === "ao_vivo" ? "Em curso" : "A votar"}
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
                {spotsRemaining}
              </div>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
