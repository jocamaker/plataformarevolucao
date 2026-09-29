/* Adaptador Firebase: Authentication (contas), Firestore (dados) e Storage
   (arquivos). Implementa o mesmo contrato do adaptador local (contrato.js).
   A proteção de verdade está em firestore.rules e storage.rules. */

import { deleteApp, initializeApp } from "firebase/app";
import {
  connectAuthEmulator, createUserWithEmailAndPassword, getAuth, inMemoryPersistence, initializeAuth,
  onAuthStateChanged, signInWithEmailAndPassword, signOut,
} from "firebase/auth";
import {
  Timestamp, collection, connectFirestoreEmulator, deleteDoc, deleteField, doc, getDoc, getDocs, increment,
  initializeFirestore, onSnapshot, persistentLocalCache, persistentMultipleTabManager, query, serverTimestamp, setDoc, updateDoc, where, writeBatch,
} from "firebase/firestore";
import { connectStorageEmulator, deleteObject, getDownloadURL, getStorage, ref as refStorage, uploadBytesResumable } from "firebase/storage";
import { ErroDados, ehOperacao } from "./contrato.js";

const PREFIXO = "st:"; // referência de arquivo no Storage: "st:caminho/do/arquivo"

// sentinelas do contrato → valores especiais do Firestore
function paraFirestore(v) {
  if (ehOperacao(v, "incrementar")) return increment(v.n);
  if (ehOperacao(v, "apagar")) return deleteField();
  if (ehOperacao(v, "carimbo")) return serverTimestamp();
  if (Array.isArray(v)) return v.map(paraFirestore);
  if (v && typeof v === "object" && !(v instanceof Date) && !(v instanceof Timestamp)) {
    return Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => [k, paraFirestore(x)]));
  }
  return v;
}

// Timestamp → ISO (o resto do app trabalha com texto)
function doFirestore(v) {
  if (v instanceof Timestamp) return v.toDate().toISOString();
  if (Array.isArray(v)) return v.map(doFirestore);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, doFirestore(x)]));
  return v;
}

const lerDoc = (snap) => (snap.exists() ? { id: snap.id, ...doFirestore(snap.data({ serverTimestamps: "estimate" })) } : null);

const MENSAGENS_AUTH = {
  "auth/invalid-credential": ["E-mail ou senha não conferem.", "credenciais"],
  "auth/wrong-password": ["E-mail ou senha não conferem.", "credenciais"],
  "auth/user-not-found": ["E-mail ou senha não conferem.", "credenciais"],
  "auth/invalid-email": ["E-mail inválido.", "email-invalido"],
  "auth/email-already-in-use": ["Já existe uma conta com esse e-mail.", "email-em-uso"],
  "auth/weak-password": ["A senha precisa ter ao menos 6 caracteres.", "senha-fraca"],
  "auth/too-many-requests": ["Muitas tentativas. Espere alguns minutos e tente de novo.", "muitas-tentativas"],
  "auth/network-request-failed": ["Sem conexão com o servidor.", "rede"],
  "auth/user-disabled": ["Este acesso foi desativado.", "desativado"],
};
function erroAuth(e) {
  const [msg, codigo] = MENSAGENS_AUTH[e?.code] || [e?.message || "Não foi possível entrar.", e?.code || "auth"];
  return new ErroDados(msg, codigo);
}
function erroDados(e) {
  if (e?.code === "permission-denied") return new ErroDados("Você não tem permissão para fazer isso.", "permissao");
  if (e?.code === "unavailable") return new ErroDados("Sem conexão com o servidor. Tente de novo.", "rede");
  return e instanceof ErroDados ? e : new ErroDados(e?.message || "Erro ao gravar.", e?.code || "erro");
}

