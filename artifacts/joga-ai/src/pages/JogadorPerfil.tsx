import { useEffect, useState } from "react";
import { Link, useRoute } from "wouter";
import { ChevronLeft } from "lucide-react";
import { PlayerCard } from "@/components/PlayerCard";
import { JogaCard, JogaPage } from "@/components/joga";
import { loadPublicPlayerProfile } from "@/lib/userRepository";
import { calculateOverall } from "@/lib/cardUtils";
import { imageDisplaySrc } from "@/lib/imageUtils";
import { badgesFromIds } from "@/lib/badgeCatalog";

export default function JogadorPerfil() {
  const [, params] = useRoute("/jogador/:id");
  const playerId = params?.id ?? "";
  const returnTo =
    new URLSearchParams(typeof window !== "undefined" ? window.location.search : "").get("from") ||
    "/comunidades";

  const [profile, setProfile] = useState<Awaited<ReturnType<typeof loadPublicPlayerProfile>>>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!playerId) return;
    setLoading(true);
    void loadPublicPlayerProfile(playerId).then((p) => {
      setProfile(p);
      setLoading(false);
    });
  }, [playerId]);

  if (loading) {
    return (
      <JogaPage theme="dark" className="py-10 text-center">
        <p className="text-white/50">A carregar perfil…</p>
      </JogaPage>
    );
  }

  if (!profile) {
    return (
      <JogaPage theme="dark" className="py-10 text-center px-4">
        <p className="text-white/50">Perfil não encontrado ou privado.</p>
        <Link href={returnTo} className="text-emerald-400 text-sm mt-4 inline-block">
          Voltar
        </Link>
      </JogaPage>
    );
  }

  const overall = calculateOverall(profile.attributes);
  const badges = badgesFromIds(profile.badges ?? []);

  return (
    <JogaPage theme="dark" padded={false} className="pb-28">
      <div className="relative overflow-hidden joga-hero-arena">
        <div className="absolute bottom-0 left-0 right-0 h-8" style={{ background: "linear-gradient(to top, #0a0f1a, transparent)" }} />
        <div className="relative px-4 pt-5 pb-6">
          <Link href={returnTo} className="joga-tap inline-flex items-center gap-1 text-white/50 text-sm mb-4">
            <ChevronLeft className="w-4 h-4" />
            Voltar
          </Link>

          <div className="flex flex-col items-center">
            <div className="w-full max-w-[min(92vw,390px)]">
              <PlayerCard
                name={profile.displayName}
                position={profile.position}
                attributes={profile.attributes}
                shirtNumber={profile.shirtNumber}
                title={profile.title}
                photoUrl={imageDisplaySrc(profile.photoUrl)}
                size="profile"
              />
            </div>

            <div className="mt-5 w-full max-w-md text-center">
              <h1 className="font-display font-black text-white text-2xl">{profile.displayName}</h1>
              <p className="text-emerald-300/80 text-sm mt-1">{profile.title} · {profile.position}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 pt-5 space-y-4">
        <JogaCard variant="arena" padding="md">
          <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest mb-3">Estatísticas</p>
          <div className="grid grid-cols-2 gap-3">
            {[
              { v: overall, l: "Overall", c: "#fbbf24" },
              { v: profile.seasonStats.matches, l: "Jogos", c: "#60a5fa" },
              { v: profile.seasonStats.goals, l: "Golos", c: "#4ade80" },
              { v: profile.seasonStats.assists, l: "Assist.", c: "#fb923c" },
            ].map((s) => (
              <div
                key={s.l}
                className="rounded-xl px-3 py-2 border border-white/8"
                style={{ background: "rgba(255,255,255,0.04)" }}
              >
                <p className="font-display font-black text-2xl leading-none" style={{ color: s.c }}>
                  {s.v}
                </p>
                <p className="text-[10px] font-bold mt-0.5 uppercase text-white/40">{s.l}</p>
              </div>
            ))}
          </div>
        </JogaCard>

        {badges.length > 0 && (
          <JogaCard variant="arena" padding="md">
            <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest mb-3">Distintivos</p>
            <div className="flex flex-wrap gap-2">
              {badges.map((b) => (
                <span
                  key={b.id}
                  className="text-xs font-bold px-2.5 py-1 rounded-full bg-white/6 border border-white/10 text-white/80"
                >
                  {b.icon} {b.name}
                </span>
              ))}
            </div>
          </JogaCard>
        )}
      </div>
    </JogaPage>
  );
}
