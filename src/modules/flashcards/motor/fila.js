/* Fila e sessão de estudo (lógica pura, sem banco nem tela).

   O que entra numa sessão, como no Anki:
   - aprendendo/reaprendendo: aparecem na hora marcada (ou até 20 min antes,
     se não houver mais nada); não contam nos limites do dia;
   - revisões que vencem hoje, das menos lembradas para as mais lembradas
     (menor probabilidade de lembrar primeiro), até o limite do dia;
   - novos, na ordem em que foram criados, até o limite do dia, misturados
     entre as revisões;
   - irmãos (outras lacunas/formas da mesma nota) ficam para outra sessão;
   - nunca dois cartões seguidos do mesmo tópico, se houver alternativa.
   Há também o modo "rever antes do prazo" (montarRevisao). */

import { ESTADOS } from "../dados/modelo.js";

export const ANTECIPAR_APRENDIZADO_MS = 20 * 60000;

const aprendendo = (c) => c.fsrs.state === ESTADOS.aprendendo || c.fsrs.state === ESTADOS.reaprendendo;
const due = (c) => new Date(c.fsrs.due).getTime();

export function noEscopo(cartao, escopo = {}) {
  if (escopo.materiaId && cartao.materiaId !== escopo.materiaId) return false;
  if (escopo.topicoId && cartao.topicoId !== escopo.topicoId) return false;
  if (escopo.tag && !(cartao.tags || []).some((t) => t.toLocaleLowerCase("pt-BR") === escopo.tag.toLocaleLowerCase("pt-BR"))) return false;
  return true;
}

// o que já foi feito hoje (do resumo do dia): novos vistos e revisões feitas.
// Revisões antecipadas (modo "rever") contam no total, mas não gastam o limite do dia.
export function feitosHoje(dia) {
  const r = { novos: 0, revisoes: 0, total: 0 };
  for (const e of Object.values(dia?.revisoes || {})) {
    r.total += 1;
    if (e.antecipada) continue;
    if (e.estadoAntes === ESTADOS.novo) r.novos += 1;
    else if (e.estadoAntes === ESTADOS.revisao) r.revisoes += 1;
  }
  return r;
}

// intercala: um novo a cada tantas revisões, espalhados por igual
function misturar(revisoes, novos) {
  if (!novos.length) return [...revisoes];
  if (!revisoes.length) return [...novos];
  const r = [];
  const passo = (revisoes.length + novos.length) / novos.length;
  let proximoNovo = passo / 2;
  let iN = 0;
  let iR = 0;
  for (let pos = 0; pos < revisoes.length + novos.length; pos += 1) {
    if (iN < novos.length && (pos >= proximoNovo || iR >= revisoes.length)) {
      r.push(novos[iN]); iN += 1; proximoNovo += passo;
    } else { r.push(revisoes[iR]); iR += 1; }
  }
  return r;
}

/* Monta o plano do dia para um escopo.
   pendentes: cartões com fila <= fim do dia (já estudados, vencendo hoje)
   novos: candidatos a novo do escopo, em ordemNovo
   retencao(c): probabilidade de lembrar agora (ordena as revisões) */
export function montarPlano({ agora, config, pendentes = [], novos = [], dia = null, escopo = {}, retencao = () => 0 }) {
  const feitos = feitosHoje(dia);
  const ativo = (c) => !c.suspenso && !(c.enterradoAte && new Date(c.enterradoAte) > agora) && noEscopo(c, escopo);
  const emAprendizado = pendentes.filter((c) => ativo(c) && aprendendo(c)).sort((a, b) => due(a) - due(b));
  const notasUsadas = new Set(emAprendizado.map((c) => c.notaId));

  const livres = (lista) => lista.filter((c) => {
    if (notasUsadas.has(c.notaId)) return false; // irmão já na sessão
    notasUsadas.add(c.notaId);
    return true;
  });

  const r = new Map();
  const revisoesDoDia = pendentes.filter((c) => ativo(c) && c.fsrs.state === ESTADOS.revisao)
    .map((c) => { r.set(c.id, retencao(c) ?? 0); return c; })
    .sort((a, b) => r.get(a.id) - r.get(b.id) || due(a) - due(b));
  const limiteRevisoes = Math.max(0, config.revisoesPorDia - feitos.revisoes);
  const revisoes = livres(revisoesDoDia).slice(0, limiteRevisoes);

  const limiteNovos = Math.max(0, config.novosPorDia - feitos.novos);
  const novosDoDia = livres(novos.filter((c) => ativo(c) && c.fsrs.state === ESTADOS.novo)
    .sort((a, b) => a.ordemNovo - b.ordemNovo)).slice(0, limiteNovos);

  return { aprendendo: emAprendizado, principal: misturar(revisoes, novosDoDia), feitos, limiteNovos, limiteRevisoes };
}

