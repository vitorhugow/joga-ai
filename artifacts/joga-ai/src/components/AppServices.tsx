import { useEffect } from "react";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ProfileSetupGate } from "@/components/profile/ProfileSetupGate";
import { MatchVoteReminderModal } from "@/components/MatchVoteReminderModal";
import { ConsentBanner } from "@/components/ConsentBanner";
import { PushPermissionPrompt } from "@/components/PushPermissionPrompt";
import { initAppCheck } from "@/lib/firebase";
import { setupForegroundPushListener, requestPushPermission } from "@/lib/pushNotifications";
import { toast } from "@/hooks/use-toast";

function AppServicesInner() {
  const { userId, isLinked } = useAuth();

  useEffect(() => {
    initAppCheck();
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
      <MatchVoteReminderModal />
      <PushPermissionPrompt userId={userId} trigger={0} />
      <ConsentBanner />
    </>
  );
}

export function AppServices() {
  return <AppServicesInner />;
}
