/* Semana de metas do aluno (funções puras sobre o estado da semana).

   Estado: { chave, metas: { seg: [meta], … }, pendentes: [meta], editada, geracao,
             motorVersao, semTempo }
   Meta:   { id, tipo: "ciclo" | "revisao", materiaId, minutos, done, feitoEm,
             sessaoId, topicoId, subtopicoId, itemId, revisaoId, dia, extra, origem }
   Toda meta tem minutos em blocos de 30 (ver blocos.js e motor.js).

   Contexto do motor (montado a partir do plano em services/estudo.js):
     { materias, disp, inicio, revisoes, ordemMaterias, duracaoRevisao(materiaId),
       conteudoDaVez(materiaId) }
   O conteúdo de uma meta ainda aberta é sempre o "da vez" (segue o progresso);
   o de uma meta feita é o que ficou gravado na sessão. */

import { DIAS, dataParaDiaSemana } from "./nucleo.js";
import { fmtDataCurta, inicioDaSemana, somarDias } from "./datas.js";
import { BLOCO_MIN, arredBloco, paraBlocos } from "./blocos.js";
import { ordenarDia, planejarSemana, rankDaOrdem } from "./motor.js";
import { MOTOR_VERSAO } from "./migracao.js";

export const idxDia = (k) => DIAS.findIndex((d) => d.k === k);
export const chaveDoDia = (iso) => dataParaDiaSemana(iso);
export const somaMin = (metas) => metas.reduce((s, m) => s + (m.minutos || 0), 0);

export function datasDaSemana(chave) {
  return Object.fromEntries(DIAS.map((d, i) => [d.k, somarDias(chave, i)]));
}

const vazia = () => Object.fromEntries(DIAS.map((d) => [d.k, []]));

// duração de uma revisão: pelo peso atual da matéria (contexto) ou, sem ele,
// a gravada na revisão, em blocos de 30
const duracaoPadrao = (r) => Math.max(BLOCO_MIN, arredBloco(r?.duracaoMin || BLOCO_MIN));
const duracaoDa = (ctxOuFn, r) => {
  const fn = typeof ctxOuFn === "function" ? ctxOuFn : ctxOuFn?.duracaoRevisao;
  return fn ? fn(r.materiaId) : duracaoPadrao(r);
};

// campos que ficam no banco (nomes vêm do índice na hora de mostrar)
function limpa(m, prefixo = "") {
  return {
    id: `${prefixo}${m.id}`, tipo: m.tipo === "revisao" ? "revisao" : "ciclo", materiaId: m.materiaId || "",
    minutos: m.minutos, done: !!m.done, topicoId: m.topicoId || null, subtopicoId: m.subtopicoId || null,
    itemId: m.itemId || null, ...(m.revisaoId ? { revisaoId: m.revisaoId, dia: m.dia || null } : {}),
    ...(m.feitoEm ? { feitoEm: m.feitoEm } : {}), ...(m.sessaoId ? { sessaoId: m.sessaoId } : {}),
    ...(m.extra ? { extra: true } : {}), ...(m.origem ? { origem: m.origem } : {}),
  };
}

// revisões agendadas dentro da semana (a partir de `desde`, se informado)
function revisoesDaSemana(revisoes, chave, desde = chave) {
  const fim = somarDias(chave, 6);
  const out = [];
  (revisoes || []).forEach((r) => (r.sessoes || []).forEach((s) => {
    if (s.status !== "agendada" || s.dia < chave || s.dia > fim || s.dia < desde) return;
    out.push({ r, dia: s.dia });
  }));
  return out.sort((a, b) => a.dia.localeCompare(b.dia) || String(a.r.id).localeCompare(String(b.r.id)));
}

const comConteudo = (ctx, m) => (m.tipo === "ciclo" ? { ...m, ...(ctx.conteudoDaVez?.(m.materiaId) || {}) } : m);

