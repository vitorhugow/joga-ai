import { Instagram, MessageCircle } from "lucide-react";
import { JogaCard } from "@/components/joga";
import {
  formatInstagramDisplay,
  formatWhatsappDisplay,
  getInstagramUrl,
  getWhatsappUrl,
  getVisibleSocialLinks,
  type UserProfile,
} from "@/lib/userRepository";

type ProfileSocialLinksProps = {
  profile: UserProfile;
};

export function ProfileSocialLinks({ profile }: ProfileSocialLinksProps) {
  const links = getVisibleSocialLinks(profile);
  if (!links) return null;

  return (
    <JogaCard variant="arena" className="space-y-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">
        Redes sociais
      </p>
      <div className="flex flex-col gap-2">
        {links.instagram && (
          <a
            href={getInstagramUrl(links.instagram)}
            target="_blank"
            rel="noopener noreferrer"
            className="joga-tap flex items-center gap-3 rounded-xl px-3 py-2.5 border border-white/8"
            style={{ background: "rgba(255,255,255,0.04)" }}
            data-testid="link-profile-instagram"
          >
            <span
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{
                background: "linear-gradient(135deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)",
              }}
            >
              <Instagram className="w-4 h-4 text-white" />
            </span>
            <span className="text-white/85 text-sm font-semibold truncate">
              {formatInstagramDisplay(links.instagram)}
            </span>
          </a>
        )}
        {links.whatsapp && (
          <a
            href={getWhatsappUrl(links.whatsapp)}
            target="_blank"
            rel="noopener noreferrer"
            className="joga-tap flex items-center gap-3 rounded-xl px-3 py-2.5 border border-white/8"
            style={{ background: "rgba(255,255,255,0.04)" }}
            data-testid="link-profile-whatsapp"
          >
            <span
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: "rgba(37,211,102,0.2)", border: "1px solid rgba(37,211,102,0.35)" }}
            >
              <MessageCircle className="w-4 h-4 text-emerald-400" />
            </span>
            <span className="text-white/85 text-sm font-semibold truncate">
              {formatWhatsappDisplay(links.whatsapp)}
            </span>
          </a>
        )}
      </div>
    </JogaCard>
  );
}
