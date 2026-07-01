import { Link } from "wouter";
import { ChevronLeft } from "lucide-react";
import { JogaPage } from "@/components/joga";

export default function Privacidade() {
  return (
    <JogaPage theme="dark" className="py-5 max-w-lg mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/entrar" className="joga-tap">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center border border-white/12 bg-white/6">
            <ChevronLeft className="w-5 h-5 text-white" />
          </div>
        </Link>
        <h1 className="font-display font-black text-white text-2xl">Privacidade</h1>
      </div>

      <div className="prose prose-invert prose-sm max-w-none space-y-4 text-white/70">
        <p>
          O Joga AI guarda os dados da tua conta (nome, carta, estatísticas e histórico de peladas)
          no Firebase, associados ao teu identificador de utilizador.
        </p>
        <p>
          Fotos de perfil e capas de comunidade são armazenadas como imagens no Firestore, apenas
          visíveis a utilizadores autenticados conforme as regras da aplicação.
        </p>
        <p>
          Não vendemos os teus dados. Podes pedir a eliminação da conta contactando o organizador
          do projeto ou removendo os dados no Firebase Console se fores administrador.
        </p>
        <p className="text-white/40 text-xs">Última actualização: Julho 2026</p>
      </div>
    </JogaPage>
  );
}
