import { useCallback, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfile } from "@/hooks/useUserProfile";
import { markOnboardingDone } from "@/lib/userRepository";
import { GuidedOnboarding, type OnboardingStep } from "./GuidedOnboarding";

const ONBOARDING_LS_KEY = "joga-ai-onboarding-done-v1";

const STEPS: OnboardingStep[] = [
  {
    target: '[data-onboarding="find-games"]',
    title: "Encontrar jogos",
    body: "Vê jogos abertos perto de ti e confirma presença num toque.",
  },
  {
    target: '[data-onboarding="create-match"]',
    title: "Criar pelada",
    body: "Organiza a tua partida — data, campo, vagas e equipas.",
  },
  {
    target: '[data-onboarding="profile"]',
    title: "Perfil e carta",
    body: "A tua carta evolui a cada jogo. Consulta stats e OVR aqui.",
  },
];

function readLocalDone(userId: string): boolean {
  try {
    const raw = localStorage.getItem(ONBOARDING_LS_KEY);
    if (!raw) return false;
    return (JSON.parse(raw) as string[]).includes(userId);
  } catch {
    return false;
  }
}

function writeLocalDone(userId: string) {
  try {
    const raw = localStorage.getItem(ONBOARDING_LS_KEY);
    const parsed = raw ? (JSON.parse(raw) as string[]) : [];
    if (!parsed.includes(userId)) {
      localStorage.setItem(ONBOARDING_LS_KEY, JSON.stringify([...parsed, userId]));
    }
  } catch {
    /* ignore */
  }
}

export function OnboardingGate() {
  const [location] = useLocation();
  const { isLinked, userId } = useAuth();
  const { profile, loading, refresh } = useUserProfile();
  const [stepIndex, setStepIndex] = useState(0);
  const [dismissed, setDismissed] = useState(() => readLocalDone(userId));

  const onHome = location === "/";
  const alreadyDone = Boolean(profile.onboardingDone) || dismissed;
  const open =
    isLinked &&
    Boolean(userId) &&
    !loading &&
    profile.profileComplete &&
    !alreadyDone &&
    onHome;

  const finish = useCallback(async () => {
    setDismissed(true);
    writeLocalDone(userId);
    try {
      await markOnboardingDone(userId, !isLinked);
      if (isLinked) await refresh();
    } catch {
      /* local fallback already written */
    }
  }, [userId, isLinked, refresh]);

  if (!open) return null;

  return (
    <GuidedOnboarding
      steps={STEPS}
      stepIndex={stepIndex}
      onSkip={() => void finish()}
      onNext={() => {
        if (stepIndex >= STEPS.length - 1) {
          void finish();
        } else {
          setStepIndex((i) => i + 1);
        }
      }}
    />
  );
}
