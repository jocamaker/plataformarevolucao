/* performanceService: junta os cálculos do núcleo num painel. Nada é
   guardado; tudo sai dos registros (questões, simulados, sessões, semanas). */

import {
  consistencia, desempenhoPorMateria, desempenhoQuestoes, desempenhoSimulados, diasComAtividade,
  evolucaoQuestoes, filtrarRegistros,
} from "../core/desempenho.js";
import { calcularAtrasos, calcularProgressoPlano, itensDoPlano } from "../core/plano.js";
import { diasEntre, inicioDaSemana, somarDias } from "../core/datas.js";
import { DIAS } from "../core/nucleo.js";
import { listasDoDia } from "../core/semana.js";

const noPeriodo = (d, inicio, fim) => (!inicio || d >= inicio) && (!fim || d <= fim);

export function agrupamentoPara(inicio, fim) {
  if (!inicio || !fim) return "semana";
  const dias = diasEntre(inicio, fim);
  return dias <= 31 ? "dia" : dias <= 200 ? "semana" : "mes";
}

/* Metas da semana: cumpridas e não cumpridas (semanas fechadas + a atual até
   hoje) e as atrasadas agora. */
export function resumoMetas({ resumosSemana = [], semana, revisoes = [], hojeIso, inicio, fim }) {
  const fechadas = resumosSemana.filter((r) => noPeriodo(r.semana, inicio ? inicioDaSemana(inicio) : null, fim));
  let cumpridas = fechadas.reduce((s, r) => s + (r.cumpridas || 0), 0);
  let naoCumpridas = fechadas.reduce((s, r) => s + (r.naoCumpridas || 0), 0);
  let atrasadasAgora = 0;
  if (semana?.metas) {
    const ate = DIAS.findIndex((_, i) => somarDias(semana.chave, i) === hojeIso);
    DIAS.forEach((d, i) => (semana.metas[d.k] || []).forEach((m) => {
      if (m.done && noPeriodo(m.feitoEm, inicio, fim)) cumpridas++;
      else if (!m.done && ate >= 0 && i < ate) naoCumpridas++;
    }));
    atrasadasAgora = listasDoDia(semana, hojeIso, revisoes).atrasadas.filter((m) => !m.done).length;
  }
  return { cumpridas, naoCumpridas, atrasadasAgora };
}

/* Painel de desempenho de um aluno (a mesma função serve ao aluno e ao moderador). */
export function painelDoAluno({
  questoes = [], simulados = [], sessoes = [], resumosSemana = [], semana = null, revisoes = [],
  plano = null, progresso = {}, ind, hojeIso, filtros = {},
}) {
  const { inicio = null, fim = null } = filtros;
  const qf = filtrarRegistros(questoes, filtros);
  const sf = filtrarRegistros(simulados, { inicio, fim, vestibularId: filtros.vestibularId, ano: filtros.ano, cursoId: filtros.cursoId });
  const sessoesPeriodo = sessoes.filter((s) => noPeriodo(s.data, inicio, fim));

  const dias = diasComAtividade({ sessoes, questoes, simulados });
  const primeiro = [...dias].sort()[0] || plano?.inicio || hojeIso;
  const iniCons = inicio || (diasEntre(primeiro, hojeIso) > 365 ? somarDias(hojeIso, -364) : primeiro);
  const fimCons = !fim || fim > hojeIso ? hojeIso : fim;
  const cons = iniCons <= fimCons ? consistencia(dias, { inicio: iniCons, fim: fimCons }) : consistencia(dias, { inicio: hojeIso, fim: hojeIso });
  const ult30 = consistencia(dias, { inicio: somarDias(hojeIso, -29), fim: hojeIso });

  const itens = plano ? itensDoPlano(plano, ind) : [];
  const agrupamento = agrupamentoPara(inicio || primeiro, fimCons);
  return {
    questoes: desempenhoQuestoes(qf),
    registrosQuestoes: qf,
    porMateria: desempenhoPorMateria(qf, ind),
    agrupamento,
    evolucao: evolucaoQuestoes(qf, agrupamento),
    simulados: desempenhoSimulados(sf, ind),
    registrosSimulados: sf,
    consistencia: cons,
    ultimos30: { diasEstudados: ult30.diasEstudados, totalDias: 30, dias: ult30.dias, sequenciaAtual: ult30.sequenciaAtual },
    minutosEstudados: sessoesPeriodo.reduce((s, x) => s + (x.minutos || 0), 0),
    sessoes: sessoesPeriodo.length,
    metas: resumoMetas({ resumosSemana, semana, revisoes, hojeIso, inicio, fim }),
    plano: plano ? calcularProgressoPlano(itens, progresso, plano.cronograma, hojeIso) : null,
    atrasos: plano ? calcularAtrasos(itens, progresso, plano.cronograma, hojeIso) : null,
  };
}

export const SITUACOES = {
  em_dia: { nome: "Em dia", nivel: 0 },
  atencao: { nome: "Atenção", nivel: 1 },
  critico: { nome: "Crítico", nivel: 2 },
  sem_plano: { nome: "Sem plano", nivel: 1 },
};

/* Métricas de um aluno para a lista do moderador (últimos 30 dias). */
export function metricasAluno({ aluno, plano, progresso = {}, questoes = [], sessoes = [], simulados = [], ind, hojeIso }) {
  const inicio30 = somarDias(hojeIso, -29);
  const q30 = desempenhoQuestoes(questoes.filter((q) => q.data >= inicio30));
  const dias = diasComAtividade({ sessoes, questoes, simulados });
  const ult = [...dias].sort().pop() || null;
  const diasSemEstudar = ult ? diasEntre(ult, hojeIso) : null;
  // sem nenhum estudo, conta desde o início do plano (aluno novo não é "crítico")
  const referencia = ult || plano?.inicio || String(aluno.criadoEm || "").slice(0, 10) || null;
  const diasParados = referencia ? Math.max(0, diasEntre(referencia, hojeIso)) : null;
  const c30 = consistencia(dias, { inicio: inicio30, fim: hojeIso });
  const itens = plano ? itensDoPlano(plano, ind) : [];
  const prog = plano ? calcularProgressoPlano(itens, progresso, plano.cronograma, hojeIso) : null;
  const atr = plano ? calcularAtrasos(itens, progresso, plano.cronograma, hojeIso) : null;
  const sim = desempenhoSimulados(simulados, ind);

  let situacao = "em_dia";
  if (!plano) situacao = "sem_plano";
  else if ((diasParados ?? 0) >= 7 || (atr?.maxDias || 0) >= 14) situacao = "critico";
  else if ((diasParados ?? 0) >= 3 || (atr?.quantidade || 0) > 0) situacao = "atencao";

  return {
    alunoId: aluno.id,
    planoPct: prog?.pct ?? null,
    fimPrevisto: plano?.fimPrevisto || null,
    dataAlvo: plano?.dataAlvo || null,
    atrasados: atr?.quantidade || 0,
    maxDiasAtraso: atr?.maxDias || 0,
    cargaAtrasadaMin: atr?.cargaMin || 0,
    questoes30: q30.total,
    pct30: q30.pct,
    diasEstudados30: c30.diasEstudados,
    ultimoEstudo: ult,
    diasSemEstudar,
    diasParados,
    simulados: sim.quantidade,
    mediaSimulados: sim.mediaPct,
    situacao,
  };
}
