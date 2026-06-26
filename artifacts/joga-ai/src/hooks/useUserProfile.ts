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

  const [profile, setProfile] = useState<UserProfile>(
    () => getCachedProfile(userId) ?? seed,
  );
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const cached = getCachedProfile(userId);
    if (cached) setProfile(cached);
    const next = await loadUserProfile(userId, seed);
    setProfile(next);
    return next;
  }, [userId, seed]);

  useEffect(() => {
    if (authLoading) return;
    setLoading(true);
    loadUserProfile(userId, seed)
      .then(setProfile)
      .finally(() => setLoading(false));
  }, [userId, seed, authLoading]);

  return {
    profile,
    loading: authLoading || loading,
    refresh,
    needsSetup: !profile.profileComplete,
  };
}
