/* Notas (o texto-fonte) e os cartões que saem delas: criar, editar, mover,
   mudar tags e apagar. Cada operação grava nota e cartões no mesmo lote. */

import { idCartao, normalizarNota, normalizarTags, sincronizarCartoes } from "../dados/modelo.js";
import { emLotes, posicaoNova } from "./agenda.js";

const cartoesDaNota = (repo, notaId) => repo.listar("cartoes", { onde: [["notaId", "==", notaId]] });

/* Cria (sem id) ou edita (com id). Devolve { id, cartoes: n }.
   Editar mantém o progresso dos cartões que continuam (mesma lacuna/forma). */
// tags usadas pelo aluno (para "estudar por tag"), guardadas nas configurações
function opTagsConhecidas(tags, conhecidas) {
  if (!conhecidas) return [];
  const chave = (t) => t.toLocaleLowerCase("pt-BR");
  const ja = new Set(conhecidas.map(chave));
  const novas = tags.filter((t) => !ja.has(chave(t)));
  return novas.length ? [{ tipo: "mesclar", colecao: "config", dados: { tagsConhecidas: [...conhecidas, ...novas].slice(-200) } }] : [];
}

export async function salvarNota(repo, dados, { agora = new Date(), tagsConhecidas = null } = {}) {
  const nota = normalizarNota(dados);
  const id = dados.id || repo.novoId();
  const atual = dados.id ? await repo.obter("notas", dados.id) : null;
  const atuais = dados.id ? await cartoesDaNota(repo, id) : [];
  const { criar, atualizar, remover } = sincronizarCartoes({ nota, notaId: id, cartoesAtuais: atuais, agora, proximaPosicao: posicaoNova(agora) });
  await repo.lote([
    { tipo: "definir", colecao: "notas", id, dados: { ...nota, criadoEm: atual?.criadoEm || agora, atualizadoEm: agora } },
    ...criar.map((c) => ({ tipo: "definir", colecao: "cartoes", id: c.id, dados: c.dados })),
    ...atualizar.map((c) => ({ tipo: "atualizar", colecao: "cartoes", id: c.id, dados: c.dados })),
    ...remover.map((cid) => ({ tipo: "remover", colecao: "cartoes", id: cid })),
    ...opTagsConhecidas(nota.tags, tagsConhecidas),
  ]);
  // imagens que saíram da nota
  const sairam = (atual?.imagens || []).filter((ref) => !nota.imagens.includes(ref));
  await Promise.all(sairam.map((ref) => repo.apagarImagem(ref).catch(() => {})));
  return { id, criados: criar.length, removidos: remover.length, cartoes: criar.length + atuais.length - remover.length };
}

// agrupa cartões já carregados por nota (evita uma consulta por nota)
function porNota(cartoes) {
  const m = new Map();
  for (const c of cartoes || []) { if (!m.has(c.notaId)) m.set(c.notaId, []); m.get(c.notaId).push(c); }
  return m;
}

async function cartoesDe(repo, notaIds, cartoesCarregados) {
  if (cartoesCarregados) return porNota(cartoesCarregados.filter((c) => notaIds.includes(c.notaId)));
  const m = new Map();
  for (const id of notaIds) m.set(id, await cartoesDaNota(repo, id));
  return m;
}

export async function apagarNotas(repo, notas, { cartoes } = {}) {
  const ids = notas.map((n) => n.id);
  const mapa = await cartoesDe(repo, ids, cartoes);
  await emLotes(repo, [
    ...ids.flatMap((id) => (mapa.get(id) || []).map((c) => ({ tipo: "remover", colecao: "cartoes", id: c.id }))),
    ...ids.map((id) => ({ tipo: "remover", colecao: "notas", id })),
  ]);
  const imagens = [...new Set(notas.flatMap((n) => n.imagens || []))];
  await Promise.all(imagens.map((ref) => repo.apagarImagem(ref).catch(() => {})));
}

// mover notas (e todos os cartões delas) para outro tópico/matéria
export async function moverNotas(repo, notas, { materiaId, topicoId }, { cartoes } = {}) {
  const agora = new Date();
  const ids = notas.map((n) => n.id);
  const mapa = await cartoesDe(repo, ids, cartoes);
  await emLotes(repo, ids.flatMap((id) => [
    { tipo: "atualizar", colecao: "notas", id, dados: { materiaId, topicoId, atualizadoEm: agora } },
    ...(mapa.get(id) || []).map((c) => ({ tipo: "atualizar", colecao: "cartoes", id: c.id, dados: { materiaId, topicoId, atualizadoEm: agora } })),
  ]));
}

// acrescenta e/ou tira tags de várias notas (os cartões recebem as mesmas)
export async function alterarTags(repo, notas, { adicionar = [], remover = [] }, { cartoes, tagsConhecidas = null } = {}) {
  const agora = new Date();
  const tira = new Set(remover.map((t) => t.toLocaleLowerCase("pt-BR")));
  const ids = notas.map((n) => n.id);
  const mapa = await cartoesDe(repo, ids, cartoes);
  const ops = [];
  for (const n of notas) {
    const tags = normalizarTags([...(n.tags || []).filter((t) => !tira.has(t.toLocaleLowerCase("pt-BR"))), ...adicionar]);
    ops.push({ tipo: "atualizar", colecao: "notas", id: n.id, dados: { tags, atualizadoEm: agora } });
    for (const c of mapa.get(n.id) || []) ops.push({ tipo: "atualizar", colecao: "cartoes", id: c.id, dados: { tags, atualizadoEm: agora } });
  }
  await emLotes(repo, [...ops, ...opTagsConhecidas(normalizarTags(adicionar), tagsConhecidas)]);
}

export { idCartao };
