/* Quem é o aluno logado, e os serviços do Firebase que o módulo usa.

   Com Firebase: a conta do Firebase Auth (a mesma sessão da plataforma; o
   módulo só lê). Se a plataforma não tiver inicializado o Firebase, o
   módulo inicializa sozinho, com a mesma configuração do ambiente.

   Sem Firebase (demonstração): a sessão local da plataforma. É o único
   ponto em que o módulo lê algo dela; se ela mudar, basta ajustar
   CHAVE_SESSAO_DEMONSTRACAO. */

export const CHAVE_SESSAO_DEMONSTRACAO = "aprova:sessao:v3";

// a mesma configuração que a plataforma lê do ambiente (copiada de propósito:
// o módulo não importa nada da plataforma)
export function configFirebase() {
  const env = import.meta.env || {};
  const c = {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  };
  return c.apiKey && c.projectId ? { cfg: c, emuladores: env.VITE_FIREBASE_EMULADORES === "1" } : null;
}

let servicos = null;
export async function servicosFirebase() {
  if (servicos) return servicos;
  const config = configFirebase();
  if (!config) return null;
  const [{ getApp, getApps, initializeApp }, auth, fs, st] = await Promise.all([
    import("firebase/app"), import("firebase/auth"), import("firebase/firestore"), import("firebase/storage"),
  ]);
  const jaExistia = getApps().length > 0;
  const app = jaExistia ? getApp() : initializeApp(config.cfg);
  let db;
  if (jaExistia) db = fs.getFirestore(app);
  else {
    const cache = typeof indexedDB !== "undefined" ? { localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }) } : {};
    db = fs.initializeFirestore(app, { ignoreUndefinedProperties: true, ...cache });
  }
  const a = auth.getAuth(app);
  const storage = st.getStorage(app);
  // quem inicializou conecta os emuladores (se foi a plataforma, ela já conectou)
  if (!jaExistia && config.emuladores) {
    auth.connectAuthEmulator(a, "http://127.0.0.1:9099", { disableWarnings: true });
    fs.connectFirestoreEmulator(db, "127.0.0.1", 8080);
    st.connectStorageEmulator(storage, "127.0.0.1", 9199);
  }
  servicos = { app, auth: a, db, storage, onAuthStateChanged: auth.onAuthStateChanged };
  return servicos;
}

function uidDemonstracao() {
  try { return JSON.parse(localStorage.getItem(CHAVE_SESSAO_DEMONSTRACAO))?.uid || null; } catch { return null; }
}

/* cb({ uid, modo }) sempre que a sessão mudar; uid null = ninguém logado */
export function observarAluno(cb) {
  let parar = () => {};
  let vivo = true;
  if (configFirebase()) {
    servicosFirebase().then((s) => {
      if (!vivo) return;
      parar = s.onAuthStateChanged(s.auth, (u) => cb({ uid: u?.uid || null, modo: "firebase" }));
    });
  } else {
    queueMicrotask(() => { if (vivo) cb({ uid: uidDemonstracao(), modo: "demonstracao" }); });
    // login ou saída em outra aba
    const aoMudar = (e) => { if (e.key === CHAVE_SESSAO_DEMONSTRACAO) cb({ uid: uidDemonstracao(), modo: "demonstracao" }); };
    window.addEventListener("storage", aoMudar);
    parar = () => window.removeEventListener("storage", aoMudar);
  }
  return () => { vivo = false; parar(); };
}
