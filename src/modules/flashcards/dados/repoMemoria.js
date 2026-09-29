/* Adaptador em memória: o modo demonstração (com o IndexedDB por baixo, em
   repoDemonstracao.js) e os testes. Mesma interface do adaptador Firestore
   (ver contrato.js). O lote é tudo ou nada: aplica numa cópia, grava a
   cópia na persistência numa transação e só então troca o estado. */

import { APAGAR, COLECAO_CONFIG, ErroFlashcards, ID_CONFIG, exigirColecao, novoIdAleatorio } from "./contrato.js";
import { aplicarAtualizacao, aplicarConsulta, limparDados, mesclarProfundo } from "./consultas.js";

const TIPOS_OP = ["definir", "mesclar", "atualizar", "remover"];
const temApagar = (v) => v === APAGAR || (v !== null && typeof v === "object" && !(v instanceof Date) && Object.values(v).some(temApagar));
const chave = (colecao, id) => `${colecao}/${colecao === COLECAO_CONFIG ? ID_CONFIG : id}`;

/* persistencia (opcional): { gravar(mudancas) } — mudancas: [[chave, dados | null]]
   arquivos (opcional): { salvar(blob) → id, ler(id) → blob, apagar(id) }
   inicial: { "colecao/id": dados } já carregado */
export function criarRepoMemoria({ uid, persistencia = null, arquivos = null, inicial = {}, modo = "memoria" } = {}) {
  if (!uid) throw new ErroFlashcards("Sem aluno logado.", { codigo: "sessao" });
  const docs = new Map(Object.entries(inicial).map(([k, v]) => [k, structuredClone(v)]));
  const ouvintes = new Set();
  const blobs = new Map(); // arquivos em memória quando não há persistência de arquivos

  const docDe = (k) => (docs.has(k) ? { id: k.slice(k.indexOf("/") + 1), ...structuredClone(docs.get(k)) } : null);
  const daColecao = (colecao) => {
    const prefixo = `${colecao}/`;
    const r = [];
    for (const k of docs.keys()) if (k.startsWith(prefixo)) r.push(docDe(k));
    return r;
  };

  function avisar(colecoes) {
    for (const o of ouvintes) {
      if (!colecoes.has(o.colecao)) continue;
      o.cb(o.id !== undefined ? docDe(chave(o.colecao, o.id)) : aplicarConsulta(daColecao(o.colecao), o.consulta));
    }
  }

  return {
    modo,
    uid,
    novoId: novoIdAleatorio,

    async obter(colecao, id) {
      exigirColecao(colecao);
      return docDe(chave(colecao, id));
    },
    async listar(colecao, consulta = {}) {
      exigirColecao(colecao);
      return aplicarConsulta(daColecao(colecao), consulta);
    },
    async contar(colecao, consulta = {}) {
      exigirColecao(colecao);
      return aplicarConsulta(daColecao(colecao), { onde: consulta.onde }).length;
    },
    observar(colecao, consulta, cb) {
      exigirColecao(colecao);
      const o = { colecao, consulta: consulta || {}, cb };
      ouvintes.add(o);
      queueMicrotask(() => { if (ouvintes.has(o)) cb(aplicarConsulta(daColecao(colecao), o.consulta)); });
      return () => ouvintes.delete(o);
    },
    observarDoc(colecao, id, cb) {
      exigirColecao(colecao);
      const o = { colecao, id, cb };
      ouvintes.add(o);
      queueMicrotask(() => { if (ouvintes.has(o)) cb(docDe(chave(colecao, id))); });
      return () => ouvintes.delete(o);
    },

    async lote(ops) {
      const novos = new Map(); // chave → dados | null (removido)
      const atual = (k) => (novos.has(k) ? novos.get(k) : docs.has(k) ? docs.get(k) : null);
      for (const op of ops) {
        exigirColecao(op.colecao);
        if (!TIPOS_OP.includes(op.tipo)) throw new ErroFlashcards(`Operação desconhecida: ${op.tipo}`, { codigo: "operacao" });
        if (op.colecao !== COLECAO_CONFIG && !op.id) throw new ErroFlashcards("Operação sem id.", { codigo: "operacao" });
        const k = chave(op.colecao, op.id);
        const { id: _id, ...dados } = op.dados || {};
        if (op.tipo === "definir") {
          if (temApagar(dados)) throw new ErroFlashcards("APAGAR só vale em atualizar/mesclar.", { codigo: "operacao" });
          novos.set(k, limparDados(dados));
        }
        else if (op.tipo === "mesclar") novos.set(k, mesclarProfundo(atual(k), dados));
        else if (op.tipo === "atualizar") {
          if (!atual(k)) throw new ErroFlashcards(`Não existe ${k}.`, { codigo: "nao-encontrado" });
          novos.set(k, aplicarAtualizacao(atual(k), dados));
        } else novos.set(k, null);
      }
      if (persistencia) await persistencia.gravar([...novos].map(([k, v]) => [k, v && structuredClone(v)]));
      const tocadas = new Set();
      for (const [k, v] of novos) {
        if (v) docs.set(k, v); else docs.delete(k);
        tocadas.add(k.slice(0, k.indexOf("/")));
      }
      avisar(tocadas);
      return { pendente: false };
    },

    async enviarImagem(blob) {
      let id;
      if (arquivos) id = await arquivos.salvar(blob);
      else { id = `m${blobs.size + 1}`; blobs.set(id, blob); }
      return `idb-fc:${id}`;
    },
    async urlImagem(ref) {
      if (!ref?.startsWith("idb-fc:")) return ref || null;
      const id = ref.slice(7);
      const blob = arquivos ? await arquivos.ler(id) : blobs.get(id);
      if (!blob) return null;
      return URL.createObjectURL(blob);
    },
    async apagarImagem(ref) {
      if (!ref?.startsWith("idb-fc:")) return;
      const id = ref.slice(7);
      if (arquivos) await arquivos.apagar(id); else blobs.delete(id);
    },
  };
}
