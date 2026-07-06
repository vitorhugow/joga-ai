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

      <div className="prose prose-invert prose-sm max-w-none space-y-4 text-white/70">
        <p>
          Ao criar conta no Joga AI, concordas em usar a plataforma de forma respeitosa — notas e
          estatísticas reflectem o jogo entre amigos, não competição oficial.
        </p>
        <p>
          És responsável pelo conteúdo que publicas (nomes em peladas, comunidades e mensagens).
          O organizador de cada partida é responsável pelos dados inseridos no resumo pós-jogo.
        </p>
        <p>
          O serviço é fornecido “como está”, em evolução contínua. Funcionalidades Premium e Campos
          podem ser activadas no futuro com condições próprias.
        </p>
        <p>
          Consulta também a nossa{" "}
          <Link href="/privacidade" className="text-emerald-400">
            política de privacidade
          </Link>
          .
        </p>
        <p className="text-white/40 text-xs">Última actualização: Julho 2026</p>
      </div>
    </JogaPage>
  );
}
