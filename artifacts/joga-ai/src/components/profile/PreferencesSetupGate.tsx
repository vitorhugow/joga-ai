import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfile } from "@/hooks/useUserProfile";
import { PreferencesSetupDialog } from "./PreferencesSetupDialog";

const SKIP_PATHS = ["/entrar", "/demo-carta"];

export function PreferencesSetupGate() {
  const [location] = useLocation();
  const { isLinked, userId } = useAuth();
  const { profile, loading, refresh } = useUserProfile();

  const onSkipPath = SKIP_PATHS.some((p) => location.startsWith(p));
  const open =
    isLinked &&
    Boolean(userId) &&
    !loading &&
    profile.profileComplete &&
    !profile.preferencesPromptCompleted &&
    !onSkipPath;

  return (
    <PreferencesSetupDialog
      open={open}
      profile={profile}
      onComplete={() => {
        void refresh();
      }}
    />
  );
}
