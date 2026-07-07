import { useEffect, useState } from "react";
import { useUserId } from "@/contexts/AuthContext";
import { getEnvAdminUids, isUidAppAdmin, loadFirestoreAdminUids } from "@/lib/adminConfig";

export function useAppAdmin(): { isAdmin: boolean; loading: boolean } {
  const userId = useUserId();
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

  const adminUids = [...new Set([...getEnvAdminUids(), ...firestoreUids])];
  return {
    isAdmin: isUidAppAdmin(userId, adminUids),
    loading,
  };
}
