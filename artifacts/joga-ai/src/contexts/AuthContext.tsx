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
  /** accountSwitched: true quando entrou numa conta real já existente em vez de ligar a sessão anónima — ver EmailAuthResult em lib/auth.ts */
  loginWithEmail: (email: string, password: string) => Promise<{ accountSwitched: boolean }>;
  /** accountSwitched: idem, mas no fluxo de registo (a "conta nova" afinal já existia) */
  registerWithEmail: (email: string, password: string, name?: string) => Promise<{ accountSwitched: boolean }>;
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
  loginWithEmail: async () => ({ accountSwitched: false }),
  registerWithEmail: async () => ({ accountSwitched: false }),
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
  // Último uid anónimo visto nesta sessão do browser. `localUserIdRef` é um
  // UUID de fallback (só usado quando o Firebase não está configurado) —
  // nunca coincide com o uid da sessão anónima real do Firebase, por isso
  // não serve para encontrar o perfil local que "Montar carta" gravou sob
  // esse uid. onAuthStateChanged dispara uma vez para a sessão anónima e
  // de novo para a conta real — capturamos aqui na primeira, para termos o
  // valor certo disponível quando a segunda invocação tentar migrar.
  const lastAnonUidRef = useRef<string | null>(null);

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

    const unsubscribe = onUserChanged((user) => {
      void (async () => {
        if (!bootstrappedRef.current) {
          bootstrappedRef.current = true;
          await handleGoogleRedirectResult();
          if (!auth.currentUser && !user) {
            await signInAnonymousSession();
            return;
          }
        }

        const current = auth.currentUser ?? user;

        if (current?.isAnonymous) {
          lastAnonUidRef.current = current.uid;
        }

        // Actualiza o estado de auth IMEDIATAMENTE. `waitForAccountLinked()`
        // (usado pelo LoginPanel para saber quando fechar/navegar após o
        // login) resolve através do seu PRÓPRIO onAuthStateChanged, mais
        // rápido do que este — se os efeitos secundários abaixo (migração de
        // perfil local, notificações pendentes) corressem ANTES do setState,
        // a app navegava para a página seguinte ainda a mostrar "sem sessão"
        // até um refresh manual.
        setState(applyUserState(current, localUserIdRef.current));

        if (current && !current.isAnonymous) {
          void migrateLocalProfileIfNeeded(
            lastAnonUidRef.current ?? localUserIdRef.current,
            current.uid,
          );
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
      })();
    });

    return unsubscribe;
  }, []);

  const value: AuthState = {
    ...state,
    signInWithGoogle: async () => {
      await signInWithGoogle();
    },
    loginWithEmail: async (email, password) => {
      const { accountSwitched } = await loginWithEmail(email, password);
      return { accountSwitched };
    },
    registerWithEmail: async (email, password, name) => {
      const { accountSwitched } = await registerWithEmail(email, password, name);
      return { accountSwitched };
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
