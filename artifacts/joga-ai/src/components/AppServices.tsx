import { useEffect } from "react";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ProfileSetupGate } from "@/components/profile/ProfileSetupGate";
import { OnboardingGate } from "@/components/onboarding/OnboardingGate";
import { MatchVoteReminderModal } from "@/components/MatchVoteReminderModal";
import { ConsentBanner } from "@/components/ConsentBanner";
import { PushPermissionPrompt } from "@/components/PushPermissionPrompt";
import { initAppCheck } from "@/lib/firebase";
import { setupForegroundPushListener, requestPushPermission } from "@/lib/pushNotifications";
import { toast } from "@/hooks/use-toast";

/** Desligado: exchangeRecaptchaV3Token devolve 400 mesmo com par de chaves novo. */
const APP_CHECK_ENABLED = false;
// TODO: reativar quando App Check + reCAPTCHA v3 estiverem estáveis no projeto.
// Enquanto activo com token inválido, Firebase Installations falha e getToken() do FCM
// não grava em users/{uid}/fcmTokens.

function AppServicesInner() {
  const { userId, isLinked } = useAuth();

  useEffect(() => {
    if (APP_CHECK_ENABLED) initAppCheck();
  }, []);

  useEffect(() => {
    if (!isLinked || !userId) return;
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      void requestPushPermission(userId);
    }
    void setupForegroundPushListener(({ title, body }) => {
      toast({ title, description: body });
    });
  }, [isLinked, userId]);

  return (
    <>
      <ProfileSetupGate />
      <OnboardingGate />
      <MatchVoteReminderModal />
      <PushPermissionPrompt userId={userId} trigger={0} />
      <ConsentBanner />
    </>
  );
}

export function AppServices() {
  return <AppServicesInner />;
}