/* Dias antes do início do plano (ctx.inicio) não recebem metas: quem começa
   no meio da semana não nasce com atrasos de dias em que o plano nem existia. */
export function gerarSemanaNova(ctx, chave) {
  const datas = datasDaSemana(chave);
  const capacidade = Object.fromEntries(DIAS.map((d) => [d.k, ctx.inicio && datas[d.k] < ctx.inicio ? 0 : Number(ctx.disp?.[d.k]) || 0]));
  const revisoes = revisoesDaSemana(ctx.revisoes, chave, ctx.inicio && ctx.inicio > chave ? ctx.inicio : chave).map(({ r, dia }) => ({
    k: chaveDoDia(dia), blocos: paraBlocos(duracaoDa(ctx, r)), revisaoId: r.id, dia, materiaId: r.materiaId || "",
    topicoId: r.topicoId || null, subtopicoId: r.subtopicoId || null, itemId: r.itemId || null,
  }));
  const { dias, resumo } = planejarSemana({
    materias: ctx.materias || [], capacidade, revisoes, ordemMaterias: ctx.ordemMaterias, prefixo: `${chave}:`,
  });
  const metas = vazia();
  DIAS.forEach((d) => { metas[d.k] = dias[d.k].map((m) => limpa(comConteudo(ctx, m))); });
  return { chave, metas, pendentes: [], editada: false, geracao: 0, motorVersao: MOTOR_VERSAO, semTempo: resumo.materiasSemTempo };
}

/* Semana válida para hoje. Na virada, o que ficou por fazer da semana que
   acabou vira pendência (as revisões não: elas têm data própria e aparecem
   como atrasadas pela coleção de revisões). Devolve também o resumo da
   semana encerrada, que vai para o histórico. */
export function semanaVigente(est, ctx, hojeIso) {
  const chave = inicioDaSemana(hojeIso);
  if (est && est.chave === chave) return { est, mudou: false, resumo: null };
  const nova = gerarSemanaNova(ctx, chave);
  if (!est) return { est: nova, mudou: true, resumo: null };
  const todas = DIAS.flatMap((d) => est.metas?.[d.k] || []);
  const origem = `semana de ${fmtDataCurta(est.chave)}`;
  const pendentes = [
    ...(est.pendentes || []).filter((m) => !m.done),
    ...todas.filter((m) => !m.done && m.tipo !== "revisao").map((m) => ({ ...m, origem: m.origem || origem })),
  ];
  const feitas = todas.filter((m) => m.done);
  const resumo = {
    semana: est.chave, metas: todas.length, cumpridas: feitas.length, naoCumpridas: todas.length - feitas.length,
    minutosPlanejados: somaMin(todas), minutosFeitos: somaMin(feitas),
  };
  return { est: { ...nova, pendentes }, mudou: true, resumo };
}

/* Revisões vencidas que não estão na semana atual (de semanas anteriores).
   A feita hoje continua na lista, marcada, até o fim do dia. */
export function revisoesAtrasadas(revisoes, hojeIso, est, duracao) {
  const naSemana = new Set(DIAS.flatMap((d) => est?.metas?.[d.k] || []).filter((m) => m.revisaoId).map((m) => `${m.revisaoId}|${m.dia}`));
  const out = [];
  (revisoes || []).forEach((r) => (r.sessoes || []).forEach((s) => {
    if (s.dia >= hojeIso || naSemana.has(`${r.id}|${s.dia}`)) return;
    const feitaHoje = s.status === "realizada" && s.realizadaEm === hojeIso;
    if (s.status !== "agendada" && !feitaHoje) return;
    out.push({
      id: idRevisaoAvulsa(r.id, s.dia), tipo: "revisao", revisaoId: r.id, dia: s.dia, materiaId: r.materiaId,
      topicoId: r.topicoId, subtopicoId: r.subtopicoId || null, itemId: r.itemId, minutos: duracaoDa(duracao, r),
      done: feitaHoje, ...(feitaHoje ? { feitoEm: hojeIso, sessaoId: s.sessaoId || null } : {}),
      origem: `revisão de ${fmtDataCurta(s.dia)}`, avulsa: true,
    });
  }));
  return out.sort((a, b) => a.dia.localeCompare(b.dia));
}

