import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { User } from "firebase/auth";
import {
  ensureAnonymousAuth,
  onUserChanged,
  getLocalUserId,
  signInWithGoogle,
  loginWithEmail,
  registerWithEmail,
  resetPassword,
  logout,
  isAccountLinked,
} from "@/lib/auth";
import { markProfileAsLinked } from "@/lib/userRepository";
import { isFirebaseConfigured } from "@/lib/firebase";

type AuthState = {
  /** uid Firebase ou UUID local */
  userId: string;
  /** User Firebase (null se não configurado ou offline) */
  firebaseUser: User | null;
  /** true enquanto a auth está a ser inicializada */
  loading: boolean;
  /** true se a sessão Firebase está activa */
  isFirebase: boolean;
  /** true se a conta tem email/Google (não anónima) */
  isLinked: boolean;
  /** displayName do utilizador */
  displayName: string | null;
  /** Métodos de autenticação */
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Omit<AuthState,
    "signInWithGoogle" | "loginWithEmail" | "registerWithEmail" | "resetPassword" | "logout"
  >>({
    userId: getLocalUserId(),
    firebaseUser: null,
    loading: true,
    isFirebase: false,
    isLinked: false,
    displayName: null,
  });

  useEffect(() => {
    if (!isFirebaseConfigured()) {
      setState((s) => ({ ...s, loading: false }));
      return;
    }

    ensureAnonymousAuth().catch(console.warn);

    const unsubscribe = onUserChanged((user) => {
      const linked = user ? isAccountLinked() : false;
      if (user && linked) {
        markProfileAsLinked(user.uid).catch(console.warn);
      }
      setState({
        userId: user ? user.uid : getLocalUserId(),
        firebaseUser: user,
        loading: false,
        isFirebase: Boolean(user),
        isLinked: linked,
        displayName: user?.displayName ?? null,
      });
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
      await logout();
      setState((s) => ({
        ...s,
        userId: getLocalUserId(),
        firebaseUser: null,
        isFirebase: false,
        isLinked: false,
        displayName: null,
      }));
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
