import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfile } from "@/hooks/useUserProfile";
import { ProfileSetupDialog } from "./ProfileSetupDialog";

const SKIP_PATHS = ["/entrar", "/demo-carta"];
const SETUP_DISMISSED_KEY = "joga-ai-profile-setup-dismissed-v1";

function readDismissed(userId: string): boolean {
  try {
    const raw = localStorage.getItem(SETUP_DISMISSED_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as string[];
    return parsed.includes(userId);
  } catch {
    return false;
  }
}

function writeDismissed(userId: string) {
  try {
    const raw = localStorage.getItem(SETUP_DISMISSED_KEY);
    const parsed = raw ? (JSON.parse(raw) as string[]) : [];
    if (!parsed.includes(userId)) {
      localStorage.setItem(SETUP_DISMISSED_KEY, JSON.stringify([...parsed, userId]));
    }
  } catch {
    /* ignore */
  }
}

export function ProfileSetupGate() {
  const [location] = useLocation();
  const { isLinked, userId } = useAuth();
  const { needsSetup, loading, refresh, profile } = useUserProfile();
  const [dismissed, setDismissed] = useState(() => readDismissed(userId));

  useEffect(() => {
    if (profile.profileComplete) {
      setDismissed(false);
    }
  }, [profile.profileComplete]);

  const onEntrar = SKIP_PATHS.some((p) => location.startsWith(p));
  const open =
    isLinked &&
    !loading &&
    needsSetup &&
    !dismissed &&
    !onEntrar &&
    !profile.profileComplete;

  return (
    <ProfileSetupDialog
      open={open}
      dismissible={false}
      onOpenChange={(next) => {
        if (!next) {
          setDismissed(true);
          writeDismissed(userId);
        }
      }}
      onComplete={() => {
        setDismissed(false);
        void refresh();
      }}
    />
  );
}
