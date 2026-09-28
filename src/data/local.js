/* Adaptador local: dados no localStorage, arquivos no IndexedDB.
   Serve para desenvolvimento e demonstração num único navegador. Não é
   multiusuário nem seguro: qualquer um com o navegador edita os dados. Para
   uso real, configure o Firebase (ver README). */

import { ErroDados, ehOperacao, novoId, passaFiltros } from "./contrato.js";

const CHAVE = "aprova:banco:v3"; // v3: 9 matérias do curso, tópico como unidade
const CHAVE_SESSAO = "aprova:sessao:v3";

function memoria() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

async function hashSenha(senha) {
  const dados = new TextEncoder().encode(`aprova:${senha}`);
  if (globalThis.crypto?.subtle) {
    const h = await globalThis.crypto.subtle.digest("SHA-256", dados);
    return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  return `plano:${senha}`;
}

const copia = (v) => (v == null ? v : structuredClone(v));

function aplicarPatch(doc, patch, agoraIso) {
  const novo = copia(doc);
  Object.entries(patch).forEach(([caminho, valor]) => {
    const partes = caminho.split(".");
    let alvo = novo;
    partes.slice(0, -1).forEach((p) => {
      if (typeof alvo[p] !== "object" || alvo[p] === null) alvo[p] = {};
      alvo = alvo[p];
    });
    const ult = partes[partes.length - 1];
    if (ehOperacao(valor, "incrementar")) alvo[ult] = (Number(alvo[ult]) || 0) + valor.n;
    else if (ehOperacao(valor, "apagar")) delete alvo[ult];
    else if (ehOperacao(valor, "carimbo")) alvo[ult] = agoraIso;
    else alvo[ult] = copia(valor);
  });
  return novo;
}

// mescla em profundidade: objetos simples se juntam; sentinelas e o resto substituem
function mesclarProfundo(atual, dados, agoraIso) {
  const novo = atual && typeof atual === "object" && !Array.isArray(atual) ? copia(atual) : {};
  Object.entries(dados).forEach(([k, v]) => {
    if (ehOperacao(v, "incrementar")) novo[k] = (Number(novo[k]) || 0) + v.n;
    else if (ehOperacao(v, "apagar")) delete novo[k];
    else if (ehOperacao(v, "carimbo")) novo[k] = agoraIso;
    else if (v && typeof v === "object" && !Array.isArray(v)) novo[k] = mesclarProfundo(novo[k], v, agoraIso);
    else novo[k] = copia(v);
  });
  return novo;
}

function resolverCarimbos(dados, agoraIso) {
  if (Array.isArray(dados)) return dados.map((x) => resolverCarimbos(x, agoraIso));
  if (dados && typeof dados === "object") {
    if (ehOperacao(dados, "carimbo")) return agoraIso;
    return Object.fromEntries(Object.entries(dados).map(([k, v]) => [k, resolverCarimbos(v, agoraIso)]));
  }
  return dados;
}

/* armazenamento: localStorage (padrão) ou memória (testes).
   arquivos: { salvar(blob) → ref, ler(ref) → blob, apagar(ref) } */
export function criarRepositorioLocal({ armazenamento, arquivos, relogio = () => new Date() } = {}) {
  const store = armazenamento || (typeof localStorage !== "undefined" ? localStorage : memoria());
  let banco;
  try { banco = JSON.parse(store.getItem(CHAVE)) || null; } catch { banco = null; }
  if (!banco || banco.versao !== 3) banco = { versao: 3, colecoes: {}, contas: {} };

  const ouvintes = new Set(); // { colecao, id?, filtros, cb }
  const ouvintesSessao = new Set();
  let sessao = null;
  try { sessao = JSON.parse(store.getItem(CHAVE_SESSAO))?.uid || null; } catch { sessao = null; }

  let agendado = null;
  const persistir = () => {
    clearTimeout(agendado);
    agendado = setTimeout(() => { try { store.setItem(CHAVE, JSON.stringify(banco)); } catch { /* cheio ou bloqueado */ } }, 120);
  };
  const col = (nome) => (banco.colecoes[nome] ||= {});
  const doc = (nome, id) => (col(nome)[id] ? { id, ...copia(col(nome)[id]) } : null);
  const lista = (nome, filtros) => Object.entries(col(nome)).map(([id, d]) => ({ id, ...copia(d) })).filter((d) => passaFiltros(d, filtros));

  function avisar(colecoes) {
    ouvintes.forEach((o) => {
      if (!colecoes.has(o.colecao)) return;
      o.cb(o.id ? doc(o.colecao, o.id) : lista(o.colecao, o.filtros));
    });
  }

  function aplicar(ops) {
    const agoraIso = relogio().toISOString();
    const tocadas = new Set();
    const ids = ops.map((op) => op.id || novoId());
    // valida tudo antes de gravar: o lote é tudo ou nada
    const existe = new Map();
    ops.forEach((op, i) => {
      const chave = `${op.colecao}/${ids[i]}`;
      const ha = existe.has(chave) ? existe.get(chave) : !!col(op.colecao)[ids[i]];
      if (!["criar", "definir", "mesclar", "atualizar", "remover"].includes(op.tipo)) throw new ErroDados(`Operação desconhecida: ${op.tipo}`);
      if (op.tipo === "criar" && op.id && ha) throw new ErroDados(`Já existe ${chave}.`, "ja-existe");
      if (op.tipo === "atualizar" && !ha) throw new ErroDados(`Não existe ${chave}.`, "nao-encontrado");
      existe.set(chave, op.tipo !== "remover");
    });
    ops.forEach((op, i) => {
      const id = ids[i];
      tocadas.add(op.colecao);
      const atual = col(op.colecao)[id];
      if (op.tipo === "criar") {
        const { id: _i, ...dados } = resolverCarimbos(op.dados, agoraIso);
        col(op.colecao)[id] = copia(dados);
      } else if (op.tipo === "definir") {
        const { id: _i, ...dados } = resolverCarimbos(op.dados, agoraIso);
        col(op.colecao)[id] = copia(dados);
      } else if (op.tipo === "mesclar") {
        const { id: _i, ...dados } = op.dados;
        col(op.colecao)[id] = mesclarProfundo(atual, dados, agoraIso);
      } else if (op.tipo === "atualizar") {
        col(op.colecao)[id] = aplicarPatch(atual, op.dados, agoraIso);
      } else {
        delete col(op.colecao)[id];
      }
    });
    persistir();
    avisar(tocadas);
    return ids;
  }

  // arquivos: memória nos testes; IndexedDB no navegador (carregado sob demanda)
  const blobs = new Map();
  const arq = arquivos || {
    salvar: async (blob) => (await import("../state/arquivos.js")).salvarArquivo(blob),
    ler: async (ref) => (await import("../state/arquivos.js")).lerArquivo(ref),
    apagar: async (ref) => (await import("../state/arquivos.js")).apagarArquivo(ref),
  };

  return {
    modo: "local",

    listar: async (colecao, filtros = []) => lista(colecao, filtros),
    obter: async (colecao, id) => doc(colecao, id),
    observar(colecao, filtros, cb) {
      const o = { colecao, filtros: filtros || [], cb };
      ouvintes.add(o);
      queueMicrotask(() => ouvintes.has(o) && cb(lista(colecao, o.filtros)));
      return () => ouvintes.delete(o);
    },
    observarDoc(colecao, id, cb) {
      const o = { colecao, id, cb };
      ouvintes.add(o);
      queueMicrotask(() => ouvintes.has(o) && cb(doc(colecao, id)));
      return () => ouvintes.delete(o);
    },
    criar: async (colecao, dados, id) => aplicar([{ tipo: "criar", colecao, id, dados }])[0],
    definir: async (colecao, id, dados) => { aplicar([{ tipo: "definir", colecao, id, dados }]); },
    mesclar: async (colecao, id, dados) => { aplicar([{ tipo: "mesclar", colecao, id, dados }]); },
    atualizar: async (colecao, id, patch) => { aplicar([{ tipo: "atualizar", colecao, id, dados: patch }]); },
    remover: async (colecao, id) => { aplicar([{ tipo: "remover", colecao, id }]); },
    lote: async (operacoes) => { aplicar(operacoes); },

    async enviarArquivo(caminho, blob, { aoProgredir } = {}) {
      aoProgredir?.(0);
      const ref = arquivos ? `mem:${caminho}` : await arq.salvar(blob);
      if (arquivos) { blobs.set(ref, blob); await arq.salvar?.(blob, ref); }
      aoProgredir?.(1);
      return { ref, nome: blob.name || caminho.split("/").pop(), tamanho: blob.size, tipo: blob.type || "" };
    },
    async urlArquivo(ref) {
      if (!ref) return null;
      if (!ref.startsWith("idb:") && !ref.startsWith("mem:")) return ref; // asset do build ou URL comum
      const blob = ref.startsWith("mem:") ? blobs.get(ref) : await arq.ler(ref);
      if (!blob) throw new ErroDados("Arquivo não encontrado neste navegador.", "arquivo-ausente");
      return typeof URL !== "undefined" && URL.createObjectURL ? URL.createObjectURL(blob) : ref;
    },
    async removerArquivo(ref) {
      if (!ref) return;
      if (ref.startsWith("mem:")) blobs.delete(ref);
      else if (ref.startsWith("idb:")) await arq.apagar(ref);
    },

    async entrar(email, senha) {
      const conta = Object.entries(banco.contas).find(([, c]) => c.email === email.trim().toLowerCase());
      if (!conta || conta[1].senha !== (await hashSenha(senha))) throw new ErroDados("E-mail ou senha não conferem.", "credenciais");
      sessao = conta[0];
      store.setItem(CHAVE_SESSAO, JSON.stringify({ uid: sessao }));
      ouvintesSessao.forEach((cb) => cb(sessao));
      return sessao;
    },
    async sair() {
      sessao = null;
      store.removeItem(CHAVE_SESSAO);
      ouvintesSessao.forEach((cb) => cb(null));
    },
    observarSessao(cb) {
      ouvintesSessao.add(cb);
      queueMicrotask(() => ouvintesSessao.has(cb) && cb(sessao));
      return () => ouvintesSessao.delete(cb);
    },
    async criarConta(email, senha, { entrar = false } = {}) {
      const e = email.trim().toLowerCase();
      if (!/.+@.+\..+/.test(e)) throw new ErroDados("E-mail inválido.", "email-invalido");
      if (String(senha).length < 6) throw new ErroDados("A senha precisa ter ao menos 6 caracteres.", "senha-fraca");
      if (Object.values(banco.contas).some((c) => c.email === e)) throw new ErroDados("Já existe uma conta com esse e-mail.", "email-em-uso");
      const uid = novoId();
      banco.contas[uid] = { email: e, senha: await hashSenha(senha) };
      persistir();
      if (entrar) {
        sessao = uid;
        store.setItem(CHAVE_SESSAO, JSON.stringify({ uid }));
        ouvintesSessao.forEach((cb) => cb(uid));
      }
      return uid;
    },

    // só no modo local: saber se o banco está vazio (para a demonstração)
    vazio: () => !Object.keys(banco.contas).length,
    apagarTudo() {
      banco = { versao: 3, colecoes: {}, contas: {} };
      sessao = null;
      store.removeItem(CHAVE_SESSAO);
      try { store.setItem(CHAVE, JSON.stringify(banco)); } catch { /* idem */ }
      ouvintes.forEach((o) => o.cb(o.id ? null : []));
      ouvintesSessao.forEach((cb) => cb(null));
    },
  };
}
