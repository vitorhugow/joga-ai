import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { AuthModal } from "@/components/auth/AuthModal";
import { toast } from "@/hooks/use-toast";

type OpenAuthOptions = {
  mode?: "login" | "register";
  title?: string;
  description?: string;
  /** Caminho para navegar automaticamente assim que o login/registo tiver sucesso */
  redirectTo?: string;
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
  const loadingToastShown = useRef(false);

  const openAuth = useCallback((opts?: OpenAuthOptions) => {
    setOptions(opts ?? {});
    setOpen(true);
  }, []);

  const requireLinked = useCallback(
    (opts?: OpenAuthOptions) => {
      if (authLoading) {
        if (!loadingToastShown.current) {
          loadingToastShown.current = true;
          toast({
            title: "A carregar sessão…",
            description: "Aguarda um momento e tenta outra vez.",
          });
          window.setTimeout(() => {
            loadingToastShown.current = false;
          }, 3000);
        }
        return false;
      }
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
        onSuccess={(accountSwitched) => {
          setOpen(false);
          // Sem redirect quando trocou de conta: a pessoa "criou conta" ou
          // "entrou" mas o email já pertencia a outra conta real — o que
          // tinha montado (ex: carta anónima) ficou só neste dispositivo,
          // não passou para essa conta. Arrastá-la de imediato para
          // redirectTo (ex: /perfil) escondia essa informação antes de dar
          // tempo ao toast aparecer. Fica onde estava, toast visível (o
          // <Toaster/> vive na raiz da app, sobrevive ao fecho do modal),
          // livre para navegar ela própria.
          if (options.redirectTo && !accountSwitched) {
            window.location.href = options.redirectTo;
          }
        }}
      />
    </AuthGateContext.Provider>
  );
}

export function useAuthGate() {
  return useContext(AuthGateContext);
}
