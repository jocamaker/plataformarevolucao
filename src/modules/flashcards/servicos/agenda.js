/* Ações sobre o agendamento, gravadas no banco em lotes (tudo ou nada):
   responder, desfazer, suspender, enterrar, adiar/adiantar, definir data e
   resetar. Cada função recebe o repositório do aluno. */

import { APAGAR } from "../dados/contrato.js";
import { chaveDia, proximaVirada } from "../dados/datas.js";
import { ESTADOS, comFila } from "../dados/modelo.js";

const TAMANHO_LOTE = 400; // o Firestore aceita até 500 operações por lote

export async function emLotes(repo, ops) {
  for (let i = 0; i < ops.length; i += TAMANHO_LOTE) await repo.lote(ops.slice(i, i + TAMANHO_LOTE));
}

// só os campos de agendamento (o resto do cartão não muda)
const camposAgenda = (c) => ({ fsrs: c.fsrs, suspenso: c.suspenso, enterradoAte: c.enterradoAte ?? null, posicaoNovo: c.posicaoNovo, fila: c.fila, ordemNovo: c.ordemNovo });
const atualizarCartao = (c, agora) => ({ tipo: "atualizar", colecao: "cartoes", id: c.id, dados: { ...camposAgenda(c), atualizadoEm: agora } });

// posição na fila de novos: a ordem de criação (ms × 1000 + índice cabe num número exato)
export const posicaoNova = (agora, i = 0) => agora.getTime() * 1000 + i;

/* Resposta do aluno: o cartão com o novo estado, o registro da revisão e o
   resumo do dia, num lote só. O resumo guarda a revisão pelo id: gravar de
   novo (reenvio depois de uma queda) não conta duas vezes. */
export async function responder(repo, args) {
  const { depois, revisao, ops } = planejarResposta(repo, args);
  await repo.lote(ops);
  return { depois, revisao };
}

/* A mesma resposta em duas partes: o cálculo (instantâneo, para a tela
   seguir sem esperar a rede) e as operações a gravar. antecipada: resposta
   do modo "rever antes do prazo" (não gasta o limite de revisões do dia). */
export function planejarResposta(repo, { cartao, avaliacao, agendador, agora, duracaoMs = 0, antecipada = false }) {
  const fsrs = agendador.responder(cartao, avaliacao, agora);
  const depois = comFila({ ...cartao, fsrs, enterradoAte: null });
  const id = repo.novoId();
  const dia = chaveDia(agora, agendador.config.viradaDoDia);
  const duracao = Math.max(0, Math.min(Math.round(duracaoMs), 60 * 60000));
  const revisao = {
    cartaoId: cartao.id, notaId: cartao.notaId, materiaId: cartao.materiaId, topicoId: cartao.topicoId,
    avaliacao, antes: camposAgenda(cartao), estadoAntes: cartao.fsrs.state, estadoDepois: fsrs.state,
    intervaloDias: Math.max(0, (fsrs.due.getTime() - agora.getTime()) / 86400000),
    feitaEm: agora, dia, duracaoMs: duracao,
    ...(antecipada ? { antecipada: true } : {}),
  };
  const ops = [
    atualizarCartao(depois, agora),
    { tipo: "definir", colecao: "revisoes", id, dados: revisao },
    { tipo: "mesclar", colecao: "dias", id: dia, dados: { dia, revisoes: { [id]: { avaliacao, estadoAntes: cartao.fsrs.state, materiaId: cartao.materiaId, duracaoMs: duracao, ...(antecipada ? { antecipada: true } : {}) } } } },
  ];
  return { depois, revisao: { id, ...revisao }, ops };
}

// desfaz uma resposta: o cartão volta exatamente ao que era, a revisão some
export async function desfazer(repo, revisao, agora = new Date()) {
  const antes = { id: revisao.cartaoId, ...revisao.antes };
  await repo.lote([
    atualizarCartao(antes, agora),
    { tipo: "remover", colecao: "revisoes", id: revisao.id },
    { tipo: "atualizar", colecao: "dias", id: revisao.dia, dados: { [`revisoes.${revisao.id}`]: APAGAR } },
  ]);
  return antes;
}

