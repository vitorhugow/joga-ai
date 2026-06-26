import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfile } from "@/hooks/useUserProfile";
import { ProfileSetupDialog } from "./ProfileSetupDialog";

const SKIP_PATHS = ["/entrar", "/demo-carta"];

export function ProfileSetupGate() {
  const [location] = useLocation();
  const { isLinked } = useAuth();
  const { needsSetup, loading, refresh } = useUserProfile();
  const [dismissed, setDismissed] = useState(false);

  const onEntrar = SKIP_PATHS.some((p) => location.startsWith(p));
  // Só utilizadores com conta real (não anónimos) montam carta
  const open = isLinked && !loading && needsSetup && !dismissed && !onEntrar;

  return (
    <ProfileSetupDialog
      open={open}
      dismissible={false}
      onOpenChange={(next) => {
        if (!next) setDismissed(true);
      }}
      onComplete={() => {
        setDismissed(false);
        void refresh();
      }}
    />
  );
}
