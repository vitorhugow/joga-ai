import { useCallback, useEffect, useState, type MouseEvent } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { ChevronRight, X, Check, ArrowRight, ZoomIn } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { LoginPanel } from "@/components/auth/LoginPanel";
import { PlayerCard } from "@/components/PlayerCard";
import { JogaLogo } from "@/components/brand";
import { JogaButton, JogaPage } from "@/components/joga";
import { fadeUp } from "@/components/joga/motion";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

const GENERIC_PLAYER_PHOTO = "/landing/player-generic.png";

const HERO_PLAYER = {
  name: "O TEU NOME",
  position: "MC",
  shirtNumber: 10,
  title: "Promessa",
  attributes: {
    ritmo: 82,
    finalizacao: 78,
    passe: 85,
    drible: 80,
    defesa: 62,
    fisico: 76,
  },
};

const STATS = [
  { value: "Carta", label: "Evolui a cada pelada" },
  { value: "Ao vivo", label: "Golos e stats em tempo real" },
  { value: "Comunidade", label: "A tua malta num só sítio" },
];

const HERO_BULLETS = [
  "Sorteio de equipas sem confusão",
  "Golos e assistências ao vivo",
  "Pagamentos e presenças sob controlo",
  "Ranking, carta e evolução de jogador",
];

const PITCH_SVG = `url("data:image/svg+xml,%3Csvg width='80' height='80' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 40 L80 40' stroke='rgba(255,255,255,0.04)' stroke-width='1'/%3E%3Ccircle cx='40' cy='40' r='20' stroke='rgba(255,255,255,0.03)' stroke-width='1' fill='none'/%3E%3C/svg%3E")`;

type FeatureSectionData = {
  id: string;
  tag: string;
  title: string;
  intro: string;
  description: string;
  before: string[];
  after: string[];
  screenshot: {
    src: string;
    alt: string;
    label: string;
    maxWidth?: string;
  };
  reverse?: boolean;
};

