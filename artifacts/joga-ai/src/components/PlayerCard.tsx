import "./PlayerCard.css";
import { PlayerAttributes, calculateOverall } from "@/lib/cardUtils";
import { getSkin } from "@/lib/cardSkins";
import { BRAND_ASSETS } from "@/components/brand";
import { CardStatChevrons } from "@/components/CardStatChevrons";

export type CardVariant = "default" | "premium" | "gold" | "platinum" | "diamond" | "elite";
export type CardSize = "small" | "profile" | "large";

interface PlayerCardProps {
  name: string;
  position: string;
  attributes: PlayerAttributes;
  shirtNumber: number;
  title: string;
  variant?: CardVariant;
  size?: CardSize;
  photoUrl?: string;
  flagUrl?: string;
  clubLogoUrl?: string;
  className?: string;
  attributeDeltas?: Partial<PlayerAttributes>;
  /** id da skin (cardSkins.ts) — muda só a moldura, nunca o layout */
  skin?: string;
}

const STAT_ATTR_KEYS: Record<string, keyof PlayerAttributes> = {
  PAC: "ritmo",
  SHO: "finalizacao",
  PAS: "passe",
  DRI: "drible",
  DEF: "defesa",
  PHY: "fisico",
};

function getStats(attrs: PlayerAttributes): [string, number][] {
  return [
    ["PAC", attrs.ritmo],
    ["SHO", attrs.finalizacao],
    ["PAS", attrs.passe],
    ["DRI", attrs.drible],
    ["DEF", attrs.defesa],
    ["PHY", attrs.fisico],
  ];
}

/** Firebase Storage / googleusercontent etc. — same-origin (/... e data:) fica de fora. */
function isExternalImageUrl(url: string | undefined): boolean {
  return typeof url === "string" && /^https?:\/\//.test(url);
}

function PortugalFlagInline() {
  return (
    <div className="joga-new-card-flag" aria-label="Bandeira de Portugal">
      <div className="joga-new-card-flag-green" />
      <div className="joga-new-card-flag-red">
        <span />
      </div>
    </div>
  );
}

export function PlayerCard({
  name,
  position,
  attributes,
  size = "profile",
  photoUrl,
  flagUrl,
  className,
  attributeDeltas,
  skin,
}: PlayerCardProps) {
  const overall = calculateOverall(attributes);
  const stats = getStats(attributes);
  const skinSymbol = skin && skin !== "classica" ? getSkin(skin).symbol : undefined;

  const cardClass = [
    "joga-new-player-card",
    `joga-new-player-card--${size}`,
    skin && skin !== "classica" ? `joga-new-player-card--skin-${skin}` : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={`joga-new-player-card-wrap joga-new-player-card-wrap--${size}`}>
      <div className={cardClass} aria-label={`Carta do jogador ${name}`} data-testid="player-card">
        {skinSymbol && (
          <>
            <span className="joga-new-card-skin-decor joga-new-card-skin-decor--tl" aria-hidden="true">{skinSymbol}</span>
            <span className="joga-new-card-skin-decor joga-new-card-skin-decor--tr" aria-hidden="true">{skinSymbol}</span>
            <span className="joga-new-card-skin-decor joga-new-card-skin-decor--name" aria-hidden="true">{skinSymbol}</span>
            <span className="joga-new-card-skin-decor joga-new-card-skin-decor--bl" aria-hidden="true">{skinSymbol}</span>
            <span className="joga-new-card-skin-decor joga-new-card-skin-decor--br" aria-hidden="true">{skinSymbol}</span>
          </>
        )}
        <div className="joga-new-card-inner">
          <div className="joga-new-card-top-mark">
            <img
              src={BRAND_ASSETS.badge}
              alt=""
              className="joga-new-card-top-mark-img"
              draggable={false}
            />
          </div>

          <div className="joga-new-card-header">
            <aside className="joga-new-card-side">
              <div className="joga-new-card-overall" data-testid="player-overall">
                <strong>{overall}</strong>
                <span>OVR</span>
              </div>

              <div className="joga-new-card-divider" />

              <div className="joga-new-card-position">{position}</div>

              <div className="joga-new-card-divider" />

              {flagUrl ? (
                <img
                  className="joga-new-card-flag"
                  src={flagUrl}
                  alt="Bandeira"
                  crossOrigin={isExternalImageUrl(flagUrl) ? "anonymous" : undefined}
                />
              ) : (
                <PortugalFlagInline />
              )}
            </aside>

            <div className="joga-new-card-photo">
              <img
                src={photoUrl || "/demo-player.svg"}
                alt={name}
                crossOrigin={isExternalImageUrl(photoUrl) ? "anonymous" : undefined}
              />
            </div>
          </div>

          <div className="joga-new-card-brand">
            <img
              src={BRAND_ASSETS.full}
              alt="Joga AI"
              className="joga-new-card-brand-logo"
              draggable={false}
            />
          </div>

          <div className="joga-new-card-name" data-testid="player-name">{name}</div>

          <div className="joga-new-card-name-line" />

          <div className="joga-new-card-stats">
            {stats.map(([label, value]) => {
              const attrKey = STAT_ATTR_KEYS[label];
              const delta = attributeDeltas?.[attrKey!] ?? 0;
              return (
                <div className="joga-new-card-stat" key={label}>
                  <strong className="joga-new-card-stat-value">
                    <span>{value}</span>
                    {delta !== 0 && <CardStatChevrons delta={delta} />}
                  </strong>
                  <span>{label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