export const idRevisaoAvulsa = (revisaoId, dia) => `rev:${revisaoId}:${dia}`;
export function lerIdRevisaoAvulsa(id) {
  const m = /^rev:(.+):(\d{4}-\d{2}-\d{2})$/.exec(id || "");
  return m ? { revisaoId: m[1], dia: m[2] } : null;
}

/* Deixa as revisões da semana iguais às agendadas: entra a que foi agendada
   para esta semana (de hoje em diante), sai a meta aberta cuja sessão de
   revisão deixou de estar agendada, e a aberta acompanha a duração do peso
   atual da matéria. Devolve o mesmo objeto se nada mudou. */
export function sincronizarRevisoes(est, revisoes, hojeIso, duracao) {
  const fim = somarDias(est.chave, 6);
  const naSemana = new Map();
  (revisoes || []).forEach((r) => (r.sessoes || []).forEach((s) => {
    if (s.dia >= est.chave && s.dia <= fim) naSemana.set(`${r.id}|${s.dia}`, { r, s });
  }));
  let mudou = false;
  const metas = {};
  DIAS.forEach((d) => {
    metas[d.k] = (est.metas[d.k] || []).filter((m) => {
      if (m.tipo !== "revisao" || m.done || !m.revisaoId) return true;
      const ok = naSemana.get(`${m.revisaoId}|${m.dia}`)?.s.status === "agendada";
      if (!ok) mudou = true;
      return ok;
    }).map((m) => {
      if (m.tipo !== "revisao" || m.done || !m.revisaoId) return m;
      const min = duracaoDa(duracao, naSemana.get(`${m.revisaoId}|${m.dia}`).r);
      if (min === m.minutos) return m;
      mudou = true;
      return { ...m, minutos: min };
    });
  });
  const presentes = new Set(DIAS.flatMap((d) => metas[d.k]).filter((m) => m.revisaoId).map((m) => `${m.revisaoId}|${m.dia}`));
  naSemana.forEach(({ r, s }, chave) => {
    if (s.status !== "agendada" || s.dia < hojeIso || presentes.has(chave)) return;
    metas[chaveDoDia(s.dia)].unshift({
      id: `${est.chave}:rv-${r.id}-${s.dia}`, tipo: "revisao", revisaoId: r.id, dia: s.dia, materiaId: r.materiaId,
      topicoId: r.topicoId || null, subtopicoId: r.subtopicoId || null, itemId: r.itemId || null, minutos: duracaoDa(duracao, r), done: false,
    });
    mudou = true;
  });
  return mudou ? { ...est, metas } : est;
}

/* Metas de hoje e atrasadas. Atrasadas: pendências de semanas anteriores,
   metas de dias que já passaram nesta semana e revisões vencidas. Uma meta
   feita hoje continua visível até o fim do dia. */
export function listasDoDia(est, hojeIso, revisoes = [], duracao) {
  const k = chaveDoDia(hojeIso);
  const h = idxDia(k);
  const visivel = (m) => !m.done || m.feitoEm === hojeIso;
  const datas = datasDaSemana(est.chave);
  const atrasadas = [
    ...(est.pendentes || []).filter(visivel),
    ...DIAS.slice(0, h).flatMap((d) => (est.metas[d.k] || []).filter(visivel).map((m) => ({ ...m, origem: m.origem || d.nome.toLowerCase(), diaOrigem: datas[d.k] }))),
    ...revisoesAtrasadas(revisoes, hojeIso, est, duracao),
  ];
  return { hoje: hojeIso, metasHoje: est.metas[k] || [], atrasadas };
}

