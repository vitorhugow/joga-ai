import { Link } from "wouter";
import { ChevronLeft } from "lucide-react";
import { JogaPage } from "@/components/joga";

const SECTIONS = [
  {
    title: "1. Quem somos",
    body: (
      <>
        <p>
          O <strong>Joga AI</strong> (disponível em{" "}
          <a href="https://jogaai.pt" className="text-emerald-400">jogaai.pt</a>) é operado por{" "}
          <strong>Camila Roberta — Unipessoal Lda.</strong>, responsável pelo tratamento dos dados
          pessoais descritos nesta política.
        </p>
        <p>
          Para questões sobre privacidade:{" "}
          <a href="mailto:suporte@jogaai.pt" className="text-emerald-400">suporte@jogaai.pt</a>
        </p>
      </>
    ),
  },
  {
    title: "2. Que dados recolhemos",
    body: (
      <ul className="list-disc pl-5 space-y-1">
        <li><strong>Conta:</strong> e-mail, identificador de utilizador (Firebase Auth), nome de exibição, foto de perfil (opcional).</li>
        <li><strong>Perfil de jogador:</strong> posição, atributos da carta, estatísticas de época, histórico de peladas e evolução.</li>
        <li><strong>Peladas e comunidades:</strong> títulos, datas, locais, listas de presença, resultados, notas e imagens de capa de comunidade.</li>
        <li><strong>Pagamentos:</strong> quando usas subscrições PRO ou pagamentos de pelada, o processamento é feito pela <strong>Stripe</strong>. Não guardamos números de cartão — apenas identificadores de cliente Stripe, estado de pagamento e subscrição associados à tua conta.</li>
        <li><strong>Organizadores (Stripe Connect):</strong> identificador da conta Express Stripe para receber pagamentos de peladas, conforme o onboarding Stripe.</li>
        <li><strong>Técnicos:</strong> dados de utilização da app, tipo de dispositivo, endereço IP aproximado e registos necessários à segurança e funcionamento do serviço.</li>
      </ul>
    ),
  },
  {
    title: "3. Para que usamos os dados",
    body: (
      <ul className="list-disc pl-5 space-y-1">
        <li>Criar e gerir a tua conta e perfil de jogador.</li>
        <li>Organizar peladas, comunidades, convocatórias, resultados e estatísticas.</li>
        <li>Processar subscrições PRO e pagamentos de peladas (via Stripe).</li>
        <li>Enviar notificações relacionadas com jogos e pagamentos (quando activadas).</li>
        <li>Prevenir fraude, abuso e garantir a segurança da plataforma.</li>
        <li>Cumprir obrigações legais e responder a pedidos de autoridades, quando aplicável.</li>
      </ul>
    ),
  },
  {
    title: "4. Base legal (RGPD)",
    body: (
      <ul className="list-disc pl-5 space-y-1">
        <li><strong>Execução de contrato:</strong> prestação do serviço Joga AI que solicitaste ao criar conta.</li>
        <li><strong>Interesse legítimo:</strong> melhorar o serviço, segurança e prevenção de abuso.</li>
        <li><strong>Consentimento:</strong> quando aplicável (ex.: comunicações opcionais).</li>
        <li><strong>Obrigação legal:</strong> conservação de registos de pagamento e faturação, quando exigido por lei.</li>
      </ul>
    ),
  },
  {
    title: "5. Com quem partilhamos os dados",
    body: (
      <>
        <p>Não vendemos os teus dados pessoais. Partilhamos apenas com:</p>
        <ul className="list-disc pl-5 space-y-1 mt-2">
          <li>
            <strong>Stripe, Inc.</strong> — processamento de pagamentos, subscrições e contas Connect
            dos organizadores. Política:{" "}
            <a href="https://stripe.com/privacy" className="text-emerald-400" target="_blank" rel="noopener noreferrer">
              stripe.com/privacy
            </a>
          </li>
          <li>
            <strong>Google Firebase / Google Cloud</strong> — autenticação, base de dados (Firestore),
            alojamento de funções serverless. Política:{" "}
            <a href="https://policies.google.com/privacy" className="text-emerald-400" target="_blank" rel="noopener noreferrer">
              policies.google.com/privacy
            </a>
          </li>
          <li>
            <strong>Cloudflare</strong> — alojamento e distribuição do site (CDN). Política:{" "}
            <a href="https://www.cloudflare.com/privacypolicy/" className="text-emerald-400" target="_blank" rel="noopener noreferrer">
              cloudflare.com/privacypolicy
            </a>
          </li>
        </ul>
        <p className="mt-2">
          Outros jogadores e organizadores podem ver informação que escolhes tornar pública no
          contexto de peladas e comunidades (nome, carta, estatísticas de jogo).
        </p>
      </>
    ),
  },
  {
    title: "6. Transferências internacionais",
    body: (
      <p>
        Alguns prestadores (Google, Stripe, Cloudflare) podem processar dados fora do Espaço
        Económico Europeu, com salvaguardas contratuais e medidas de proteção reconhecidas (cláusulas
        contratuais-tipo da UE ou decisões de adequação, conforme aplicável).
      </p>
    ),
  },
  {
    title: "7. Durante quanto tempo guardamos os dados",
    body: (
      <ul className="list-disc pl-5 space-y-1">
        <li>Dados de conta e perfil: enquanto a conta estiver activa.</li>
        <li>Histórico de peladas: enquanto relevante para o serviço ou até pedido de eliminação.</li>
        <li>Dados de pagamento e faturação: pelo período exigido por lei (normalmente até 10 anos para fins fiscais/contabilísticos).</li>
        <li>Após eliminação da conta, removemos ou anonimizamos dados que já não sejam necessários, salvo obrigação legal de conservação.</li>
      </ul>
    ),
  },
  {
    title: "8. Os teus direitos",
    body: (
      <>
        <p>Nos termos do RGPD, podes exercer os seguintes direitos:</p>
        <ul className="list-disc pl-5 space-y-1 mt-2">
          <li>Acesso aos teus dados pessoais.</li>
          <li>Rectificação de dados incorrectos.</li>
          <li>Apagamento (“direito a ser esquecido”), quando aplicável.</li>
          <li>Limitação ou oposição ao tratamento, em certas circunstâncias.</li>
          <li>Portabilidade dos dados que nos forneceste.</li>
          <li>Retirar consentimento, quando o tratamento se baseie nele.</li>
        </ul>
        <p className="mt-2">
          Contacta{" "}
          <a href="mailto:suporte@jogaai.pt" className="text-emerald-400">suporte@jogaai.pt</a>.
          Tens também o direito de reclamar junto da{" "}
          <a href="https://www.cnpd.pt" className="text-emerald-400" target="_blank" rel="noopener noreferrer">
            CNPD
          </a>{" "}
          (Comissão Nacional de Protecção de Dados).
        </p>
      </>
    ),
  },
  {
    title: "9. Segurança",
    body: (
      <ul className="list-disc pl-5 space-y-1">
        <li>Comunicação encriptada (HTTPS/TLS) em todo o site.</li>
        <li>Autenticação segura via Firebase Auth; palavras-passe nunca armazenadas em texto simples por nós.</li>
        <li>Regras de acesso à base de dados (Firestore Security Rules) que impedem utilizadores de alterar dados de outros ou campos sensíveis (ex.: subscrição PRO).</li>
        <li>Dados de cartão processados exclusivamente pela Stripe (certificação PCI DSS); não transitam pelos nossos servidores.</li>
        <li>Chaves secretas de API e credenciais de pagamento guardadas em ambientes seguros (Firebase Secret Manager), nunca no código público.</li>
        <li>Acesso administrativo restrito e monitorização de erros operacionais.</li>
      </ul>
    ),
  },
  {
    title: "10. Cookies e armazenamento local",
    body: (
      <p>
        A aplicação usa armazenamento local do browser (localStorage) para preferências e cache
        offline de partidas no teu dispositivo, e cookies técnicos necessários à sessão de
        autenticação. Não usamos cookies de publicidade de terceiros.
      </p>
    ),
  },
  {
    title: "11. Menores",
    body: (
      <p>
        O serviço destina-se a utilizadores com idade mínima de 16 anos. Se tomarmos conhecimento
        de que recolhemos dados de um menor sem autorização parental adequada, eliminaremos essa
        conta.
      </p>
    ),
  },
  {
    title: "12. Alterações",
    body: (
      <p>
        Podemos actualizar esta política. A data da última revisão aparece no final desta página.
        Alterações relevantes serão comunicadas na aplicação ou por e-mail, quando apropriado.
      </p>
    ),
  },
];