const FEATURE_SECTIONS: FeatureSectionData[] = [
  {
    id: "problema",
    tag: "O problema",
    title: "Chega de lista perdida no WhatsApp.",
    intro:
      "Quem pagou, quem jogou, quem marcou, quem evoluiu — cada jogo conta, mas sem registo vira discussão.",
    description:
      "Antes do jogo começa o caos: mensagens a acumular-se, nomes a faltar, equipas desequilibradas e ninguém com a visão completa. O Pré-Jogo do Joga AI centraliza jogadores confirmados, campo, horário e sorteio — para o organizador arrancar a pelada com tudo sob controlo, sem folhas perdidas no grupo.",
    before: [
      "Listas de presença espalhadas por mensagens",
      "Sorteio manual que ninguém confia",
      "Jogadores a confirmar e desistir sem registo",
      "Organizador a perder tempo a remendar equipas",
    ],
    after: [
      "Lista de confirmados num só ecrã",
      "Sorteio automático e equilibrado",
      "Campo, hora e regras definidos antes de jogar",
      "Equipas prontas em minutos",
    ],
    screenshot: {
      src: "/screenshots/02-pre-jogo.png",
      alt: "Pré-Jogo — equipas e campo",
      label: "Pré-Jogo",
      maxWidth: "200px",
    },
  },
  {
    id: "pagamentos",
    tag: "Pagamentos",
    title: "Quem pagou. Quem deve. Sem discussão.",
    intro: "O organizador controla mensalidades, jogos avulsos e pendentes — sem folha Excel nem áudio de 3 minutos.",
    description:
      "Na secção de Pagamentos vês de imediato quem está em dia, quem falta pagar e quanto falta receber da pelada. Marca pagos com um toque, filtra pendentes e partilha o estado com a malta. Acabou o 'acho que já paguei' no dia do jogo.",
    before: [
      "Transferências sem confirmação",
      "Ninguém sabe o total em falta",
      "Organizador a cobrar no WhatsApp",
      "Discussão sobre quem jogou sem pagar",
    ],
    after: [
      "Lista clara de pagos e pendentes",
      "Total em falta sempre visível",
      "Marcação rápida de pagamento",
      "Histórico por jogador e por jogo",
    ],
    screenshot: {
      src: "/screenshots/07-pendentes.png",
      alt: "Controlo de pagamentos",
      label: "Pagamentos",
    },
    reverse: true,
  },
  {
    id: "ao-vivo",
    tag: "Ao vivo",
    title: "Golos, assistências e eventos em tempo real.",
    intro: "Enquanto a pelada decorre, o organizador regista tudo no ecrã Ao Vivo — como um relato oficial do jogo.",
    description:
      "Cronómetro, marcador, golos, assistências, defesas, cartões e substituições ficam registados segundo a segundo. Cada jogador acumula stats na partida e a malta acompanha o jogo com dados reais, não com memória falhada depois do duche.",
    before: [
      "Golos contados de cabeça no final",
      "Ninguém lembra quem assistiu",
      "Discussão sobre o resultado correcto",
      "MVP escolhido por intuição",
    ],
    after: [
      "Marcador actualizado ao vivo",
      "Golos e assistências por jogador",
      "Eventos importantes guardados",
      "Base fiável para o pós-jogo",
    ],
    screenshot: {
      src: "/screenshots/03-ao-vivo.png",
      alt: "Registo de golos ao vivo",
      label: "Ao Vivo",
    },
  },
  {
    id: "perfil",
    tag: "Perfil",
    title: "A tua carta não é enfeite. É o teu histórico.",
    intro: "Overall, posição, atributos e foto — a carta que mostras à malta e que evolui com cada pelada.",
    description:
      "O Perfil é a tua identidade no Joga AI: carta personalizada com stats reais, título conquistado, jogos disputados, golos e assistências da época. É o cartão de visita do jogador e o espelho da tua evolução ao longo da temporada.",
    before: [
      "Sem registo do teu desempenho",
      "Stats inventadas ou esquecidas",
      "Nada que prove como jogas",
      "Zero orgulho de mostrar histórico",
    ],
    after: [
      "Carta com overall e atributos",
      "Foto e posição personalizadas",
      "Resumo de golos, jogos e assistências",
      "Histórico que evolui a sério",
    ],
    screenshot: {
      src: "/screenshots/04-perfil.png",
      alt: "Carta do jogador no perfil",
      label: "Perfil",
    },
    reverse: true,
  },
  {
    id: "evolucao",
    tag: "Pós-jogo",
    title: "Todos votam. A carta evolui.",
    intro: "Depois da pelada, auditoria e confirmação garantem que só sobem atributos merecidos.",
    description:
      "No Pós-Jogo a malta revê o que aconteceu, confirma golos e assistências, vota desempenho e valida a evolução. Os atributos da tua carta sobem (ou descem) com base em dados acordados — como no Ultimate Team, mas com a tua pelada real por trás.",
    before: [
      "Stats inventadas no dia seguinte",
      "Ninguém confirma o que aconteceu",
      "Evolução injusta ou inexistente",
      "Jogadores desmotivados sem progresso",
    ],
    after: [
      "Auditoria com vários confirmadores",
      "Votação de desempenho na pelada",
      "Atributos actualizados na carta",
      "Motivação para voltar a jogar",
    ],
    screenshot: {
      src: "/screenshots/05-evolucao.png",
      alt: "Evolução de atributos após o jogo",
      label: "Pós-jogo",
    },
  },
  {
    id: "ranking",
    tag: "Ranking",
    title: "Quem manda no bairro? Os números respondem.",
    intro: "Rankings por overall, golos, assistências e notas — sem discussão no café.",
    description:
      "O ecrã inicial e os rankings da comunidade mostram quem lidera em cada métrica. Compara-te com a malta, vê a tua posição e usa os dados para rivalidades saudáveis. Cada jogo conta para subires — ou para calar os críticos.",
    before: [
      "Discussão sobre o melhor jogador",
      "Rankings inventados",
      "Sem histórico comparável",
      "MVP sempre polémico",
    ],
    after: [
      "Leaderboard por métrica real",
      "Posição actualizada após cada jogo",
      "Comparação justa entre jogadores",
      "MVP apoiado em dados",
    ],
    screenshot: {
      src: "/screenshots/04-perfil.png",
      alt: "Carta do jogador no perfil",
      label: "Ranking",
    },
    reverse: true,
  },
  {
    id: "comunidades",
    tag: "Comunidades",
    title: "A tua malta, num só lugar.",
    intro: "Peladas fixas, membros, jogos abertos e estatísticas da comunidade — sem grupo morto no telemóvel.",
    description:
      "Cria ou entra em comunidades da tua zona, vê próximos jogos, membros activos e o historial da pelada. Organizadores gerem tudo num hub; jogadores encontram jogos e evoluem dentro da mesma malta. É o centro nervoso da tua pelada.",
    before: [
      "Grupos de WhatsApp caóticos",
      "Partidas anunciadas e perdidas",
      "Sem visão da comunidade",
      "Difícil juntar jogadores novos",
    ],
    after: [
      "Hub dedicado por pelada",
      "Jogos e membros organizados",
      "Stats e rankings da comunidade",
      "Peladas abertas para novos jogadores",
    ],
    screenshot: {
      src: "/screenshots/06-comunidade.png",
      alt: "Comunidades e peladas",
      label: "Comunidades",
    },
  },
];

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
}