async function aplicar(repo, cartoes, mudar, agora) {
  const novos = cartoes.map((c, i) => comFila({ ...c, ...mudar(c, i) }));
  await emLotes(repo, novos.map((c) => atualizarCartao(c, agora)));
  return novos;
}

export const suspender = (repo, cartoes, suspenso = true, agora = new Date()) => aplicar(repo, cartoes, () => ({ suspenso }), agora);

// enterrar: some até a virada do dia seguinte
export const enterrar = (repo, cartoes, { agora = new Date(), virada = 4 } = {}) =>
  aplicar(repo, cartoes, () => ({ enterradoAte: proximaVirada(agora, virada) }), agora);

// desfaz o enterro (volta para a fila já)
export const desenterrar = (repo, cartoes, agora = new Date()) => aplicar(repo, cartoes, () => ({ enterradoAte: null }), agora);

/* Definir a data da próxima revisão.
   Já estudado: a revisão passa para a data (hoje = agora).
   Novo: data futura = fica fora da fila de novos até lá; hoje = vai para a
   frente da fila de novos. */
export function definirData(repo, cartoes, data, agora = new Date()) {
  const hoje = data.getTime() <= agora.getTime();
  return aplicar(repo, cartoes, (c, i) => {
    if (c.fsrs.state === ESTADOS.novo) {
      return hoje ? { enterradoAte: null, posicaoNovo: -posicaoNova(agora, cartoes.length - i) } : { enterradoAte: data };
    }
    return { enterradoAte: null, fsrs: { ...c.fsrs, due: hoje ? agora : data } };
  }, agora);
}

// adiar n dias, a partir de quando cada cartão venceria (ou de hoje, se já venceu)
export function adiar(repo, cartoes, dias, agora = new Date()) {
  const ms = dias * 86400000;
  return aplicar(repo, cartoes, (c) => {
    if (c.fsrs.state === ESTADOS.novo) {
      const base = Math.max(agora.getTime(), c.enterradoAte ? new Date(c.enterradoAte).getTime() : 0);
      return { enterradoAte: new Date(base + ms) };
    }
    const base = Math.max(agora.getTime(), new Date(c.fsrs.due).getTime());
    return { enterradoAte: null, fsrs: { ...c.fsrs, due: new Date(base + ms) } };
  }, agora);
}

// volta a "novo", no fim da fila de novos (o histórico de revisões fica)
export const resetar = (repo, cartoes, agendador, agora = new Date()) =>
  aplicar(repo, cartoes, (c, i) => ({ fsrs: agendador.novo(agora), enterradoAte: null, posicaoNovo: posicaoNova(agora, i) }), agora);

/* Reagendar os cartões em revisão com as configurações atuais (opção ao
   mudar a retenção-alvo ou o intervalo máximo). Devolve quantos mudaram. */
export async function reagendar(repo, agendador, agora = new Date()) {
  const emRevisao = await repo.listar("cartoes", { onde: [["fsrs.state", "==", ESTADOS.revisao]] });
  const mudados = [];
  for (const c of emRevisao) {
    const fsrs = agendador.reagendar(c, agora);
    if (fsrs && new Date(fsrs.due).getTime() !== new Date(c.fsrs.due).getTime()) mudados.push(comFila({ ...c, fsrs }));
  }
  await emLotes(repo, mudados.map((c) => atualizarCartao(c, agora)));
  return mudados.length;
}

// devolve à fila os enterrados/adiados cuja data já passou
export async function desenterrarVencidos(repo, agora = new Date()) {
  const vencidos = await repo.listar("cartoes", { onde: [["enterradoAte", "<=", agora]] });
  if (!vencidos.length) return [];
  return aplicar(repo, vencidos, () => ({ enterradoAte: null }), agora);
}