export function acharMeta(est, id) {
  const p = (est.pendentes || []).find((m) => m.id === id);
  if (p) return { meta: p, onde: "pendentes" };
  for (const d of DIAS) {
    const m = (est.metas[d.k] || []).find((x) => x.id === id);
    if (m) return { meta: m, onde: d.k };
  }
  return null;
}

// altera a cópia recebida
export function marcarMeta(est, id, { done, hojeIso, sessaoId, conteudo }) {
  const achada = acharMeta(est, id);
  if (!achada) return null;
  const m = achada.meta;
  m.done = done;
  if (done) {
    m.feitoEm = hojeIso;
    if (sessaoId) m.sessaoId = sessaoId;
    if (conteudo) Object.assign(m, conteudo);
  } else {
    delete m.feitoEm;
    delete m.sessaoId;
  }
  return m;
}

/* Leva uma meta aberta para outro dia da MESMA semana, de hoje em diante
   (antecipando ou adiando). Serve também para a meta atrasada desta semana e
   para a pendência de semana anterior. `para`: chave do dia ("qua") ou data.
   Altera a cópia; devolve { ok, motivo } e, numa revisão, { revisao: { revisaoId,
   de, para } } para o serviço mudar o dia da sessão no mesmo lote. */
export function moverMeta(est, id, para, hojeIso) {
  const datas = datasDaSemana(est.chave);
  const k = /^\d{4}-\d{2}-\d{2}$/.test(String(para)) ? DIAS.find((d) => datas[d.k] === para)?.k : DIAS.find((d) => d.k === para)?.k;
  if (!k) return { ok: false, motivo: "Só dá para mover dentro da semana atual." };
  if (datas[k] < hojeIso) return { ok: false, motivo: "Esse dia já passou: o estudo não pode ser feito no passado." };
  const achada = acharMeta(est, id);
  if (!achada) return { ok: false, motivo: "Meta não encontrada. A semana pode ter virado; recarregue." };
  const { meta, onde } = achada;
  if (meta.done) return { ok: false, motivo: "Meta concluída não muda de dia." };
  if (onde === k) return { ok: false, motivo: "A meta já está nesse dia." };
  if (onde === "pendentes") est.pendentes = est.pendentes.filter((m) => m.id !== id);
  else est.metas[onde] = est.metas[onde].filter((m) => m.id !== id);
  const r = { ok: true };
  if (meta.tipo === "revisao" && meta.revisaoId) {
    r.revisao = { revisaoId: meta.revisaoId, de: meta.dia, para: datas[k] };
    meta.dia = datas[k];
  }
  est.metas[k].push(meta);
  est.editada = true;
  return r;
}

/* Muda a posição de uma meta dentro do dia (setas ou arrastar). */
export function reordenarNoDia(est, k, id, passo) {
  const lista = est.metas[k] || [];
  const i = lista.findIndex((m) => m.id === id);
  const j = i + passo;
  if (i < 0 || j < 0 || j >= lista.length) return false;
  [lista[i], lista[j]] = [lista[j], lista[i]];
  est.editada = true;
  return true;
}

/* Base comum da reorganização e do replanejamento: o que fica (dias que já
   passaram, metas feitas e revisões), quanto de cada matéria já foi usado na
   semana, e o espaço que sobra de hoje em diante. */