/* Rever antes do prazo: todos os cartões já estudados do escopo, vencidos
   ou não, dos menos lembrados para os mais lembrados. Sem limite do dia;
   novos, suspensos e enterrados ficam de fora. Responder recomeça a
   contagem do cartão a partir de agora (o FSRS considera o tempo que passou
   desde a última revisão). */
export function montarRevisao({ agora, cartoes = [], escopo = {}, retencao = () => 0 }) {
  const r = new Map();
  const lista = cartoes
    .filter((c) => !c.suspenso && c.fsrs.state !== ESTADOS.novo && !(c.enterradoAte && new Date(c.enterradoAte) > agora) && noEscopo(c, escopo))
    .map((c) => { r.set(c.id, retencao(c) ?? 0); return c; })
    .sort((a, b) => r.get(a.id) - r.get(b.id) || due(a) - due(b));
  return { aprendendo: [], principal: lista, feitos: null, limiteNovos: 0, limiteRevisoes: lista.length };
}

/* Sessão: escolhe o próximo cartão e acompanha o progresso. Os cartões são
   os documentos (com id); registrar() recebe o cartão depois da resposta. */
export class SessaoEstudo {
  constructor({ plano, fimDoDia, antecipar = ANTECIPAR_APRENDIZADO_MS }) {
    this.principal = [...plano.principal];
    this.aprendendo = [...plano.aprendendo];
    this.fimDoDia = fimDoDia;
    this.antecipar = antecipar;
    this.ultimoTopico = null;
    this.concluidos = 0;
    this.respostas = 0;
    this.total = this.principal.length + this.aprendendo.length;
  }

  contagens() {
    return {
      novos: this.principal.filter((c) => c.fsrs.state === ESTADOS.novo).length,
      aprendendo: this.aprendendo.length,
      revisao: this.principal.filter((c) => c.fsrs.state === ESTADOS.revisao).length,
    };
  }

  progresso() {
    return { feitos: this.concluidos, total: this.total, respostas: this.respostas };
  }

  // prefere um cartão de outro tópico; senão, o primeiro
  escolher(candidatos) {
    return candidatos.find((c) => c.topicoId !== this.ultimoTopico) || candidatos[0];
  }

  /* { cartao } | { espera: Date } (só há aprendizado para daqui a pouco) | { fim: true } */
  proximo(agora) {
    const t = agora.getTime();
    const vencidos = this.aprendendo.filter((c) => due(c) <= t);
    const candidatos = [...vencidos, ...this.principal];
    if (candidatos.length) return { cartao: this.escolher(candidatos) };
    const logo = this.aprendendo.filter((c) => due(c) <= t + this.antecipar);
    if (logo.length) return { cartao: this.escolher(logo) };
    if (this.aprendendo.length) return { espera: new Date(Math.min(...this.aprendendo.map(due))) };
    return { fim: true };
  }

  tirar(id) {
    const i = this.principal.findIndex((c) => c.id === id);
    if (i >= 0) return { lista: "principal", indice: i, cartao: this.principal.splice(i, 1)[0] };
    const j = this.aprendendo.findIndex((c) => c.id === id);
    if (j >= 0) return { lista: "aprendendo", indice: j, cartao: this.aprendendo.splice(j, 1)[0] };
    return null;
  }

  /* depois de responder: se o cartão ainda volta hoje (passos de minutos),
     fica na sessão; senão, está concluído. Devolve o passo, para desfazer. */
  registrar(antes, depois) {
    const origem = this.tirar(antes.id);
    this.ultimoTopico = antes.topicoId;
    this.respostas += 1;
    const voltaHoje = aprendendo(depois) && due(depois) < this.fimDoDia.getTime();
    if (voltaHoje) this.aprendendo.push(depois);
    else this.concluidos += 1;
    return { antes, depois, origem, voltaHoje };
  }

  desfazer(passo) {
    if (passo.voltaHoje) this.tirar(passo.depois.id);
    else this.concluidos -= 1;
    this.respostas -= 1;
    // o cartão desfeito é o próximo a aparecer
    if (passo.origem?.lista === "aprendendo") this.aprendendo.unshift(passo.antes);
    else this.principal.unshift(passo.antes);
    this.ultimoTopico = null;
  }

  // suspenso, enterrado ou adiado no meio da sessão: sai da conta
  descartar(id) {
    if (this.tirar(id)) this.total -= 1;
  }

  // editado no meio da sessão (tópico, tags): troca os dados sem mexer na ordem
  atualizar(cartao) {
    for (const lista of [this.principal, this.aprendendo]) {
      const i = lista.findIndex((c) => c.id === cartao.id);
      if (i >= 0) lista[i] = { ...lista[i], ...cartao };
    }
  }
}
