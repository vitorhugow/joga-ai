import { useState, type FormEvent } from "react";
import { Loader2, Mail } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { waitForAccountLinked } from "@/lib/auth";
import { JogaButton, JogaCard } from "@/components/joga";

function GoogleIcon() {
  return (
    <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

function mapAuthError(code: string): string {
  if (code.includes("auth/invalid-email")) return "Email inválido.";
  if (code.includes("auth/wrong-password") || code.includes("auth/invalid-credential")) {
    return "Email ou password incorrectos.";
  }
  if (code.includes("auth/email-already-in-use")) return "Este email já está registado.";
  if (code.includes("auth/weak-password")) return "A password deve ter pelo menos 6 caracteres.";
  if (code.includes("auth/popup-closed-by-user")) return "Login cancelado.";
  if (code.includes("auth/too-many-requests")) return "Muitas tentativas. Tenta mais tarde.";
  return "Não foi possível entrar. Tenta outra vez.";
}

type LoginPanelProps = {
  onSuccess?: () => void;
  compact?: boolean;
  bare?: boolean;
  initialMode?: "login" | "register";
};

export function LoginPanel({ onSuccess, compact = false, bare = false, initialMode = "login" }: LoginPanelProps) {
  const { signInWithGoogle, loginWithEmail, registerWithEmail, resetPassword } = useAuth();

  const [mode, setMode] = useState<"login" | "register">(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState<"google" | "email" | "reset" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);

  async function handleGoogle() {
    setError(null);
    setLoading("google");
    try {
      await signInWithGoogle();
      await waitForAccountLinked();
      onSuccess?.();
    } catch (err) {
      setError(mapAuthError(String((err as { code?: string })?.code ?? err)));
    } finally {
      setLoading(null);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setResetSent(false);

    if (!email.trim()) {
      setError("Introduz o teu email.");
      return;
    }
    if (password.length < 6) {
      setError("A password deve ter pelo menos 6 caracteres.");
      return;
    }

    setLoading("email");
    try {
      if (mode === "register") {
        await registerWithEmail(email.trim(), password, name.trim() || undefined);
      } else {
        await loginWithEmail(email.trim(), password);
      }
      await waitForAccountLinked();
      onSuccess?.();
    } catch (err) {
      setError(mapAuthError(String((err as { code?: string })?.code ?? err)));
    } finally {
      setLoading(null);
    }
  }

  async function handleReset() {
    if (!email.trim()) {
      setError("Introduz o teu email para recuperar a password.");
      return;
    }
    setError(null);
    setLoading("reset");
    try {
      await resetPassword(email.trim());
      setResetSent(true);
    } catch (err) {
      setError(mapAuthError(String((err as { code?: string })?.code ?? err)));
    } finally {
      setLoading(null);
    }
  }

  const formContent = (
    <>
      <JogaButton
        type="button"
        variant="gold"
        size="lg"
        className="w-full gap-3"
        disabled={loading !== null}
        onClick={handleGoogle}
      >
        {loading === "google" ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <GoogleIcon />
        )}
        Continuar com Google
      </JogaButton>

      <div className="flex items-center gap-3 my-5">
        <div className="flex-1 h-px bg-white/10" />
        <span className="text-white/35 text-xs font-semibold uppercase tracking-wider">ou email</span>
        <div className="flex-1 h-px bg-white/10" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        {mode === "register" && (
          <label className="block">
            <span className="text-white/50 text-xs font-semibold uppercase tracking-wider mb-1.5 block">
              Nome
            </span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Como te chamam na pelada"
              className="w-full rounded-xl border border-white/12 bg-white/6 px-4 py-3 text-white placeholder:text-white/30 outline-none focus:border-emerald-400/40"
              autoComplete="name"
            />
          </label>
        )}

        <label className="block">
          <span className="text-white/50 text-xs font-semibold uppercase tracking-wider mb-1.5 block">
            Email
          </span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@email.com"
            className="w-full rounded-xl border border-white/12 bg-white/6 px-4 py-3 text-white placeholder:text-white/30 outline-none focus:border-emerald-400/40"
            autoComplete="email"
            required
          />
        </label>

        <label className="block">
          <span className="text-white/50 text-xs font-semibold uppercase tracking-wider mb-1.5 block">
            Password
          </span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Mínimo 6 caracteres"
            className="w-full rounded-xl border border-white/12 bg-white/6 px-4 py-3 text-white placeholder:text-white/30 outline-none focus:border-emerald-400/40"
            autoComplete={mode === "register" ? "new-password" : "current-password"}
            required
            minLength={6}
          />
        </label>

        {error && (
          <p className="text-red-400 text-sm font-medium" role="alert">
            {error}
          </p>
        )}

        {resetSent && (
          <p className="text-emerald-400 text-sm font-medium">
            Enviámos um email para recuperares a password.
          </p>
        )}

        <JogaButton
          type="submit"
          variant="primary"
          size="lg"
          className="w-full gap-2"
          disabled={loading !== null}
        >
          {loading === "email" ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Mail className="w-5 h-5" />
          )}
          {mode === "register" ? "Criar conta grátis" : "Entrar com email"}
        </JogaButton>
      </form>

      <div className="mt-4 flex flex-col items-center gap-2 text-center">
        <button
          type="button"
          className="text-white/45 text-sm joga-tap hover:text-white/70 transition-colors"
          onClick={() => {
            setMode((m) => (m === "login" ? "register" : "login"));
            setError(null);
          }}
        >
          {mode === "login" ? "Ainda não tens conta? Criar conta" : "Já tens conta? Entrar"}
        </button>

        {mode === "login" && (
          <button
            type="button"
            className="text-emerald-400/70 text-sm joga-tap hover:text-emerald-300 transition-colors"
            disabled={loading !== null}
            onClick={handleReset}
          >
            {loading === "reset" ? "A enviar..." : "Esqueci a password"}
          </button>
        )}
      </div>

      <p className="text-white/30 text-[11px] text-center mt-4 leading-relaxed">
        Grátis para começar · Sem cartão · Os teus dados ficam guardados na cloud
      </p>
    </>
  );

  if (bare) {
    return <div className="space-y-0">{formContent}</div>;
  }

  return (
    <JogaCard variant="arena" padding={compact ? "md" : "lg"} className="border-emerald-400/20">
      {formContent}
    </JogaCard>
  );
}
