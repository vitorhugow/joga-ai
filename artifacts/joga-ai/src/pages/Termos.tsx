import { Link } from "wouter";
import { ChevronLeft } from "lucide-react";
import { JogaPage } from "@/components/joga";

export default function Termos() {
  return (
    <JogaPage theme="dark" className="py-5 max-w-lg mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/entrar" className="joga-tap">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center border border-white/12 bg-white/6">
            <ChevronLeft className="w-5 h-5 text-white" />
          </div>
        </Link>
        <h1 className="font-display font-black text-white text-2xl">Termos de uso</h1>
      </div>

      <div className="prose prose-invert prose-sm max-w-none space-y-4 text-white/70 text-sm leading-relaxed">
        <p>
          Ao criar conta no <strong>Joga AI</strong> (
          <a href="https://jogaai.pt" className="text-emerald-400">jogaai.pt</a>), operado por{" "}
          <strong>Camila Roberta — Unipessoal Lda.</strong>, aceitas estes termos.
        </p>

        <section>
          <h2 className="text-white font-bold text-base mb-2">1. O serviço</h2>
          <p>
            O Joga AI é uma plataforma para organizar peladas de futebol amador, gerir clubes,
            estatísticas e resultados. O serviço é fornecido em evolução contínua (“como está”).
          </p>
        </section>

        <section>
          <h2 className="text-white font-bold text-base mb-2">2. A tua conta</h2>
          <p>
            És responsável pela confidencialidade das credenciais da tua conta e pelo uso feito
            através dela. Os dados do perfil e da carta devem ser verídicos na medida do razoável.
          </p>
        </section>

        <section>
          <h2 className="text-white font-bold text-base mb-2">3. Conteúdo e conduta</h2>
          <p>
            Concordas em usar a plataforma de forma respeitosa. És responsável pelo conteúdo que
            publicas (nomes de peladas, clubes, notas). Estatísticas reflectem jogos entre
            amigos — não constituem competição oficial. O organizador de cada partida é responsável
            pelos dados inseridos no resumo pós-jogo.
          </p>
        </section>

        <section>
          <h2 className="text-white font-bold text-base mb-2">4. Planos PRO e pagamentos</h2>
          <p>
            Subscrições <strong>PRO Jogador</strong> e <strong>Clube PRO</strong> são processadas
            pela <strong>Stripe</strong>. Preços, renovação e cancelamento seguem as condições
            apresentadas no momento da subscrição. Podes gerir a subscrição através do portal Stripe
            disponível na app.
          </p>
          <p className="mt-2">
            Pagamentos de peladas entre jogadores e organizadores são processados via{" "}
            <strong>Stripe Connect</strong>. O organizador recebe o valor da pelada; pode aplicar-se
            uma taxa de serviço da plataforma ao jogador, indicada no checkout. A plataforma não é
            parte no contrato entre organizador e jogadores quanto ao jogo em si.
          </p>
        </section>

        <section>
          <h2 className="text-white font-bold text-base mb-2">5. Organizadores e Stripe Connect</h2>
          <p>
            Organizadores que activam pagamentos na app devem completar o onboarding Stripe e cumprir
            os termos da Stripe como vendedores/connected accounts. A plataforma pode suspender
            contas em caso de fraude, abuso ou incumprimento destes termos.
          </p>
        </section>

        <section>
          <h2 className="text-white font-bold text-base mb-2">6. Limitação de responsabilidade</h2>
          <p>
            O Joga AI não garante disponibilidade ininterrupta. Não somos responsáveis por lesões,
            disputas entre jogadores ou incumprimentos de pagamentos manuais acordados fora da app.
            Na máxima extensão permitida por lei, a nossa responsabilidade limita-se ao valor pago
            por ti à plataforma nos últimos 12 meses.
          </p>
        </section>

        <section>
          <h2 className="text-white font-bold text-base mb-2">7. Privacidade</h2>
          <p>
            O tratamento de dados pessoais rege-se pela nossa{" "}
            <Link href="/privacidade" className="text-emerald-400">
              Política de Privacidade
            </Link>
            .
          </p>
        </section>

        <section>
          <h2 className="text-white font-bold text-base mb-2">8. Contacto</h2>
          <p>
            <a href="mailto:vitor@geniai.pt" className="text-emerald-400">vitor@geniai.pt</a>
          </p>
        </section>

        <p className="text-white/40 text-xs pt-2 border-t border-white/10">
          Última actualização: 8 de Julho de 2026
        </p>
      </div>
    </JogaPage>
  );
}
