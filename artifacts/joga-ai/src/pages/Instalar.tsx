import { useState } from "react";
import { Link } from "wouter";
import {
  ChevronLeft,
  Download,
  Share,
  Plus,
  Check,
  Smartphone,
} from "lucide-react";
import { JogaButton, JogaCard, JogaPage } from "@/components/joga";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=pt.jogaai.app";

type OS = "android" | "ios";

function detectOS(): OS {
  if (typeof navigator === "undefined") return "android";
  const ua = navigator.userAgent || "";
  if (/iPad|iPhone|iPod/.test(ua)) return "ios";
  return "android";
}

function StepRow({ number, children }: { number: number; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 font-display font-black text-sm"
        style={{ background: "rgba(74,222,128,0.15)", color: "#4ade80", border: "1px solid rgba(74,222,128,0.3)" }}
      >
        {number}
      </div>
      <p className="text-white/75 text-sm leading-relaxed pt-0.5">{children}</p>
    </div>
  );
}

export default function Instalar() {
  useDocumentTitle("Instalar a app");
  const [os, setOS] = useState<OS>(() => detectOS());

  return (
    <JogaPage theme="dark" padded={false} bottomSpace>
      <div
        className="relative overflow-hidden px-4 pt-6 pb-5"
        style={{ background: "linear-gradient(155deg, #031408 0%, #052010 28%, #0a5a1e 65%, #0d6826 100%)" }}
      >
        <div className="flex items-center gap-3 mb-4">
          <Link href="/perfil" className="joga-tap">
            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center"
              style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)" }}
            >
              <ChevronLeft className="w-5 h-5 text-white" />
            </div>
          </Link>
          <div>
            <p className="text-white/40 text-[10px] font-black uppercase tracking-[0.22em]">Joga AI</p>
            <h1 className="font-display font-black text-white text-2xl leading-tight">Instalar a app</h1>
          </div>
        </div>
        <p className="text-white/60 text-sm leading-relaxed">
          Tem o teu ícone, funciona em ecrã inteiro e sem barra do browser — instala em segundos.
        </p>
      </div>

      <div className="px-4 pt-5 space-y-5">
        <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl" style={{ background: "rgba(255,255,255,0.05)" }}>
          <button
            type="button"
            onClick={() => setOS("android")}
            data-testid="tab-instalar-android"
            className="py-2.5 rounded-xl text-sm font-bold transition-colors"
            style={
              os === "android"
                ? { background: "rgba(74,222,128,0.15)", color: "#4ade80", border: "1px solid rgba(74,222,128,0.3)" }
                : { background: "transparent", color: "rgba(255,255,255,0.45)", border: "1px solid transparent" }
            }
          >
            Android
          </button>
          <button
            type="button"
            onClick={() => setOS("ios")}
            data-testid="tab-instalar-iphone"
            className="py-2.5 rounded-xl text-sm font-bold transition-colors"
            style={
              os === "ios"
                ? { background: "rgba(74,222,128,0.15)", color: "#4ade80", border: "1px solid rgba(74,222,128,0.3)" }
                : { background: "transparent", color: "rgba(255,255,255,0.45)", border: "1px solid transparent" }
            }
          >
            iPhone
          </button>
        </div>

        {os === "android" ? (
          <>
            <JogaCard variant="arena" padding="lg">
              <p className="text-emerald-300 text-[10px] font-black uppercase tracking-[0.18em]">
                Já disponível
              </p>
              <p className="text-white text-sm mt-2 leading-relaxed">
                O Joga AI já está na Play Store — instala como qualquer outra app.
              </p>

              <a href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer" className="block mt-4">
                <JogaButton variant="primary" size="lg" className="w-full gap-2" data-testid="button-play-store">
                  <Download className="w-4.5 h-4.5" />
                  Descarregar no Google Play
                </JogaButton>
              </a>
            </JogaCard>

            <JogaCard variant="arena" padding="lg">
              <div className="flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-blue-300" />
                <p className="text-blue-300 text-[10px] font-black uppercase tracking-[0.18em]">
                  Não queres esperar?
                </p>
              </div>
              <p className="text-white text-sm mt-2 leading-relaxed">
                Usa já em{" "}
                <a href="https://jogaai.pt" className="text-emerald-400 underline underline-offset-2">
                  jogaai.pt
                </a>{" "}
                e adiciona ao ecrã principal — fica com ícone, funciona quase como a app.
              </p>
              <div className="mt-4 space-y-3">
                <StepRow number={1}>Abre jogaai.pt no Chrome.</StepRow>
                <StepRow number={2}>Toca no menu ⋮ (canto superior direito).</StepRow>
                <StepRow number={3}>Escolhe "Adicionar ao ecrã principal".</StepRow>
              </div>
            </JogaCard>
          </>
        ) : (
          <>
            <JogaCard variant="arena" padding="lg">
              <p className="text-emerald-300 text-[10px] font-black uppercase tracking-[0.18em]">
                Adicionar ao ecrã principal
              </p>
              <div className="mt-4 space-y-4">
                <StepRow number={1}>
                  Abre <strong className="text-white">jogaai.pt</strong> no Safari — tem de ser
                  Safari, o Chrome no iPhone não permite instalar.
                </StepRow>
                <StepRow number={2}>
                  <span className="inline-flex items-center gap-1.5">
                    Toca no botão Partilhar
                    <Share className="w-3.5 h-3.5 text-white/50 shrink-0" />
                    (o quadrado com a seta para cima, em baixo).
                  </span>
                </StepRow>
                <StepRow number={3}>
                  <span className="inline-flex items-center gap-1.5">
                    Desliza para baixo e toca em "Adicionar ao ecrã principal"
                    <Plus className="w-3.5 h-3.5 text-white/50 shrink-0" />
                  </span>
                </StepRow>
                <StepRow number={4}>
                  <span className="inline-flex items-center gap-1.5">
                    Toca em "Adicionar" no canto superior direito
                    <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  </span>
                </StepRow>
                <StepRow number={5}>
                  Fica um ícone igual a uma app, em ecrã inteiro — sem barra do Safari.
                </StepRow>
              </div>
            </JogaCard>

            <JogaCard variant="arena" padding="lg">
              <p className="text-white/50 text-sm leading-relaxed">
                É a mesma app, funciona igual. A app da Apple Store chega mais tarde.
              </p>
            </JogaCard>
          </>
        )}
      </div>
    </JogaPage>
  );
}
