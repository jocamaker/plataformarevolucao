/* Matérias e tópicos do aluno: criar, renomear, reordenar, mover e apagar.
   Apagar leva junto o que está dentro (tópicos, notas, cartões e imagens);
   o histórico de revisões fica, para as estatísticas. */

import { normalizarMateria, normalizarTopico } from "../dados/modelo.js";
import { emLotes } from "./agenda.js";

const proximaOrdem = (lista) => (lista.length ? Math.max(...lista.map((x) => x.ordem ?? 0)) + 1 : 0);

export async function criarMateria(repo, { nome }, materias = []) {
  const id = repo.novoId();
  const agora = new Date();
  await repo.lote([{ tipo: "definir", colecao: "materias", id, dados: { ...normalizarMateria({ nome, ordem: proximaOrdem(materias) }), criadoEm: agora, atualizadoEm: agora } }]);
  return id;
}

export async function renomear(repo, colecao, id, nome) {
  const r = colecao === "materias" ? normalizarMateria({ nome }) : normalizarTopico({ materiaId: "x", nome });
  await repo.lote([{ tipo: "atualizar", colecao, id, dados: { nome: r.nome, atualizadoEm: new Date() } }]);
}

// grava a ordem nova (só o que mudou)
export async function reordenar(repo, colecao, itensEmOrdem) {
  const agora = new Date();
  const ops = itensEmOrdem
    .map((x, i) => (x.ordem === i ? null : { tipo: "atualizar", colecao, id: x.id, dados: { ordem: i, atualizadoEm: agora } }))
    .filter(Boolean);
  if (ops.length) await emLotes(repo, ops);
}

export async function criarTopico(repo, { materiaId, nome }, topicosDaMateria = []) {
  const id = repo.novoId();
  const agora = new Date();
  await repo.lote([{ tipo: "definir", colecao: "topicos", id, dados: { ...normalizarTopico({ materiaId, nome, ordem: proximaOrdem(topicosDaMateria) }), criadoEm: agora, atualizadoEm: agora } }]);
  return id;
}

// tópico para outra matéria: as notas e os cartões dele vão junto
export async function moverTopico(repo, topicoId, materiaId, topicosDestino = []) {
  const agora = new Date();
  const [notas, cartoes] = await Promise.all([
    repo.listar("notas", { onde: [["topicoId", "==", topicoId]] }),
    repo.listar("cartoes", { onde: [["topicoId", "==", topicoId]] }),
  ]);
  await emLotes(repo, [
    ...notas.map((n) => ({ tipo: "atualizar", colecao: "notas", id: n.id, dados: { materiaId, atualizadoEm: agora } })),
    ...cartoes.map((c) => ({ tipo: "atualizar", colecao: "cartoes", id: c.id, dados: { materiaId, atualizadoEm: agora } })),
  ]);
  await repo.lote([{ tipo: "atualizar", colecao: "topicos", id: topicoId, dados: { materiaId, ordem: proximaOrdem(topicosDestino), atualizadoEm: agora } }]);
}

async function apagarConteudo(repo, campo, valor) {
  const [notas, cartoes] = await Promise.all([
    repo.listar("notas", { onde: [[campo, "==", valor]] }),
    repo.listar("cartoes", { onde: [[campo, "==", valor]] }),
  ]);
  // cartões primeiro: se algo cair no meio, não sobra cartão sem nota
  await emLotes(repo, [
    ...cartoes.map((c) => ({ tipo: "remover", colecao: "cartoes", id: c.id })),
    ...notas.map((n) => ({ tipo: "remover", colecao: "notas", id: n.id })),
  ]);
  const imagens = [...new Set(notas.flatMap((n) => n.imagens || []))];
  await Promise.all(imagens.map((ref) => repo.apagarImagem(ref).catch(() => {})));
  return { notas: notas.length, cartoes: cartoes.length };
}

export async function apagarTopico(repo, topicoId) {
  const r = await apagarConteudo(repo, "topicoId", topicoId);
  await repo.lote([{ tipo: "remover", colecao: "topicos", id: topicoId }]);
  return r;
}

export async function apagarMateria(repo, materiaId) {
  const r = await apagarConteudo(repo, "materiaId", materiaId);
  const topicos = await repo.listar("topicos", { onde: [["materiaId", "==", materiaId]] });
  await emLotes(repo, [
    ...topicos.map((t) => ({ tipo: "remover", colecao: "topicos", id: t.id })),
    { tipo: "remover", colecao: "materias", id: materiaId },
  ]);
  return { ...r, topicos: topicos.length };
}

// quanto há dentro (para o aviso antes de apagar)
export async function contarConteudo(repo, campo, valor) {
  const [notas, cartoes] = await Promise.all([
    repo.contar("notas", { onde: [[campo, "==", valor]] }),
    repo.contar("cartoes", { onde: [[campo, "==", valor]] }),
  ]);
  return { notas, cartoes };
}
