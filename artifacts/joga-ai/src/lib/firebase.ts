import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";

/**
 * Firebase config — substitui com as tuas credenciais do Firebase Console.
 * Em produção, usa variáveis de ambiente Vite: VITE_FIREBASE_API_KEY, etc.
 *
 * Passos no Firebase Console:
 *  1. Criar projecto (ou usar existente)
 *  2. Adicionar aplicação Web
 *  3. Copiar firebaseConfig para aqui (ou para .env.local)
 *  4. Firestore → Criar base de dados (modo de teste para começar)
 *  5. Authentication → Habilitar "Anonymous"
 */
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? "",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? "",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? "",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? "",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? "",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID ?? "",
};

/** Evita re-inicialização em HMR */
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
export default app;

/** Retorna true se o Firebase está configurado (credenciais presentes) */
export function isFirebaseConfigured(): boolean {
  return Boolean(firebaseConfig.projectId && firebaseConfig.apiKey);
}
