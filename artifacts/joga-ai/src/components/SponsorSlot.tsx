/**
 * SponsorSlot — espaço de patrocínio gerido sem deploy.
 *
 * Conteúdo vem de appConfig/sponsor no Firestore:
 *   { active: boolean, label?, title?, body?, url? }
 * Sem doc (ou active=false), mostra o convite padrão a patrocinadores
 * com link para a Geni AI. Trocar de patrocinador = editar o doc na consola.
 *
 * Colocações: fim das listas (Comunidades) e resumo pós-jogo.
 * NUNCA colocar na carta do jogador nem no ecrã Ao Vivo.
 */

import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db, isFirebaseConfigured } from "@/lib/firebase";

const GENI_URL = "https://instagram.com/geniai.pt";

type SponsorContent = {
  label: string;
  title: string;
  body: string;
  url: string;
};

const DEFAULT_CONTENT: SponsorContent = {
  label: "Espaço patrocinado",
  title: "Coloca a tua marca aqui",
  body: "Este espaço está disponível para patrocinadores locais. Fala connosco.",
  url: GENI_URL,
};

let cached: SponsorContent | null = null;

export function SponsorSlot({ className = "" }: { className?: string }) {
  const [content, setContent] = useState<SponsorContent>(cached ?? DEFAULT_CONTENT);

  useEffect(() => {
    if (cached || !isFirebaseConfigured()) return;
    getDoc(doc(db, "appConfig", "sponsor"))
      .then((snap) => {
        const data = snap.data();
        if (data?.active) {
          cached = {
            label: String(data.label ?? DEFAULT_CONTENT.label),
            title: String(data.title ?? DEFAULT_CONTENT.title),
            body: String(data.body ?? DEFAULT_CONTENT.body),
            url: String(data.url ?? DEFAULT_CONTENT.url),
          };
        } else {
          cached = DEFAULT_CONTENT;
        }
        setContent(cached);
      })
      .catch(() => {
        /* fallback silencioso para o conteúdo padrão */
      });
  }, []);

  return (
    <a
      href={content.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`block rounded-2xl px-4 py-3 transition-opacity hover:opacity-80 ${className}`}
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px dashed rgba(255,255,255,0.12)",
      }}
    >
      <p
        className="text-[10px] font-black uppercase tracking-[0.2em]"
        style={{ color: "rgba(255,255,255,0.28)" }}
      >
        {content.label}
      </p>
      <p className="font-display font-bold text-white/85 text-sm mt-1">{content.title}</p>
      <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>
        {content.body}
      </p>
    </a>
  );
}

/** Crédito discreto "Feito pela Geni AI" para rodapés */
export function GeniCredit({ className = "" }: { className?: string }) {
  return (
    <a
      href={GENI_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1 text-xs transition-opacity hover:opacity-80 ${className}`}
      style={{ color: "rgba(255,255,255,0.35)" }}
    >
      Feito pela <span className="font-bold" style={{ color: "rgba(16,185,129,0.75)" }}>Geni AI</span>
    </a>
  );
}
