import {
  signInAnonymously,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  linkWithPopup,
  linkWithCredential,
  EmailAuthProvider,
  GoogleAuthProvider,
  updateProfile,
  onAuthStateChanged,
  signOut,
  type User,
  type UserCredential,
} from "firebase/auth";
import { auth, isFirebaseConfigured } from "./firebase";

const LS_ANON_ID_KEY = "joga-ai-current-user-id-v3";

const googleProvider = new GoogleAuthProvider();

export class AuthAccountSwitchError extends Error {
  constructor(message = "Esta conta Google já existe. Os dados da sessão anterior podem não transferir.") {
    super(message);
    this.name = "AuthAccountSwitchError";
  }
}

// ─── Sessão anónima ───────────────────────────────────────────────────────────

/**
 * Inicia sessão anónima no Firebase.
 * Retorna o uid Firebase ou, se o Firebase não estiver configurado,
 * cai de volta para o UUID local em localStorage.
 */
export async function ensureAnonymousAuth(): Promise<string> {
  if (!isFirebaseConfigured()) return getLocalUserId();

  try {
    if (auth.currentUser) return auth.currentUser.uid;
    const cred = await signInAnonymously(auth);
    return cred.user.uid;
  } catch (err) {
    console.warn("[auth] signInAnonymously falhou, usando UUID local:", err);
    return getLocalUserId();
  }
}

// ─── Login Google ─────────────────────────────────────────────────────────────

/**
 * Abre popup Google Sign-In.
 * Se o utilizador era anónimo, faz upgrade da conta (preserva dados).
 */
export async function signInWithGoogle(): Promise<UserCredential> {
  if (!isFirebaseConfigured()) throw new Error("Firebase não configurado");

  if (auth.currentUser?.isAnonymous) {
    try {
      return await linkWithPopup(auth.currentUser, googleProvider);
    } catch (err) {
      const code = (err as { code?: string })?.code ?? "";
      if (code === "auth/credential-already-in-use" || code === "auth/email-already-in-use") {
        throw new AuthAccountSwitchError();
      }
      throw err;
    }
  }

  return signInWithPopup(auth, googleProvider);
}

// ─── Login Email/Password ─────────────────────────────────────────────────────

/** Regista nova conta com email + password */
export async function registerWithEmail(
  email: string,
  password: string,
  displayName?: string,
): Promise<UserCredential> {
  if (!isFirebaseConfigured()) throw new Error("Firebase não configurado");

  let cred: UserCredential;

  if (auth.currentUser?.isAnonymous) {
    // Upgrade preserva o mesmo uid Firebase → perfil e partidas mantêm-se
    const credential = EmailAuthProvider.credential(email, password);
    cred = await linkWithCredential(auth.currentUser, credential);
  } else {
    cred = await createUserWithEmailAndPassword(auth, email, password);
  }

  if (displayName) {
    await updateProfile(cred.user, { displayName });
  }

  return cred;
}

/** Login com email + password */
export async function loginWithEmail(
  email: string,
  password: string,
): Promise<UserCredential> {
  if (!isFirebaseConfigured()) throw new Error("Firebase não configurado");

  if (auth.currentUser?.isAnonymous) {
    const credential = EmailAuthProvider.credential(email, password);
    try {
      return await linkWithCredential(auth.currentUser, credential);
    } catch (err) {
      const code = (err as { code?: string })?.code ?? "";
      if (code === "auth/credential-already-in-use" || code === "auth/email-already-in-use") {
        throw new AuthAccountSwitchError();
      }
      throw err;
    }
  }

  return signInWithEmailAndPassword(auth, email, password);
}

/** Aguarda a sessão deixar de ser anónima (após login/registo) */
export function waitForAccountLinked(timeoutMs = 8000): Promise<boolean> {
  if (!isFirebaseConfigured()) return Promise.resolve(false);
  if (isAccountLinked()) return Promise.resolve(true);

  return new Promise((resolve) => {
    const timeout = window.setTimeout(() => {
      unsub();
      resolve(isAccountLinked());
    }, timeoutMs);

    const unsub = onAuthStateChanged(auth, (user) => {
      if (user && !user.isAnonymous) {
        window.clearTimeout(timeout);
        unsub();
        resolve(true);
      }
    });
  });
}

/** Envia email de recuperação de password */
export async function resetPassword(email: string): Promise<void> {
  if (!isFirebaseConfigured()) throw new Error("Firebase não configurado");
  return sendPasswordResetEmail(auth, email);
}

// ─── Logout ───────────────────────────────────────────────────────────────────

export async function logout(): Promise<void> {
  if (!isFirebaseConfigured()) return;
  await signOut(auth);
  try {
    await signInAnonymously(auth);
  } catch (err) {
    console.warn("[auth] signInAnonymously após logout:", err);
  }
}

/** Só usar quando onAuthStateChanged devolver user === null */
export async function signInAnonymousSession(): Promise<string> {
  if (!isFirebaseConfigured()) return getLocalUserId();
  if (auth.currentUser) return auth.currentUser.uid;
  try {
    const cred = await signInAnonymously(auth);
    return cred.user.uid;
  } catch (err) {
    console.warn("[auth] signInAnonymousSession falhou:", err);
    return getLocalUserId();
  }
}

// ─── Helpers síncronos ────────────────────────────────────────────────────────

/**
 * UUID persistido em localStorage — fallback quando Firebase não está configurado
 * ou quando não há rede.
 */
export function getLocalUserId(): string {
  const existing = localStorage.getItem(LS_ANON_ID_KEY);
  if (existing) return existing;
  const created = `user-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  localStorage.setItem(LS_ANON_ID_KEY, created);
  return created;
}

/**
 * Retorna o uid actual (Firebase ou local) de forma síncrona.
 * Usa Firebase se autenticado, caso contrário localStorage.
 */
export function getCurrentUserId(): string {
  if (isFirebaseConfigured() && auth.currentUser) {
    return auth.currentUser.uid;
  }
  return getLocalUserId();
}

/** Retorna o displayName do utilizador actual */
export function getCurrentUserName(): string | null {
  return auth.currentUser?.displayName ?? null;
}

/** Retorna true se a conta foi criada via Google ou Email (não anónima) */
export function isAccountLinked(): boolean {
  return Boolean(auth.currentUser && !auth.currentUser.isAnonymous);
}

/** Observa mudanças de auth e executa callback */
export function onUserChanged(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}
