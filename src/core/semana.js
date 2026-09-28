/* Semana de metas do aluno (funções puras sobre o estado da semana).

   Estado: { chave, metas: { seg: [meta], … }, pendentes: [meta], editada, geracao }
   Meta:   { id, tipo: "ciclo" | "revisao", materiaId, minutos, done, feitoEm,
             sessaoId, topicoId, subtopicoId, itemId, revisaoId, dia, extra, origem }

   Contexto do motor: { ciclo, disp, revisoes, conteudoDaVez(materiaId) }, montado
   a partir do plano individual (ver services/estudo.js). O conteúdo de uma
   meta ainda aberta é sempre o "da vez" (segue o progresso); o de uma meta
   feita é o que ficou gravado na sessão. */

import { DIAS, dataParaDiaSemana, gerarSemana, recalcularPlanoInteligente } from "./nucleo.js";
import { fmtDataCurta, inicioDaSemana, somarDias } from "./datas.js";

export const idxDia = (k) => DIAS.findIndex((d) => d.k === k);
export const chaveDoDia = (iso) => dataParaDiaSemana(iso);
export const somaMin = (metas) => metas.reduce((s, m) => s + (m.minutos || 0), 0);

export function datasDaSemana(chave) {
  return Object.fromEntries(DIAS.map((d, i) => [d.k, somarDias(chave, i)]));
}

const vazia = () => Object.fromEntries(DIAS.map((d) => [d.k, []]));

// campos que ficam no banco (nomes vêm do índice na hora de mostrar)
function limpa(m, prefixo) {
  return {
    id: `${prefixo}${m.id}`, tipo: m.tipo === "revisao" ? "revisao" : "ciclo", materiaId: m.materiaId || "",
    minutos: m.minutos, done: !!m.done, topicoId: m.topicoId || null, subtopicoId: m.subtopicoId || null,
    itemId: m.itemId || null, ...(m.revisaoId ? { revisaoId: m.revisaoId, dia: m.dia || null } : {}),
    ...(m.feitoEm ? { feitoEm: m.feitoEm } : {}), ...(m.sessaoId ? { sessaoId: m.sessaoId } : {}),
    ...(m.extra ? { extra: true } : {}), ...(m.origem ? { origem: m.origem } : {}),
  };
}

// dia de cada revisão na semana (o motor não guarda a data na meta)
function comDiaDaRevisao(metas, ctx, chave) {
  const datas = datasDaSemana(chave);
  DIAS.forEach((d) => (metas[d.k] || []).forEach((m) => { if (m.tipo === "revisao") m.dia = datas[d.k]; }));
  return metas;
}

/* Dias antes do início do plano (ctx.inicio) não recebem metas: quem começa
   no meio da semana não nasce com atrasos de dias em que o plano nem existia. */