export default function Privacidade() {
  return (
    <JogaPage theme="dark" className="py-5 max-w-lg mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/entrar" className="joga-tap">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center border border-white/12 bg-white/6">
            <ChevronLeft className="w-5 h-5 text-white" />
          </div>
        </Link>
        <h1 className="font-display font-black text-white text-2xl">Política de Privacidade</h1>
      </div>

      <p className="text-white/50 text-sm leading-relaxed">
        Esta política descreve como o Joga AI recolhe, utiliza, partilha e protege os teus dados
        pessoais, em conformidade com o Regulamento Geral sobre a Protecção de Dados (RGPD).
      </p>

      <div className="prose prose-invert prose-sm max-w-none space-y-6 text-white/70">
        {SECTIONS.map((s) => (
          <section key={s.title}>
            <h2 className="text-white font-bold text-base mb-2">{s.title}</h2>
            <div className="space-y-2 text-sm leading-relaxed">{s.body}</div>
          </section>
        ))}
        <p className="text-white/40 text-xs pt-2 border-t border-white/10">
          Última actualização: 8 de Julho de 2026 ·{" "}
          <Link href="/termos" className="text-emerald-400/80 hover:text-emerald-300">
            Termos de uso
          </Link>
        </p>
      </div>
    </JogaPage>
  );
}