export function criarRepositorioFirebase(config) {
  const { emuladores, ...cfg } = config;
  const app = initializeApp(cfg);
  const auth = getAuth(app);
  // cache persistente (IndexedDB): o que foi gravado sem conexão fica no
  // aparelho e é enviado quando a plataforma reabre, mesmo depois de fechar a
  // aba. Sem IndexedDB (Node, nos testes), fica o cache em memória.
  const db = initializeFirestore(app, {
    ignoreUndefinedProperties: true,
    ...(typeof indexedDB !== "undefined" ? { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) } : {}),
  });
  const storage = getStorage(app);
  if (emuladores) {
    const host = typeof emuladores === "string" ? emuladores : "127.0.0.1";
    connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
    connectFirestoreEmulator(db, host, 8080);
    connectStorageEmulator(storage, host, 9199);
  }

  const consulta = (colecao, filtros = []) => query(collection(db, colecao), ...filtros.map(([c, op, v]) => where(c, op, v)));
  const refDoc = (colecao, id) => (id ? doc(db, colecao, id) : doc(collection(db, colecao)));

  async function executar(fn) {
    try { return await fn(); } catch (e) { throw erroDados(e); }
  }

  /* Logo depois de criar a conta, o perfil aparece aqui pela cópia local
     antes de chegar ao servidor, e as regras recusam os primeiros ouvintes.
     Um ouvinte recusado por permissão tenta de novo algumas vezes antes de
     desistir (senão a tela fica vazia até recarregar a página). */
  function ouvir(assinar, aoErro, rotulo) {
    let parar = () => {};
    let vivo = true;
    let tentativas = 0;
    const iniciar = () => {
      parar = assinar((e) => {
        if (!vivo) return;
        if (e?.code === "permission-denied" && tentativas < 4) {
          tentativas += 1;
          setTimeout(() => { if (vivo) iniciar(); }, 600 * tentativas);
          return;
        }
        if (aoErro) aoErro(erroDados(e)); else console.error(...rotulo, e); // eslint-disable-line no-console
      });
    };
    iniciar();
    return () => { vivo = false; parar(); };
  }

  return {
    modo: "firebase",

    listar: (colecao, filtros) => executar(async () => (await getDocs(consulta(colecao, filtros))).docs.map(lerDoc)),
    obter: (colecao, id) => executar(async () => lerDoc(await getDoc(doc(db, colecao, id)))),
    observar(colecao, filtros, cb, aoErro) {
      return ouvir((falha) => onSnapshot(consulta(colecao, filtros), (snap) => cb(snap.docs.map(lerDoc)), falha), aoErro, [colecao]);
    },
    observarDoc(colecao, id, cb, aoErro) {
      return ouvir((falha) => onSnapshot(doc(db, colecao, id), (snap) => cb(lerDoc(snap)), falha), aoErro, [colecao, id]);
    },
    criar: (colecao, dados, id) => executar(async () => {
      const r = refDoc(colecao, id);
      const { id: _i, ...resto } = dados;
      await setDoc(r, paraFirestore(resto));
      return r.id;
    }),
    definir: (colecao, id, dados) => executar(() => { const { id: _i, ...resto } = dados; return setDoc(doc(db, colecao, id), paraFirestore(resto)); }),
    mesclar: (colecao, id, dados) => executar(() => { const { id: _i, ...resto } = dados; return setDoc(doc(db, colecao, id), paraFirestore(resto), { merge: true }); }),
    atualizar: (colecao, id, patch) => executar(() => updateDoc(doc(db, colecao, id), paraFirestore(patch))),
    remover: (colecao, id) => executar(() => deleteDoc(doc(db, colecao, id))),
    lote: (operacoes) => executar(async () => {
      const b = writeBatch(db);
      operacoes.forEach((op) => {
        const r = refDoc(op.colecao, op.id);
        const { id: _i, ...dados } = op.dados || {};
        if (op.tipo === "criar" || op.tipo === "definir") b.set(r, paraFirestore(dados));
        else if (op.tipo === "mesclar") b.set(r, paraFirestore(dados), { merge: true });
        else if (op.tipo === "atualizar") b.update(r, paraFirestore(dados));
        else if (op.tipo === "remover") b.delete(r);
        else throw new ErroDados(`Operação desconhecida: ${op.tipo}`);
      });
      await b.commit();
    }),

    enviarArquivo(caminho, blob, { aoProgredir } = {}) {
      return new Promise((ok, falha) => {
        const tarefa = uploadBytesResumable(refStorage(storage, caminho), blob, blob.type ? { contentType: blob.type } : undefined);
        tarefa.on("state_changed",
          (s) => aoProgredir?.(s.totalBytes ? s.bytesTransferred / s.totalBytes : 0),
          (e) => falha(e?.code === "storage/unauthorized" ? new ErroDados("Sem permissão para enviar este arquivo.", "permissao") : erroDados(e)),
          () => ok({ ref: `${PREFIXO}${caminho}`, nome: blob.name || caminho.split("/").pop(), tamanho: blob.size, tipo: blob.type || "" }));
      });
    },
    async urlArquivo(ref) {
      if (!ref) return null;
      if (!ref.startsWith(PREFIXO)) return ref; // asset do build ou URL comum
      try { return await getDownloadURL(refStorage(storage, ref.slice(PREFIXO.length))); } catch (e) { throw erroDados(e); }
    },
    async removerArquivo(ref) {
      if (!ref?.startsWith(PREFIXO)) return;
      try { await deleteObject(refStorage(storage, ref.slice(PREFIXO.length))); } catch (e) { if (e?.code !== "storage/object-not-found") throw erroDados(e); }
    },

    async entrar(email, senha) {
      try { return (await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), senha)).user.uid; } catch (e) { throw erroAuth(e); }
    },
    sair: () => signOut(auth),
    observarSessao: (cb) => onAuthStateChanged(auth, (u) => cb(u?.uid || null)),

    /* Conta nova. Sem { entrar }, usa um app secundário para não trocar a
       sessão de quem está criando (o moderador cadastrando um aluno). */
    async criarConta(email, senha, { entrar = false } = {}) {
      const e = email.trim().toLowerCase();
      if (entrar) {
        try { return (await createUserWithEmailAndPassword(auth, e, senha)).user.uid; } catch (err) { throw erroAuth(err); }
      }
      const sec = initializeApp(cfg, `cadastro-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      try {
        const authSec = initializeAuth(sec, { persistence: inMemoryPersistence });
        if (emuladores) connectAuthEmulator(authSec, `http://${typeof emuladores === "string" ? emuladores : "127.0.0.1"}:9099`, { disableWarnings: true });
        const { user } = await createUserWithEmailAndPassword(authSec, e, senha);
        await signOut(authSec);
        return user.uid;
      } catch (err) {
        throw erroAuth(err);
      } finally {
        await deleteApp(sec).catch(() => {});
      }
    },

    encerrar: () => deleteApp(app),
  };
}
