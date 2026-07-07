import { useEffect, useState } from "react";
import { useAuth, useUserId } from "@/contexts/AuthContext";
import { loadFirestoreAdminUids, resolveIsAppAdmin } from "@/lib/adminConfig";

export function useAppAdmin(): { isAdmin: boolean; loading: boolean } {
  const userId = useUserId();
  const { firebaseUser } = useAuth();
  const [firestoreUids, setFirestoreUids] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void loadFirestoreAdminUids().then((uids) => {
      if (!cancelled) {
        setFirestoreUids(uids);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const email = firebaseUser?.email ?? null;
  const isAdmin = resolveIsAppAdmin(userId, email, firestoreUids);

  return { isAdmin, loading };
}
