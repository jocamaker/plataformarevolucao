/* Adaptador Firestore: a árvore do aluno em flashcards_alunos/{uid}. As
   regras (bloco "Flashcards" em firestore.rules) garantem que só o próprio
   aluno lê e grava ali. Imagens no Storage em flashcards/{uid}/.

   Gravação sem conexão: o lote entra no cache do Firestore (persistente,
   no aparelho) e sobe quando a conexão volta. lote() espera a confirmação
   do servidor por um instante; se ela não vier, devolve { pendente: true }
   e um erro que chegue depois vai para aoErroTardio. */

import {
  collection, deleteField, doc, getCountFromServer, getDoc, getDocs, limit, onSnapshot, orderBy, query, Timestamp, where, writeBatch,
} from "firebase/firestore";
import { deleteObject, getDownloadURL, ref as refStorage, uploadBytes } from "firebase/storage";
import { APAGAR, COLECAO_CONFIG, COLECOES, ErroFlashcards, RAIZ, exigirColecao, novoIdAleatorio } from "./contrato.js";
import { ordensDaConsulta } from "./consultas.js";

const ESPERA_SERVIDOR_MS = 1500;
const PREFIXO = "st:";

// Timestamp → Date, em qualquer profundidade
function paraApp(v) {
  if (v instanceof Timestamp) return v.toDate();
  if (Array.isArray(v)) return v.map(paraApp);
  if (v && typeof v === "object" && !(v instanceof Date)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, paraApp(x)]));
  return v;
}

// APAGAR → deleteField(); undefined some
function paraBanco(v, permitirApagar) {
  if (v === APAGAR) {
    if (!permitirApagar) throw new ErroFlashcards("APAGAR só vale em atualizar/mesclar.", { codigo: "operacao" });
    return deleteField();
  }
  if (Array.isArray(v)) return v.map((x) => paraBanco(x, false));
  if (v && typeof v === "object" && !(v instanceof Date)) {
    const r = {};
    for (const [k, x] of Object.entries(v)) if (x !== undefined) r[k] = paraBanco(x, permitirApagar);
    return r;
  }
  return v;
}

function traduzir(e) {
  if (e instanceof ErroFlashcards) return e;
  if (e?.code === "permission-denied") return new ErroFlashcards("Sem permissão para acessar estes flashcards.", { codigo: "permissao" });
  if (e?.code === "not-found") return new ErroFlashcards("Não encontrado.", { codigo: "nao-encontrado" });
  if (e?.code === "unavailable") return new ErroFlashcards("Sem conexão com o servidor.", { codigo: "rede" });
  return new ErroFlashcards(e?.message || "Erro ao acessar os flashcards.", { codigo: e?.code || "erro" });
}

export function criarRepoFirestore({ db, storage, uid, aoErroTardio = null }) {
  if (!uid) throw new ErroFlashcards("Sem aluno logado.", { codigo: "sessao" });
  const raiz = doc(db, RAIZ, uid);
  const refDe = (colecao, id) => (colecao === COLECAO_CONFIG ? raiz : doc(db, RAIZ, uid, COLECOES[colecao], id));
  const lerDoc = (snap) => (snap.exists() ? { id: snap.id, ...paraApp(snap.data()) } : null);

  function consultaDe(colecao, { onde = [], ordem = null, limite = null } = {}) {
    exigirColecao(colecao);
    if (colecao === COLECAO_CONFIG) throw new ErroFlashcards("A configuração é um documento, não uma coleção.", { codigo: "consulta" });
    const partes = onde.map(([c, op, v]) => where(c, op, v));
    for (const [c, dir = "asc"] of ordensDaConsulta(ordem)) partes.push(orderBy(c, dir));
    if (limite != null) partes.push(limit(limite));
    return query(collection(db, RAIZ, uid, COLECOES[colecao]), ...partes);
  }

  async function executar(fn) {
    try { return await fn(); } catch (e) { throw traduzir(e); }
  }

  return {
    modo: "firebase",
    uid,
    novoId: novoIdAleatorio,

    obter: (colecao, id) => executar(async () => { exigirColecao(colecao); return lerDoc(await getDoc(refDe(colecao, id))); }),
    listar: (colecao, consulta) => executar(async () => (await getDocs(consultaDe(colecao, consulta))).docs.map(lerDoc)),
    contar: (colecao, consulta = {}) => executar(async () => {
      const q = consultaDe(colecao, { onde: consulta.onde });
      try {
        return (await getCountFromServer(q)).data().count;
      } catch (e) {
        if (e?.code === "permission-denied") throw e;
        return (await getDocs(q)).size; // sem conexão: conta pelo cache do aparelho
      }
    }),
    observar(colecao, consulta, cb, aoErro) {
      return onSnapshot(consultaDe(colecao, consulta || {}), (snap) => cb(snap.docs.map(lerDoc)), (e) => {
        if (aoErro) aoErro(traduzir(e)); else console.error("flashcards", colecao, e); // eslint-disable-line no-console
      });
    },
    observarDoc(colecao, id, cb, aoErro) {
      exigirColecao(colecao);
      return onSnapshot(refDe(colecao, id), (snap) => cb(lerDoc(snap)), (e) => {
        if (aoErro) aoErro(traduzir(e)); else console.error("flashcards", colecao, id, e); // eslint-disable-line no-console
      });
    },

    async lote(ops) {
      const lote = writeBatch(db);
      for (const op of ops) {
        exigirColecao(op.colecao);
        if (op.colecao !== COLECAO_CONFIG && !op.id) throw new ErroFlashcards("Operação sem id.", { codigo: "operacao" });
        const ref = refDe(op.colecao, op.id);
        const { id: _id, ...dados } = op.dados || {};
        if (op.tipo === "definir") lote.set(ref, paraBanco(dados, false));
        else if (op.tipo === "mesclar") lote.set(ref, paraBanco(dados, true), { merge: true });
        else if (op.tipo === "atualizar") lote.update(ref, paraBanco(dados, true));
        else if (op.tipo === "remover") lote.delete(ref);
        else throw new ErroFlashcards(`Operação desconhecida: ${op.tipo}`, { codigo: "operacao" });
      }
      const envio = lote.commit();
      let espera;
      const limite = new Promise((ok) => { espera = setTimeout(() => ok({ pendente: true }), ESPERA_SERVIDOR_MS); });
      try {
        const r = await Promise.race([envio.then(() => ({ pendente: false })), limite]);
        if (r.pendente) envio.catch((e) => aoErroTardio?.(traduzir(e)));
        return r;
      } catch (e) {
        throw traduzir(e);
      } finally {
        clearTimeout(espera);
      }
    },

    async enviarImagem(blob) {
      const ext = blob.type === "image/png" ? "png" : blob.type === "image/jpeg" ? "jpg" : "webp";
      const caminho = `flashcards/${uid}/${novoIdAleatorio()}.${ext}`;
      await executar(() => uploadBytes(refStorage(storage, caminho), blob, { contentType: blob.type || "image/webp" }));
      return PREFIXO + caminho;
    },
    async urlImagem(ref) {
      if (!ref?.startsWith(PREFIXO)) return ref || null;
      return executar(() => getDownloadURL(refStorage(storage, ref.slice(PREFIXO.length))));
    },
    async apagarImagem(ref) {
      if (!ref?.startsWith(PREFIXO)) return;
      try { await deleteObject(refStorage(storage, ref.slice(PREFIXO.length))); } catch (e) {
        if (e?.code !== "storage/object-not-found") throw traduzir(e);
      }
    },
  };
}
