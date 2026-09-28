/* Escolhe o repositório: Firebase quando as variáveis VITE_FIREBASE_* estão
   definidas no build; senão, o modo local (dados só neste navegador). */

import { criarRepositorioLocal } from "./local.js";

export const configFirebase = () => {
  const env = import.meta.env || {};
  const c = {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  };
  return c.apiKey && c.projectId ? { ...c, emuladores: env.VITE_FIREBASE_EMULADORES === "1" ? "127.0.0.1" : false } : null;
};

export async function criarRepositorio() {
  const cfg = configFirebase();
  if (cfg) {
    const { criarRepositorioFirebase } = await import("./firebase.js");
    return criarRepositorioFirebase(cfg);
  }
  return criarRepositorioLocal();
}
