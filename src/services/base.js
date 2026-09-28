/* Contexto comum dos serviços: repositório, relógio, usuário logado,
   permissões, índice da estrutura e histórico de alterações. */

import { exigir } from "../core/permissoes.js";
import { indiceEstrutura } from "../core/estrutura.js";
import { isoLocal } from "../core/datas.js";
import { carimbo } from "../data/contrato.js";

export class ErroValidacao extends Error {
  constructor(erros, mensagem) {
    super(mensagem || Object.values(erros)[0] || "Confira os campos.");
    this.name = "ErroValidacao";
    this.erros = erros;
  }
}

export const COLECOES_ESTRUTURA = {
  area: "areas", materia: "materias", topico: "topicos", subtopico: "subtopicos", vestibular: "vestibulares", curso: "cursos",
};

export function criarContexto(repo, { relogio = () => new Date() } = {}) {
  let indiceCache = null;
  const ctx = {
    repo,
    relogio,
    usuario: null, // perfil ativo: { uid, role, nome, email, … }
    hoje: () => isoLocal(relogio()),
    agora: () => relogio().getTime(),
    exigir: (acao, alvo) => exigir(ctx.usuario, acao, alvo, relogio().getTime()),
    autor: () => ({ autorId: ctx.usuario?.uid || null, autorNome: ctx.usuario?.nome || "", papel: ctx.usuario?.role || "" }),

    // índice da estrutura: mantido pela assinatura de estrutura.observar, ou lido sob demanda
    async indice() {
      if (indiceCache) return indiceCache;
      const listas = await Promise.all(Object.values(COLECOES_ESTRUTURA).map((c) => repo.listar(c)));
      indiceCache = indiceEstrutura(Object.fromEntries(Object.keys(COLECOES_ESTRUTURA).map((k, i) => [COLECOES_ESTRUTURA[k], listas[i]])));
      return indiceCache;
    },
    definirIndice(ind) { indiceCache = ind; },
    esquecerIndice() { indiceCache = null; },
  };
  return ctx;
}

/* Operações de histórico. entradas: [{ tipo, descricao, antes, depois }] */
export function opsDeLog(ctx, { alunoId = null, entidade, entidadeId = null, motivo = "", logId }, entradas) {
  const autor = ctx.autor();
  return entradas.map((e, i) => ({
    tipo: "criar",
    colecao: "logs",
    ...(i === 0 && logId ? { id: logId } : {}),
    dados: {
      alunoId, entidade, entidadeId, tipo: e.tipo, descricao: e.descricao,
      antes: e.antes ?? null, depois: e.depois ?? null, motivo: motivo || "",
      ...autor, data: ctx.hoje(), em: carimbo(),
    },
  }));
}

/* Regras do servidor: alterar ou apagar histórico exige um log gravado no
   mesmo lote. Alteração: o documento aponta o log (ultimoLogId). Exclusão: o
   log tem o id "rm_" + id do registro apagado. */
export const idLogRemocao = (id) => `rm_${id}`;

// lotes grandes em partes (o Firestore aceita até 500 operações por lote)
export async function loteEmPartes(repo, ops, tamanho = 400) {
  for (let i = 0; i < ops.length; i += tamanho) await repo.lote(ops.slice(i, i + tamanho));
}

export const porNome = (a, b) => String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR");
export const recentesPrimeiro = (campo) => (a, b) => String(b[campo] || "").localeCompare(String(a[campo] || ""));

// inteiro a partir de campo de formulário ("", "12", 12)
export const inteiro = (v) => (v === "" || v == null ? NaN : Number(v));

// só os campos permitidos
export const escolher = (obj, campos) => Object.fromEntries(campos.filter((c) => obj[c] !== undefined).map((c) => [c, obj[c]]));