export function gerarSemanaNova(ctx, chave) {
  const datas = datasDaSemana(chave);
  const disp = ctx.inicio && ctx.inicio > chave
    ? Object.fromEntries(DIAS.map((d) => [d.k, datas[d.k] < ctx.inicio ? 0 : Number(ctx.disp?.[d.k]) || 0]))
    : ctx.disp;
  const bruta = gerarSemana(ctx.ciclo, disp, ctx.revisoes, { semana: chave, conteudoDaVez: ctx.conteudoDaVez });
  comDiaDaRevisao(bruta, ctx, chave);
  const metas = vazia();
  DIAS.forEach((d) => { metas[d.k] = bruta[d.k].map((m) => limpa(m, `${chave}:`)); });
  return { chave, metas, pendentes: [], editada: false, geracao: 0 };
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
export function revisoesAtrasadas(revisoes, hojeIso, est) {
  const naSemana = new Set(DIAS.flatMap((d) => est?.metas?.[d.k] || []).filter((m) => m.revisaoId).map((m) => `${m.revisaoId}|${m.dia}`));
  const out = [];
  (revisoes || []).forEach((r) => (r.sessoes || []).forEach((s) => {
    if (s.dia >= hojeIso || naSemana.has(`${r.id}|${s.dia}`)) return;
    const feitaHoje = s.status === "realizada" && s.realizadaEm === hojeIso;
    if (s.status !== "agendada" && !feitaHoje) return;
    out.push({
      id: idRevisaoAvulsa(r.id, s.dia), tipo: "revisao", revisaoId: r.id, dia: s.dia, materiaId: r.materiaId,
      topicoId: r.topicoId, subtopicoId: r.subtopicoId || null, itemId: r.itemId, minutos: r.duracaoMin || 20,
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
   para esta semana (de hoje em diante) e sai a meta aberta cuja sessão de
   revisão deixou de estar agendada. Devolve o mesmo objeto se nada mudou. */
export function sincronizarRevisoes(est, revisoes, hojeIso) {
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
    });
  });
  const presentes = new Set(DIAS.flatMap((d) => metas[d.k]).filter((m) => m.revisaoId).map((m) => `${m.revisaoId}|${m.dia}`));
  naSemana.forEach(({ r, s }, chave) => {
    if (s.status !== "agendada" || s.dia < hojeIso || presentes.has(chave)) return;
    metas[chaveDoDia(s.dia)].unshift({
      id: `${est.chave}:rv-${r.id}-${s.dia}`, tipo: "revisao", revisaoId: r.id, dia: s.dia, materiaId: r.materiaId,
      topicoId: r.topicoId || null, subtopicoId: r.subtopicoId || null, itemId: r.itemId || null, minutos: r.duracaoMin || 20, done: false,
    });
    mudou = true;
  });
  return mudou ? { ...est, metas } : est;
}

/* Metas de hoje e atrasadas. Atrasadas: pendências de semanas anteriores,
   metas de dias que já passaram nesta semana e revisões vencidas. Uma meta
   feita hoje continua visível até o fim do dia. */
export function listasDoDia(est, hojeIso, revisoes = []) {
  const k = chaveDoDia(hojeIso);
  const h = idxDia(k);
  const visivel = (m) => !m.done || m.feitoEm === hojeIso;
  const datas = datasDaSemana(est.chave);
  const atrasadas = [
    ...(est.pendentes || []).filter(visivel),
    ...DIAS.slice(0, h).flatMap((d) => (est.metas[d.k] || []).filter(visivel).map((m) => ({ ...m, origem: m.origem || d.nome.toLowerCase(), diaOrigem: datas[d.k] }))),
    ...revisoesAtrasadas(revisoes, hojeIso, est),
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

export function moverMeta(est, id, de, para) {
  const i = (est.metas[de] || []).findIndex((m) => m.id === id);
  if (i < 0 || de === para) return false;
  const [meta] = est.metas[de].splice(i, 1);
  est.metas[para].push(meta);
  est.editada = true;
  return true;
}

/* Refaz o que ainda não foi feito de hoje em diante, com a alocação atual do
   plano. Dias que já passaram e metas feitas ficam como estão; o que já foi
   feito na semana é descontado da cota de cada matéria. Serve para "voltar à
   distribuição automática" e para aplicar um plano recalculado. */
export function reorganizarSemana(est, ctx, hojeIso) {
  const h = idxDia(chaveDoDia(hojeIso));
  const passada = hojeIso > somarDias(est.chave, 6);
  const metas = vazia();
  const usado = {};
  const cap = {};
  DIAS.forEach((d, i) => {
    const antes = passada || i < h;
    const manter = (est.metas[d.k] || []).filter((m) => antes || m.done || m.tipo === "revisao");
    metas[d.k] = manter.map((m) => ({ ...m }));
    manter.filter((m) => m.tipo !== "revisao" && (m.done || antes)).forEach((m) => { usado[m.materiaId] = (usado[m.materiaId] || 0) + m.minutos; });
    cap[d.k] = antes ? 0 : Math.max(0, (Number(ctx.disp?.[d.k]) || 0) - somaMin(manter));
  });
  const geracao = (est.geracao || 0) + 1;
  const ciclo = {
    alocacoes: (ctx.ciclo?.alocacoes || []).map((a) => ({ ...a, minutosSemanais: Math.max(0, (a.minutosSemanais || 0) - (usado[a.materiaId] || 0)) })),
  };
  const bruta = gerarSemana(ciclo, cap, [], { conteudoDaVez: ctx.conteudoDaVez });
  DIAS.forEach((d) => bruta[d.k].forEach((m) => metas[d.k].push(limpa(m, `${est.chave}:g${geracao}:`))));
  return { ...est, metas, editada: false, geracao };
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

/* Replanejamento das pendências dentro da semana (motor do núcleo). */
export function previaReplanejamento(est, ctx, hojeIso) {
  const pendentes = (est.pendentes || []).filter((m) => !m.done);
  const semanaAtual = Object.fromEntries(DIAS.map((d) => [d.k, (est.metas[d.k] || []).map((m) => ({ ...m, materia: m.materiaId }))]));
  const r = recalcularPlanoInteligente(ctx.ciclo, ctx.disp, semanaAtual, pendentes.map((m) => ({ ...m, materia: m.materiaId })), ctx.revisoes, {
    hoje: chaveDoDia(hojeIso), semana: est.chave, conteudoDaVez: ctx.conteudoDaVez,
  });
  comDiaDaRevisao(r.semana, ctx, est.chave);
  return r;
}

export function aplicarReplanejamento(est, { semana, resumo }, hojeIso) {
  const geracao = (est.geracao || 0) + 1;
  const metas = vazia();
  DIAS.forEach((d) => {
    metas[d.k] = (semana[d.k] || []).map((m) => (String(m.id).startsWith(`${est.chave}:`) ? limpa(m, "") : limpa(m, `${est.chave}:p${geracao}:`)));
  });
  const sobras = (resumo.naoCouberam || []).map((x, i) => ({
    id: `${est.chave}:s${geracao}-${i}`, tipo: "ciclo", materiaId: x.materiaId, minutos: x.minutos, done: false,
    topicoId: null, subtopicoId: null, itemId: null, origem: "sem espaço na semana",
  }));
  const feitasHoje = (est.pendentes || []).filter((m) => m.done && m.feitoEm === hojeIso);
  return { ...est, metas, pendentes: [...feitasHoje, ...sobras], editada: false, geracao };
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