function HeroSection({ onLogin, redirect }: { onLogin: () => void; redirect: string }) {
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  const handleMove = useCallback((e: MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    setTilt({ x: y * -14, y: x * 14 });
  }, []);

  const handleLeave = useCallback(() => setTilt({ x: 0, y: 0 }), []);

  return (
    <section className="relative min-h-[92vh] flex items-center overflow-hidden joga-landing-hero-bg pt-14">
      <div className="absolute inset-0 joga-landing-stadium-light opacity-80" />
      <div
        className="absolute inset-0 opacity-30"
        style={{ backgroundImage: PITCH_SVG, backgroundSize: "80px 80px" }}
      />

      <div className="relative max-w-6xl mx-auto px-4 py-12 lg:py-16 w-full">
        <div className="flex flex-col gap-10 lg:grid lg:grid-cols-2 lg:grid-rows-[auto_auto] lg:gap-14 lg:items-center">
          <motion.div {...fadeUp} className="text-center lg:text-left lg:col-start-1 lg:row-start-1">
            <p className="text-amber-400/80 text-[10px] font-black uppercase tracking-[0.4em] mb-4">
              A tua pelada. A tua carta. A tua evolução.
            </p>
            <h1 className="font-display font-black text-white text-[2.35rem] sm:text-5xl lg:text-[3.25rem] leading-[0.95] tracking-tight">
              A tua pelada
              <br />
              <span className="text-transparent bg-clip-text bg-linear-to-r from-emerald-400 via-emerald-300 to-amber-400">
                virou jogo.
              </span>
            </h1>
            <p className="text-white/50 text-base sm:text-lg mt-5 leading-relaxed max-w-lg mx-auto lg:mx-0">
              Cria a tua carta, organiza jogos, regista golos ao vivo e acompanha quem realmente evolui na pelada.
            </p>

            <ul className="mt-6 space-y-2.5 text-left max-w-md mx-auto lg:mx-0">
              {HERO_BULLETS.map((bullet) => (
                <li key={bullet} className="flex items-start gap-2.5 text-white/55 text-sm">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" strokeWidth={3} />
                  {bullet}
                </li>
              ))}
            </ul>
          </motion.div>

          <div className="flex justify-center lg:justify-end lg:col-start-2 lg:row-start-1 lg:row-span-2">
            <motion.div
              className="relative mx-auto w-full max-w-[220px] sm:max-w-[260px] lg:max-w-[300px]"
              initial={{ opacity: 0, y: 24, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.6, delay: 0.15 }}
            >
              <div
                className="absolute left-1/2 top-[42%] -translate-x-1/2 -translate-y-1/2 w-[115%] max-w-[360px] aspect-square rounded-full pointer-events-none"
                style={{
                  background:
                    "radial-gradient(circle, rgba(251,191,36,0.55) 0%, rgba(245,158,11,0.35) 32%, rgba(217,119,6,0.15) 52%, transparent 70%)",
                }}
                aria-hidden
              />
              <div
                className="absolute left-1/2 top-[42%] -translate-x-1/2 -translate-y-1/2 w-[90%] max-w-[280px] aspect-square rounded-full pointer-events-none blur-2xl"
                style={{
                  background: "radial-gradient(circle, rgba(253,224,71,0.5) 0%, rgba(245,158,11,0.25) 50%, transparent 75%)",
                }}
                aria-hidden
              />
              <div
                className="absolute -inset-4 rounded-full opacity-40 blur-3xl pointer-events-none"
                style={{
                  background:
                    "radial-gradient(circle, rgba(245,158,11,0.35) 0%, rgba(251,191,36,0.12) 45%, transparent 70%)",
                }}
                aria-hidden
              />
              <div
                className="relative mx-auto w-[220px] h-[304px] sm:w-[260px] sm:h-[359px] lg:w-[300px] lg:h-[414px]"
                style={{ perspective: "900px" }}
                onMouseMove={handleMove}
                onMouseLeave={handleLeave}
              >
                <div className="absolute top-0 left-1/2 w-[340px] origin-top -translate-x-1/2 scale-[0.647] sm:scale-[0.765] lg:scale-[0.882] [&_.joga-new-player-card-wrap--profile]:w-full!">
                  <div
                    className="transition-transform duration-200 ease-out"
                    style={{
                      transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
                      transformStyle: "preserve-3d",
                    }}
                  >
                    <PlayerCard
                      name={HERO_PLAYER.name}
                      position={HERO_PLAYER.position}
                      attributes={HERO_PLAYER.attributes}
                      shirtNumber={HERO_PLAYER.shirtNumber}
                      title={HERO_PLAYER.title}
                      size="profile"
                      photoUrl={GENERIC_PLAYER_PHOTO}
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          </div>

          <motion.div {...fadeUp} className="text-center lg:text-left lg:col-start-1 lg:row-start-2">
            <div className="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start">
              <JogaButton
                variant="gold"
                size="lg"
                className="joga-landing-cta-glow gap-2 sm:w-auto! sm:min-w-[220px]"
                onClick={onLogin}
              >
                Criar conta / Entrar
                <ChevronRight className="w-5 h-5" />
              </JogaButton>
              <JogaButton
                variant="ghost"
                size="lg"
                className="gap-2 sm:w-auto! border border-white/10"
                onClick={() => scrollToId("problema")}
              >
                Ver como funciona
              </JogaButton>
            </div>
            <p className="text-white/30 text-xs mt-4">
              Começa grátis. Cria a tua carta em poucos segundos.
            </p>
            <p className="mt-5">
              <Link
                href={redirect}
                className="text-white/30 text-sm joga-tap hover:text-white/50 transition-colors inline-flex items-center gap-1"
              >
                Explorar sem conta
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </p>
          </motion.div>
        </div>
      </div>

      <div className="absolute bottom-0 inset-x-0 h-24 bg-linear-to-t from-[#030508] to-transparent pointer-events-none" />
    </section>
  );
}

