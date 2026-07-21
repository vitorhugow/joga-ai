import { Link } from "wouter";
import { JogaButton } from "./JogaButton";
import { JogaCard } from "./JogaCard";

const STEPS = [
  {
    title: "Cria o teu clube",
    body: "Ainda não tens clube? Cria o teu no separador Clubes — leva menos de um minuto.",
  },
  {
    title: "Inscreve o clube na Cup",
    body: "Abre a página do teu clube. Ao lado do painel vais ver o botão de inscrição (exemplo abaixo).",
  },
  {
    title: "Espera a confirmação",
    body: "Assim que confirmarmos a tua vaga, o teu clube entra no sorteio dos grupos.",
  },
];

export function CupRegistrationSteps() {
  return (
    <JogaCard variant="arena" padding="lg">
      <p className="text-white/40 text-[10px] font-black uppercase tracking-[0.14em] mb-1">Inscrição</p>
      <h3 className="text-white text-xl font-black tracking-tight">Como participar</h3>
      <p className="text-white/55 text-sm mt-2">A inscrição é sempre por clube. São três passos:</p>

      <div className="grid gap-2.5 mt-4">
        {STEPS.map((step, i) => (
          <div
            key={step.title}
            className="relative rounded-2xl pl-[52px] pr-3.5 py-3.5"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
          >
            <div
              className="absolute left-3 top-3 w-7 h-7 rounded-lg flex items-center justify-center text-white font-black text-sm"
              style={{ background: "linear-gradient(135deg,#18b85e,#12d16a)" }}
            >
              {i + 1}
            </div>
            <h4 className="text-white text-sm font-bold">{step.title}</h4>
            <p className="text-white/50 text-[13px] leading-snug mt-0.5">{step.body}</p>
          </div>
        ))}
      </div>

      <Link href="/comunidades/criar" className="block mt-4">
        <JogaButton variant="primary" size="lg" className="w-full">
          Criar o teu clube <span className="ml-1">→</span>
        </JogaButton>
      </Link>
      <p className="text-white/35 text-[11px] text-center mt-2">abre a página de criar clube em Clubes</p>

      <div
        className="mt-4 rounded-2xl p-4 text-center"
        style={{ border: "1px dashed rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.02)" }}
      >
        <p className="text-white/35 text-[10px] font-bold uppercase tracking-[0.08em] mb-3">
          O botão que vais encontrar no teu clube
        </p>
        <span
          className="inline-flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm"
          style={{ color: "#1c1400", background: "linear-gradient(135deg,#e6c15c,#f2d47a)" }}
        >
          🏆 Inscrever na Joga Aí Cup
        </span>
        <p className="text-white/50 text-[12.5px] leading-snug mt-3">
          Aparece na primeira página do clube, ao lado do painel. Só o{" "}
          <b className="text-white/80">admin / capitão</b> o vê, enquanto as inscrições estiverem abertas.
        </p>
      </div>

      <div
        className="mt-3 flex gap-2.5 items-start rounded-xl p-3.5"
        style={{ background: "rgba(24,184,94,0.06)", border: "1px solid rgba(24,184,94,0.2)" }}
      >
        <span className="shrink-0 text-base">📣</span>
        <p className="text-[13px] leading-snug" style={{ color: "#bcd3c7" }}>
          Não és o admin do clube? Vais ver <b className="text-emerald-300">«Pedir para entrar na Cup»</b> — o teu
          capitão recebe o aviso e decide a inscrição.
        </p>
      </div>
    </JogaCard>
  );
}
