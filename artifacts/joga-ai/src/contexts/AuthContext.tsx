import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { User } from "firebase/auth";
import {
  onUserChanged,
  getLocalUserId,
  signInWithGoogle,
  handleGoogleRedirectResult,
  loginWithEmail,
  registerWithEmail,
  resetPassword,
  logout,
  isAccountLinked,
  signInAnonymousSession,
} from "@/lib/auth";
import { removePushToken } from "@/lib/pushNotifications";
import { markProfileAsLinked, migrateLocalProfileIfNeeded } from "@/lib/userRepository";
import { syncProfileEmail } from "@/lib/adminRepository";
import { processPendingRatings } from "@/lib/ratingsRelease";
import { processPendingNotifications } from "@/lib/notificationsRepository";
import {
  claimGuestCard,
  parseGuestClaimParam,
  storePendingGuestClaim,
  consumePendingGuestClaim,
} from "@/lib/guestClaimRepository";
import { isFirebaseConfigured, auth } from "@/lib/firebase";

type AuthState = {
  userId: string;
  firebaseUser: User | null;
  loading: boolean;
  isFirebase: boolean;
  isLinked: boolean;
  displayName: string | null;
  signInWithGoogle: () => Promise<void>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (email: string, password: string, name?: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState>({
  userId: "",
  firebaseUser: null,
  loading: true,
  isFirebase: false,
  isLinked: false,
  displayName: null,
  signInWithGoogle: async () => {},
  loginWithEmail: async () => {},
  registerWithEmail: async () => {},
  resetPassword: async () => {},
  logout: async () => {},
});

function applyUserState(user: User | null, localUserId: string) {
  const linked = user ? isAccountLinked() : false;
  if (user && linked) {
    markProfileAsLinked(user.uid).catch(console.warn);
    if (user.email) {
      void syncProfileEmail(user.uid, user.email);
    }
  }
  return {
    userId: user ? user.uid : localUserId,
    firebaseUser: user,
    loading: false,
    isFirebase: Boolean(user),
    isLinked: linked,
    displayName: user?.displayName ?? null,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const localUserIdRef = useRef(getLocalUserId());
  const bootstrappedRef = useRef(false);

  const [state, setState] = useState<Omit<AuthState,
    "signInWithGoogle" | "loginWithEmail" | "registerWithEmail" | "resetPassword" | "logout"
  >>({
    userId: localUserIdRef.current,
    firebaseUser: null,
    loading: true,
    isFirebase: false,
    isLinked: false,
    displayName: null,
  });

  useEffect(() => {
    if (!isFirebaseConfigured()) {
      setState((s) => ({ ...s, loading: false, userId: localUserIdRef.current }));
      return;
    }

    const unsubscribe = onUserChanged(async (user) => {
      if (!bootstrappedRef.current) {
        bootstrappedRef.current = true;
        await handleGoogleRedirectResult();
        if (!auth.currentUser && !user) {
          await signInAnonymousSession();
          return;
        }
      }

      const current = auth.currentUser ?? user;
      if (current && !current.isAnonymous) {
        await migrateLocalProfileIfNeeded(localUserIdRef.current, current.uid);
        void processPendingRatings(current.uid);
        void processPendingNotifications(current.uid);

        const pendingClaim = consumePendingGuestClaim();
        if (pendingClaim) {
          const token = parseGuestClaimParam(pendingClaim);
          if (token) {
            void claimGuestCard(current.uid, token);
          }
        }
      }

      const claimParam = new URLSearchParams(window.location.search).get("claim");
      if (current && !current.isAnonymous && claimParam?.startsWith("guest-")) {
        const token = parseGuestClaimParam(claimParam);
        if (token) {
          void claimGuestCard(current.uid, token);
        }
      } else if (claimParam?.startsWith("guest-")) {
        storePendingGuestClaim(claimParam);
      }

      setState(applyUserState(current, localUserIdRef.current));
    });

    return unsubscribe;
  }, []);

  const value: AuthState = {
    ...state,
    signInWithGoogle: async () => {
      await signInWithGoogle();
    },
    loginWithEmail: async (email, password) => {
      await loginWithEmail(email, password);
    },
    registerWithEmail: async (email, password, name) => {
      await registerWithEmail(email, password, name);
    },
    resetPassword: async (email) => {
      await resetPassword(email);
    },
    logout: async () => {
      const uid = auth.currentUser?.uid;
      if (uid) await removePushToken(uid);
      await logout();
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

export function useUserId(): string {
  return useContext(AuthContext).userId;
}
