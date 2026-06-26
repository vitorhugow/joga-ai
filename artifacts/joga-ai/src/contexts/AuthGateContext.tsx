import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { AuthModal } from "@/components/auth/AuthModal";

type OpenAuthOptions = {
  mode?: "login" | "register";
  title?: string;
  description?: string;
};

type AuthGateContextValue = {
  isLinked: boolean;
  /** Abre o modal de login/registo */
  openAuth: (options?: OpenAuthOptions) => void;
  /** Se não estiver com conta ligada, abre o modal e devolve false */
  requireLinked: (options?: OpenAuthOptions) => boolean;
};

const AuthGateContext = createContext<AuthGateContextValue>({
  isLinked: false,
  openAuth: () => {},
  requireLinked: () => false,
});

export function AuthGateProvider({ children }: { children: ReactNode }) {
  const { isLinked, loading: authLoading } = useAuth();
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<OpenAuthOptions>({});

  const openAuth = useCallback((opts?: OpenAuthOptions) => {
    setOptions(opts ?? {});
    setOpen(true);
  }, []);

  const requireLinked = useCallback(
    (opts?: OpenAuthOptions) => {
      if (authLoading) return false;
      if (isLinked) return true;
      openAuth(opts);
      return false;
    },
    [authLoading, isLinked, openAuth],
  );

  return (
    <AuthGateContext.Provider value={{ isLinked, openAuth, requireLinked }}>
      {children}
      <AuthModal
        open={open}
        onOpenChange={setOpen}
        initialMode={options.mode ?? "register"}
        title={options.title}
        description={options.description}
        onSuccess={() => setOpen(false)}
      />
    </AuthGateContext.Provider>
  );
}

export function useAuthGate() {
  return useContext(AuthGateContext);
}