function baseDaReorganizacao(est, ctx, hojeIso, { levarAtrasadas = false } = {}) {
  const h = idxDia(chaveDoDia(hojeIso));
  const passada = hojeIso > somarDias(est.chave, 6);
  const datas = datasDaSemana(est.chave);
  const foraDoPlano = (k) => !!ctx.inicio && datas[k] < ctx.inicio;
  const metas = vazia();
  const usado = {}, ocupado = {}, capacidade = {}, capacidadeCota = {}, revisoesCota = {};
  const comRevisao = new Set();
  const atrasadas = [];
  DIAS.forEach((d, i) => {
    const antes = passada || i < h;
    // no replanejamento, a meta de estudo aberta de um dia que já passou sai
    // dele e vira pendência (continua contando na cota da semana, abaixo)
    if (levarAtrasadas && antes && !passada) {
      (est.metas[d.k] || []).filter((m) => !m.done && m.tipo !== "revisao").forEach((m) => {
        atrasadas.push(m);
        usado[m.materiaId] = (usado[m.materiaId] || 0) + paraBlocos(m.minutos);
      });
    }
    const manter = (est.metas[d.k] || []).filter((m) => (antes && !(levarAtrasadas && !passada && !m.done && m.tipo !== "revisao")) || m.done || m.tipo === "revisao").map((m) => ({ ...m }));
    metas[d.k] = manter;
    manter.forEach((m) => {
      if (m.tipo === "revisao") {
        revisoesCota[d.k] = (revisoesCota[d.k] || 0) + paraBlocos(m.minutos);
        comRevisao.add(m.materiaId);
      } else if (m.done || antes) usado[m.materiaId] = (usado[m.materiaId] || 0) + paraBlocos(m.minutos);
    });
    ocupado[d.k] = antes ? 0 : paraBlocos(somaMin(manter));
    capacidadeCota[d.k] = foraDoPlano(d.k) ? 0 : Number(ctx.disp?.[d.k]) || 0;
    capacidade[d.k] = antes ? 0 : capacidadeCota[d.k];
  });
  return { h, passada, metas, atrasadas, entrada: { materias: ctx.materias || [], capacidade, capacidadeCota, revisoesCota, comRevisao, ocupado, usado, ordemMaterias: ctx.ordemMaterias } };
}

function juntar(base, dias, ctx, prefixo) {
  const rank = rankDaOrdem(ctx.ordemMaterias, ctx.materias || []);
  const metas = vazia();
  DIAS.forEach((d, i) => {
    const novas = dias[d.k].map((m) => ({ ...limpa(comConteudo(ctx, m), prefixo), ...(m.replanejada ? { replanejada: true } : {}) }));
    metas[d.k] = base.passada || i < base.h ? base.metas[d.k] : ordenarDia([...base.metas[d.k], ...novas], rank);
  });
  return metas;
}

/* Refaz o que ainda não foi feito de hoje em diante, com o motor. Dias que já
   passaram e metas feitas ficam como estão; o que já foi feito (ou ficou em
   dias passados) é descontado da cota de cada matéria. Serve para "voltar ao
   automático" e para aplicar um plano alterado. */
export function reorganizarSemana(est, ctx, hojeIso) {
  const base = baseDaReorganizacao(est, ctx, hojeIso);
  const geracao = (est.geracao || 0) + 1;
  const { dias, resumo } = planejarSemana({ ...base.entrada, prefixo: "" });
  const metas = juntar(base, dias, ctx, `${est.chave}:g${geracao}:`);
  DIAS.forEach((d) => { metas[d.k] = metas[d.k].map(({ replanejada: _r, ...m }) => m); });
  return { ...est, metas, editada: false, geracao, motorVersao: MOTOR_VERSAO, semTempo: resumo.materiasSemTempo };
}

/* "Preciso de mais tempo": sessão extra no dia seguinte com mais folga (no
   domingo, fica no próprio dia). Altera a cópia; devolve o dia escolhido. */
export function adicionarTempoExtra(est, ctx, { materiaId, topicoId, subtopicoId, itemId, minutos }, hojeIso, sufixo) {
  const h = idxDia(chaveDoDia(hojeIso));
  const folga = (k) => (Number(ctx.disp?.[k]) || 0) - somaMin(est.metas[k] || []);
  const seguintes = DIAS.slice(h + 1);
  const destino = seguintes.length ? seguintes.reduce((a, b) => (folga(b.k) > folga(a.k) ? b : a)) : DIAS[h];
  est.metas[destino.k].push({
    id: `${est.chave}:x${sufixo}`, tipo: "ciclo", materiaId, minutos, done: false,
    topicoId: topicoId || null, subtopicoId: subtopicoId || null, itemId: itemId || null, extra: true,
  });
  return destino;
}