function PhoneScreenshot({
  src,
  alt,
  label,
  maxWidth,
}: {
  src: string;
  alt: string;
  label: string;
  maxWidth?: string;
}) {
  const [failed, setFailed] = useState(false);
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <div className="mx-auto w-full sm:max-w-[240px]" style={{ maxWidth: maxWidth ?? "220px" }}>
        <button
          type="button"
          onClick={() => !failed && setExpanded(true)}
          disabled={failed}
          className="group relative w-full joga-tap text-left disabled:cursor-default"
          aria-label={`Ampliar screenshot: ${label}`}
        >
          <div
            className="relative rounded-[1.35rem] p-[2px] bg-linear-to-b from-white/14 to-white/4 transition-transform duration-200 group-hover:scale-[1.02] group-focus-visible:scale-[1.02]"
            style={{ boxShadow: "0 16px 40px rgba(0,0,0,0.5)" }}
          >
            <div className="relative overflow-hidden rounded-[1.2rem] bg-[#0a0f1a]">
              {failed ? (
                <div className="flex min-h-[200px] items-center justify-center text-white/30 text-sm font-bold p-4 text-center">
                  {label}
                </div>
              ) : (
                <>
                  <img
                    src={src}
                    alt={alt}
                    className="block w-full h-auto select-none"
                    loading="lazy"
                    draggable={false}
                    onError={() => setFailed(true)}
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/25 transition-colors">
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5 rounded-full bg-black/55 px-3 py-1.5 text-white text-[10px] font-bold uppercase tracking-wide">
                      <ZoomIn className="w-3.5 h-3.5" />
                      Ampliar
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        </button>
        <p className="text-white/40 text-[10px] font-black uppercase tracking-[0.2em] text-center mt-3">
          {label}
        </p>
        {!failed && (
          <p className="text-white/20 text-[9px] text-center mt-1">Toca para ver em tamanho maior</p>
        )}
      </div>

      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="max-w-[min(92vw,440px)] border-white/10 bg-[#0a0f1a]/98 backdrop-blur-xl p-3 sm:p-4 rounded-2xl [&>button]:text-white/50 [&>button]:hover:text-white">
          <DialogTitle className="font-display font-black text-white text-center text-sm uppercase tracking-wider pr-8">
            {label}
          </DialogTitle>
          <div className="mt-2 rounded-xl overflow-hidden bg-[#050810] flex items-center justify-center max-h-[80vh]">
            <img
              src={src}
              alt={alt}
              className="block w-full h-auto max-h-[78vh] select-none"
              draggable={false}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function BeforeAfterCards({
  before,
  after,
}: {
  before: string[];
  after: string[];
}) {
  return (
    <div className="grid sm:grid-cols-2 gap-3 mt-6">
      <div className="rounded-xl border border-red-500/20 bg-red-950/15 p-4">
        <div className="flex items-center gap-2 mb-3">
          <X className="w-4 h-4 text-red-400 shrink-0" />
          <h4 className="font-display font-black text-red-300 text-sm uppercase tracking-wide">
            Antes do Joga AI
          </h4>
        </div>
        <ul className="space-y-2">
          {before.map((item) => (
            <li key={item} className="flex items-start gap-2 text-white/45 text-xs sm:text-sm leading-snug">
              <span className="text-red-400/70 shrink-0">×</span>
              {item}
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-xl border border-emerald-500/25 bg-emerald-950/15 p-4 relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-30 pointer-events-none"
          style={{ background: "radial-gradient(ellipse at 100% 0%, rgba(22,163,74,0.25), transparent 60%)" }}
        />
        <div className="relative">
          <div className="flex items-center gap-2 mb-3">
            <Check className="w-4 h-4 text-emerald-400 shrink-0" strokeWidth={3} />
            <h4 className="font-display font-black text-emerald-300 text-sm uppercase tracking-wide">
              Com o Joga AI
            </h4>
          </div>
          <ul className="space-y-2">
            {after.map((item) => (
              <li key={item} className="flex items-start gap-2 text-white/60 text-xs sm:text-sm leading-snug">
                <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" strokeWidth={3} />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function FeatureSection({
  section,
  onLogin,
}: {
  section: FeatureSectionData;
  onLogin: () => void;
}) {
  const introBlock = (
    <div>
      <p className="text-emerald-400/70 text-[10px] font-black uppercase tracking-[0.35em] mb-2">
        {section.tag}
      </p>
      <h2 className="font-display font-black text-white text-2xl sm:text-3xl leading-tight">
        {section.title}
      </h2>
      <p className="text-white/50 text-sm sm:text-base mt-3 leading-relaxed font-medium">
        {section.intro}
      </p>
      <p className="text-white/40 text-sm mt-4 leading-relaxed">
        {section.description}
      </p>
    </div>
  );

  const imageBlock = (
    <PhoneScreenshot
      src={section.screenshot.src}
      alt={section.screenshot.alt}
      label={section.screenshot.label}
      maxWidth={section.screenshot.maxWidth}
    />
  );

  const benefitsBlock = (
    <div>
      <BeforeAfterCards before={section.before} after={section.after} />
      <JogaButton
        variant="primary"
        size="md"
        className="mt-6 gap-2 sm:w-auto!"
        onClick={onLogin}
      >
        Criar conta / Entrar
        <ChevronRight className="w-4 h-4" />
      </JogaButton>
    </div>
  );

  const textCol = section.reverse ? "md:col-start-2 md:row-start-1" : "md:col-start-1 md:row-start-1";
  const imageCol = section.reverse
    ? "md:col-start-1 md:row-start-1 md:row-span-2 md:justify-start"
    : "md:col-start-2 md:row-start-1 md:row-span-2 md:justify-end";
  const benefitsCol = section.reverse ? "md:col-start-2 md:row-start-2" : "md:col-start-1 md:row-start-2";

  return (
    <motion.section
      id={section.id}
      className="px-4 py-16 sm:py-20 scroll-mt-16 border-b border-white/6"
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.4 }}
    >
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-col gap-8 md:grid md:grid-cols-2 md:grid-rows-[auto_auto] md:gap-x-14 md:gap-y-8 md:items-start">
          <div className={textCol}>{introBlock}</div>
          <div className={`flex justify-center ${imageCol}`}>{imageBlock}</div>
          <div className={benefitsCol}>{benefitsBlock}</div>
        </div>
      </div>
    </motion.section>
  );
}

function LandingHeader({ onLogin }: { onLogin: () => void }) {
  return (
    <header className="fixed top-0 inset-x-0 z-40 joga-landing-glass">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
        <JogaLogo variant="full" size="md" className="max-w-[180px]" />

        <nav className="hidden sm:flex items-center gap-6">
          {[
            { label: "Como funciona", id: "problema" },
            { label: "App", id: "ao-vivo" },
            { label: "Comunidades", id: "comunidades" },
          ].map((link) => (
            <button
              key={link.id}
              type="button"
              onClick={() => scrollToId(link.id)}
              className="text-white/50 text-sm font-semibold joga-tap hover:text-white/80 transition-colors"
            >
              {link.label}
            </button>
          ))}
        </nav>

        <JogaButton
          variant="gold"
          size="sm"
          className="shrink-0 joga-landing-cta-glow min-h-9! px-4! text-sm! w-auto!"
          onClick={onLogin}
        >
          Entrar
        </JogaButton>
      </div>
    </header>
  );
}

function LoginModal({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-white/10 bg-[#0a0f1a]/98 backdrop-blur-xl text-white p-6 sm:p-7 rounded-2xl shadow-2xl [&>button]:text-white/50 [&>button]:hover:text-white [&>button]:top-5 [&>button]:right-5">
        <div className="flex justify-center mb-3">
          <JogaLogo variant="badge" size="md" />
        </div>
        <DialogTitle className="font-display font-black text-2xl text-white text-center pr-6">
          Entra no Joga AI
        </DialogTitle>
        <DialogDescription className="text-white/45 text-sm text-center -mt-1 mb-2">
          Organiza. Joga. Regista. Evolui.
        </DialogDescription>
        <LoginPanel bare compact onSuccess={onSuccess} />
      </DialogContent>
    </Dialog>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-emerald-400/70 text-[10px] font-black uppercase tracking-[0.35em] mb-2 text-center">
      {children}
    </p>
  );
}

export default function Login() {
  useDocumentTitle("Entrar");
  const { isLinked, loading } = useAuth();
  const [, setLocation] = useLocation();
  const [loginOpen, setLoginOpen] = useState(false);

  const redirect = new URLSearchParams(window.location.search).get("redirect") || "/";

  useEffect(() => {
    document.documentElement.style.scrollBehavior = "smooth";
    return () => {
      document.documentElement.style.scrollBehavior = "";
    };
  }, []);

  useEffect(() => {
    if (!loading && isLinked) {
      setLocation(redirect);
    }
  }, [loading, isLinked, redirect, setLocation]);

  function handleSuccess() {
    setLoginOpen(false);
    setLocation(redirect);
  }

  function openLogin() {
    setLoginOpen(true);
  }

  return (
    <JogaPage theme="dark" padded={false} bottomSpace={false} className="pb-0">
      <LandingHeader onLogin={openLogin} />
      <LoginModal open={loginOpen} onOpenChange={setLoginOpen} onSuccess={handleSuccess} />

      <HeroSection onLogin={openLogin} redirect={redirect} />

      <div id="app">
        {FEATURE_SECTIONS.map((section) => (
          <FeatureSection key={section.id} section={section} onLogin={openLogin} />
        ))}
      </div>

      {/* ── SCOREBOARD ── */}
      <section className="px-4 py-16 border-b border-white/6">
        <div className="max-w-4xl mx-auto">
          <SectionLabel>Impacto</SectionLabel>
          <h2 className="font-display font-black text-white text-2xl text-center mb-8">
            A pelada já virou jogo para milhares
          </h2>

          <motion.div
            className="joga-landing-scoreboard rounded-2xl p-6 sm:p-8"
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4 }}
          >
            <div className="flex items-center justify-center gap-3 mb-6 pb-4 border-b border-white/10">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-white/40 text-[10px] font-black uppercase tracking-[0.3em]">
                Ao vivo · Comunidades
              </span>
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            </div>
            <div className="grid grid-cols-3 gap-4 sm:gap-8">
              {STATS.map((s) => (
                <div key={s.label} className="text-center">
                  <p className="font-display font-black text-3xl sm:text-4xl text-transparent bg-clip-text bg-linear-to-b from-emerald-300 to-emerald-500">
                    {s.value}
                  </p>
                  <p className="text-white/35 text-[10px] sm:text-xs font-bold uppercase tracking-wide mt-2 leading-tight">
                    {s.label}
                  </p>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── CTA FINAL ── */}
      <section
        className="px-4 py-20 text-center relative overflow-hidden"
        style={{
          background: "linear-gradient(180deg, transparent, rgba(22,163,74,0.1) 50%, rgba(245,158,11,0.06) 100%)",
        }}
      >
        <div className="relative max-w-lg mx-auto">
          <h2 className="font-display font-black text-white text-2xl sm:text-3xl mb-4">
            Pronto para transformar a tua pelada em jogo?
          </h2>
          <p className="text-white/45 text-sm sm:text-base mb-8 leading-relaxed">
            Cria a tua conta, monta a tua carta e começa a evoluir desde o próximo jogo.
          </p>
          <JogaButton variant="gold" size="lg" className="joga-landing-cta-glow gap-2 max-w-sm mx-auto" onClick={openLogin}>
            Criar conta / Entrar
            <ChevronRight className="w-5 h-5" />
          </JogaButton>
          <p className="mt-4">
            <Link href="/premium" className="text-amber-400/60 text-sm joga-tap hover:text-amber-400">
              Ver Joga AI Premium →
            </Link>
          </p>
        </div>
      </section>

      <footer className="px-4 py-8 border-t border-white/6 text-center pb-12">
        <div className="flex justify-center gap-6 mb-4">
          <Link href="/" className="text-white/35 text-xs joga-tap hover:text-white/55">
            Início
          </Link>
          <Link href="/jogos" className="text-white/35 text-xs joga-tap hover:text-white/55">
            Jogos
          </Link>
          <Link href="/comunidades" className="text-white/35 text-xs joga-tap hover:text-white/55">
            Comunidades
          </Link>
        </div>
        <p className="text-white/20 text-[11px]">© Joga AI · Feito para quem joga a sério</p>
      </footer>
    </JogaPage>
  );
}
