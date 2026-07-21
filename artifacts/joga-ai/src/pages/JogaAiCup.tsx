import { useEffect, useState } from "react";
import { JogaPage } from "@/components/joga";
import { CupRegistrationSteps, CupCounter } from "@/components/joga";
import {
  loadActiveTournamentConfig,
  subscribeTournament,
  subscribeTournamentTeams,
  type Tournament,
  type TournamentTeam,
} from "@/lib/tournamentRepository";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

const PITCH_BG = `url("data:image/svg+xml,%3Csvg width='80' height='80' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 40 L80 40' stroke='rgba(255,255,255,0.04)' stroke-width='1'/%3E%3Ccircle cx='40' cy='40' r='20' stroke='rgba(255,255,255,0.03)' stroke-width='1' fill='none'/%3E%3C/svg%3E")`;

const FALLBACK_DESCRIPTION =
  "A primeira edição da Joga Aí Cup reúne comunidades num só campeonato — monta o teu clube, joga a sério, e vê a tua carta evoluir a cada jogo.";

const FALLBACK_RULES = [
  "Formato: fase de grupos + mata-mata.",
  "Máximo de 8 clubes inscritos.",
  "Inscrição por clube.",
  "Prazo de inscrição: a anunciar.",
];

export default function JogaAiCup() {
  const [tournamentId, setTournamentId] = useState<string | null>(null);
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [teams, setTeams] = useState<TournamentTeam[]>([]);
  const [loadedConfig, setLoadedConfig] = useState(false);

  useDocumentTitle(tournament?.name ?? "Joga Aí Cup");

  useEffect(() => {
    let cancelled = false;
    void loadActiveTournamentConfig().then((config) => {
      if (cancelled) return;
      setTournamentId(config?.tournamentId ?? null);
      setLoadedConfig(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!tournamentId) return;
    const unsubTournament = subscribeTournament(tournamentId, setTournament);
    const unsubTeams = subscribeTournamentTeams(tournamentId, setTeams);
    return () => {
      unsubTournament();
      unsubTeams();
    };
  }, [tournamentId]);

  if (loadedConfig && !tournamentId) {
    return (
      <JogaPage theme="dark" className="py-16 text-center">
        <p className="text-white/50">Ainda não há nenhum torneio ativo.</p>
      </JogaPage>
    );
  }

  if (!tournament) {
    return (
      <JogaPage theme="dark" className="py-16 text-center">
        <p className="text-white/50">A carregar…</p>
      </JogaPage>
    );
  }

  const heroDescription = tournament.landing?.heroDescription || FALLBACK_DESCRIPTION;
  const rules = tournament.landing?.rules?.length ? tournament.landing.rules : FALLBACK_RULES;
  const maxTimes = tournament.registration?.maxTimes ?? 8;
  const registrationOpen = tournament.registration?.aberta ?? false;

  return (
    <JogaPage theme="dark" padded={false}>
      <div
        className="relative overflow-hidden px-5 pt-6 pb-8"
        style={{ background: "linear-gradient(155deg, #050b06 0%, #081a0c 30%, #0c2814 68%, #0f3018 100%)" }}
      >
        <img
          src="/home/hero-ball.webp"
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          className="absolute inset-0 w-full h-full object-cover"
          style={{ objectPosition: "center 35%" }}
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(5,11,6,.55) 0%, rgba(8,22,12,.5) 32%, rgba(9,20,11,.72) 72%, #0a0f0d 100%)",
          }}
        />
        <div
          className="absolute inset-0"
          style={{ background: "radial-gradient(120% 80% at 50% 0%, rgba(24,184,94,.2), transparent 60%)" }}
        />
        <div className="absolute inset-0" style={{ backgroundImage: PITCH_BG, backgroundSize: "80px 80px" }} />

        <div className="relative">
          <p
            className="text-[10.5px] font-black uppercase tracking-[0.2em]"
            style={{ color: "#e6c15c" }}
          >
            1ª EDIÇÃO
          </p>
          <h1
            className="font-black uppercase leading-[0.92] text-[46px] tracking-tight mt-2"
            style={{ color: "#f1d477", textShadow: "0 2px 5px rgba(0,0,0,.75), 0 1px 1px rgba(0,0,0,.6)" }}
          >
            {tournament.name}
          </h1>
          <div className="flex items-center gap-2.5 mt-3">
            <span className="h-px w-6" style={{ background: "linear-gradient(90deg,#12d16a,transparent)" }} />
            <span className="text-[17px] font-bold" style={{ color: "#eaf3ed" }}>
              Edição <b style={{ color: "#12d16a" }}>{tournament.edition || "Entre Igrejas"}</b>
            </span>
          </div>
          <p className="mt-3.5 text-sm leading-relaxed max-w-[36ch]" style={{ color: "#cfdad4" }}>
            {heroDescription}
          </p>
          {registrationOpen && (
            <div
              className="inline-flex items-center gap-1.5 mt-4 px-3.5 py-2 rounded-full text-xs font-semibold"
              style={{ background: "rgba(24,184,94,.14)", border: "1px solid rgba(24,184,94,.4)", color: "#84f0b8" }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Inscrições abertas
            </div>
          )}
        </div>
      </div>

      <div className="px-4 pt-5 space-y-3.5">
        <CupRegistrationSteps />

        <section
          className="rounded-2xl p-[18px]"
          style={{ background: "#0e1512", border: "1px solid #1b2520" }}
        >
          <p className="text-white/40 text-[10px] font-black uppercase tracking-[0.14em] mb-1">Como funciona</p>
          <h3 className="text-white text-xl font-black tracking-tight">Regras</h3>
          <ul className="grid gap-2.5 mt-3.5">
            {rules.map((rule, i) => (
              <li key={i} className="flex gap-2.5 items-start text-sm leading-snug" style={{ color: "#cfdad4" }}>
                <span
                  className="shrink-0 w-[22px] h-[22px] rounded-md flex items-center justify-center text-[11px] mt-0.5"
                  style={{ background: "rgba(24,184,94,.12)", color: "#12d16a" }}
                >
                  ◆
                </span>
                <span>{rule}</span>
              </li>
            ))}
          </ul>
        </section>

        <CupCounter current={teams.length} max={maxTimes} />
      </div>
    </JogaPage>
  );
}