/* Replanejamento: as metas atrasadas (as de estudo, abertas, dos dias desta
   semana que já passaram, e as pendências de semanas anteriores) entram
   primeiro no que resta da semana, de hoje em diante; depois, o que falta da
   cota de cada matéria. O que não couber volta como pendência. */
export function previaReplanejamento(est, ctx, hojeIso) {
  const base = baseDaReorganizacao(est, ctx, hojeIso, { levarAtrasadas: true });
  const pendentes = [...(est.pendentes || []).filter((m) => !m.done), ...base.atrasadas];
  const pendencias = {};
  pendentes.forEach((m) => { pendencias[m.materiaId] = (pendencias[m.materiaId] || 0) + Math.max(1, Math.ceil((m.minutos || 0) / BLOCO_MIN)); });
  const { dias, resumo } = planejarSemana({ ...base.entrada, pendencias, prefixo: "" });
  DIAS.forEach((d) => dias[d.k].forEach((m) => { if (m.tipo === "ciclo") m.replanejada = true; }));
  const geracao = (est.geracao || 0) + 1;
  const semana = juntar(base, dias, ctx, `${est.chave}:p${geracao}:`);
  const naoCouberam = Object.entries(resumo.pendenciasSemEspaco).map(([materiaId, b]) => ({ materiaId, minutos: b * BLOCO_MIN }));
  const novas = DIAS.flatMap((d) => semana[d.k]).filter((m) => m.replanejada);
  return {
    semana,
    resumo: {
      totalRealocado: somaMin(novas), materiasFundidas: 0, qtdPendencias: pendentes.length,
      totalRevisoes: somaMin(DIAS.flatMap((d) => semana[d.k]).filter((m) => m.tipo === "revisao")),
      naoCouberam, minutosSemEspaco: somaMin(naoCouberam), materiasSemTempo: resumo.materiasSemTempo,
    },
  };
}

export function aplicarReplanejamento(est, { semana, resumo }, hojeIso) {
  const geracao = (est.geracao || 0) + 1;
  const metas = vazia();
  DIAS.forEach((d) => { metas[d.k] = (semana[d.k] || []).map((m) => limpa(m)); });
  const sobras = (resumo.naoCouberam || []).map((x, i) => ({
    id: `${est.chave}:s${geracao}-${i}`, tipo: "ciclo", materiaId: x.materiaId, minutos: x.minutos, done: false,
    topicoId: null, subtopicoId: null, itemId: null, origem: "sem espaço na semana",
  }));
  const feitasHoje = (est.pendentes || []).filter((m) => m.done && m.feitoEm === hojeIso);
  return { ...est, metas, pendentes: [...feitasHoje, ...sobras], editada: false, geracao, motorVersao: MOTOR_VERSAO };
}

/* Conteúdo mostrado numa meta: a aberta segue o progresso; a feita e a
   revisão mostram o que foi gravado. */
export function conteudoDaMeta(meta, conteudoDaVez) {
  if (meta.done || meta.tipo === "revisao") return { topicoId: meta.topicoId, subtopicoId: meta.subtopicoId, itemId: meta.itemId };
  const c = conteudoDaVez?.(meta.materiaId);
  return c ? { topicoId: c.topicoId, subtopicoId: c.subtopicoId, itemId: c.itemId } : { topicoId: meta.topicoId, subtopicoId: meta.subtopicoId, itemId: meta.itemId };
}

/* Situação dos dias da semana (para a grade e o resumo). */
export function statusDoDia(metas, iso, hojeIso) {
  if (!metas.length) return "livre";
  if (metas.every((m) => m.done)) return "cumprido";
  return iso < hojeIso ? "perdido" : "aberto";
}
