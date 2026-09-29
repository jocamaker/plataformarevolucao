/* Modo demonstração (plataforma sem Firebase configurado): os dados ficam
   no IndexedDB deste navegador, num banco só do módulo ("aprova-flashcards"),
   separados por aluno. Não é o banco de verdade: a tela avisa isso. Cada
   lote grava numa única transação (tudo ou nada). */

import { criarRepoMemoria } from "./repoMemoria.js";

const BANCO = "aprova-flashcards";
const DOCS = "docs";
const IMAGENS = "imagens";

function abrirBanco() {
  return new Promise((ok, falha) => {
    const req = indexedDB.open(BANCO, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DOCS)) db.createObjectStore(DOCS);
      if (!db.objectStoreNames.contains(IMAGENS)) db.createObjectStore(IMAGENS);
    };
    req.onsuccess = () => ok(req.result);
    req.onerror = () => falha(req.error);
  });
}

function transacao(db, loja, modo, fn) {
  return new Promise((ok, falha) => {
    const tx = db.transaction(loja, modo);
    const r = fn(tx.objectStore(loja));
    tx.oncomplete = () => ok(r?.result);
    tx.onerror = tx.onabort = () => falha(tx.error);
  });
}

export async function abrirRepoDemonstracao({ uid }) {
  const db = await abrirBanco();
  const prefixo = `${uid}/`;
  // tudo do aluno de uma vez (chaves "uid/colecao/id")
  const inicial = {};
  await new Promise((ok, falha) => {
    const tx = db.transaction(DOCS, "readonly");
    const req = tx.objectStore(DOCS).openCursor(IDBKeyRange.bound(prefixo, `${prefixo}￿`));
    req.onsuccess = () => {
      const c = req.result;
      if (!c) return;
      inicial[c.key.slice(prefixo.length)] = c.value;
      c.continue();
    };
    tx.oncomplete = ok;
    tx.onerror = () => falha(tx.error);
  });

  const persistencia = {
    gravar: (mudancas) => transacao(db, DOCS, "readwrite", (loja) => {
      for (const [k, v] of mudancas) {
        if (v) loja.put(v, prefixo + k); else loja.delete(prefixo + k);
      }
    }),
  };
  const arquivos = {
    async salvar(blob) {
      const id = `${uid}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      await transacao(db, IMAGENS, "readwrite", (loja) => loja.put(blob, id));
      return id;
    },
    ler: (id) => transacao(db, IMAGENS, "readonly", (loja) => loja.get(id)),
    apagar: (id) => transacao(db, IMAGENS, "readwrite", (loja) => loja.delete(id)).catch(() => {}),
  };
  return criarRepoMemoria({ uid, persistencia, arquivos, inicial, modo: "demonstracao" });
}
