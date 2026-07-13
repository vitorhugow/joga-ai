import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { JogaButton } from "@/components/joga";

export type OnboardingStep = {
  target: string;
  title: string;
  body: string;
};

type GuidedOnboardingProps = {
  steps: OnboardingStep[];
  stepIndex: number;
  onNext: () => void;
  onSkip: () => void;
};

type Rect = { top: number; left: number; width: number; height: number };

function useTargetRect(selector: string, stepIndex: number) {
  const [rect, setRect] = useState<Rect | null>(null);

  const measure = useCallback(() => {
    const el = document.querySelector(selector);
    if (!el) {
      setRect(null);
      return;
    }
    const box = el.getBoundingClientRect();
    const pad = 6;
    setRect({
      top: box.top - pad,
      left: box.left - pad,
      width: box.width + pad * 2,
      height: box.height + pad * 2,
    });
  }, [selector]);

  useLayoutEffect(() => {
    measure();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const delay = reduced ? 0 : 80;
    const t = window.setTimeout(measure, delay);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [measure, stepIndex]);

  return rect;
}

export function GuidedOnboarding({
  steps,
  stepIndex,
  onNext,
  onSkip,
}: GuidedOnboardingProps) {
  const step = steps[stepIndex];
  const rect = useTargetRect(step?.target ?? "", stepIndex);
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isLast = stepIndex >= steps.length - 1;

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  if (!step) return null;

  const balloonStyle: React.CSSProperties = rect
    ? {
        position: "fixed",
        left: Math.min(Math.max(16, rect.left), window.innerWidth - 280),
        top: rect.top > window.innerHeight * 0.45
          ? Math.max(16, rect.top - 140)
          : rect.top + rect.height + 12,
        maxWidth: 280,
        zIndex: 10002,
      }
    : {
        position: "fixed",
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
        maxWidth: 280,
        zIndex: 10002,
      };

  return createPortal(
    <div className="fixed inset-0 z-[10000]" role="dialog" aria-modal="true" aria-label="Tutorial">
      <div
        className="absolute inset-0"
        style={{ background: "rgba(0,0,0,0.72)" }}
        onClick={onSkip}
        aria-hidden
      />

      {rect && (
        <div
          className="pointer-events-none fixed rounded-2xl"
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.72)",
            border: "2px solid rgba(74,222,128,0.65)",
            zIndex: 10001,
            transition: reducedMotion ? "none" : "top 0.2s ease, left 0.2s ease, width 0.2s ease, height 0.2s ease",
          }}
          data-testid="onboarding-spotlight"
        />
      )}

      <div
        className="rounded-2xl p-4"
        style={{
          ...balloonStyle,
          background: "#0f1628",
          border: "1px solid rgba(74,222,128,0.25)",
          boxShadow: "0 12px 40px rgba(0,0,0,0.45)",
          transition: reducedMotion ? "none" : "top 0.2s ease, left 0.2s ease",
        }}
        data-testid="onboarding-balloon"
      >
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-400/80 mb-1">
          {stepIndex + 1} / {steps.length}
        </p>
        <h3 className="font-display font-black text-white text-lg leading-tight">{step.title}</h3>
        <p className="text-white/55 text-sm mt-1.5 leading-relaxed">{step.body}</p>

        <div className="flex gap-2 mt-4">
          <JogaButton variant="ghost" size="sm" className="flex-1" onClick={onSkip} data-testid="onboarding-skip">
            Saltar
          </JogaButton>
          <JogaButton variant="primary" size="sm" className="flex-1" onClick={onNext} data-testid="onboarding-next">
            {isLast ? "Concluir" : "Seguinte"}
          </JogaButton>
        </div>
      </div>
    </div>,
    document.body,
  );
}
