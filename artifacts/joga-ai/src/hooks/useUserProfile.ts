import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  createIncompleteSeedProfile,
  getCachedProfile,
  loadUserProfile,
  type UserProfile,
} from "@/lib/userRepository";

export function useUserProfile() {
  const { userId, isLinked, loading: authLoading } = useAuth();
  const seed = useMemo(
    () => createIncompleteSeedProfile(userId, !isLinked),
    [userId, isLinked],
  );

  const [profile, setProfile] = useState<UserProfile>(() =>
    createIncompleteSeedProfile("", true),
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading || !userId) return;
    const cached = getCachedProfile(userId);
    if (cached && !isLinked) setProfile(cached);
  }, [authLoading, userId, isLinked]);

  const refresh = useCallback(async () => {
    const next = await loadUserProfile(userId, seed, { preferRemote: isLinked });
    setProfile(next);
    return next;
  }, [userId, seed, isLinked]);

  useEffect(() => {
    if (authLoading || !userId) return;
    setLoading(true);
    loadUserProfile(userId, seed, { preferRemote: isLinked })
      .then(setProfile)
      .finally(() => setLoading(false));
  }, [userId, seed, authLoading, isLinked]);

  return {
    profile,
    loading: authLoading || loading,
    refresh,
    needsSetup: !profile.profileComplete,
  };
}
