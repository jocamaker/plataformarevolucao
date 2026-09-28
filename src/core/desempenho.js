/* Desempenho calculado a partir dos registros (única fonte de verdade).
   Nada aqui é guardado: percentuais, totais e sequências saem sempre dos
   registros de questões, simulados e sessões de estudo.

   Registro de questões: { data, materiaId, topicoId, subtopicoId, vestibularId, total, acertos, erros }
   Simulado:             { data, vestibularId, ano, cursoId, total, acertos, erros }
   Filtro:               { inicio, fim, materiaId, topicoId, subtopicoId, vestibularId, ano, cursoId } */

import { diasEntre, inicioDaSemana, intervalo, noIntervalo } from "./datas.js";

export const pct = (parte, total) => (total ? Math.round((parte / total) * 1000) / 10 : 0);
export const fmtPct = (v) => `${String(v).replace(".", ",")}%`;

export function filtrarRegistros(registros, f = {}) {
  return registros.filter((r) =>
    noIntervalo(r.data, f.inicio, f.fim)
    && (!f.materiaId || r.materiaId === f.materiaId)
    && (!f.topicoId || r.topicoId === f.topicoId)
    && (!f.subtopicoId || r.subtopicoId === f.subtopicoId)
    && (!f.vestibularId || r.vestibularId === f.vestibularId)
    && (!f.ano || String(r.ano) === String(f.ano))
    && (!f.cursoId || r.cursoId === f.cursoId));
}

export function desempenhoQuestoes(registros) {
  const total = registros.reduce((s, r) => s + (r.total || 0), 0);
  const acertos = registros.reduce((s, r) => s + (r.acertos || 0), 0);
  const erros = registros.reduce((s, r) => s + (r.erros || 0), 0);
  return {
    registros: registros.length, total, acertos, erros,
    emBranco: Math.max(0, total - acertos - erros),
    pct: pct(acertos, total),
    pctErros: pct(erros, total),
  };
}

function agrupar(registros, campo, nome) {
  const g = new Map();
  registros.forEach((r) => {
    const id = r[campo];
    if (!id) return;
    if (!g.has(id)) g.set(id, []);
    g.get(id).push(r);
  });
  return [...g.entries()]
    .map(([id, lista]) => ({ id, nome: nome(id), ...desempenhoQuestoes(lista) }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

export const desempenhoPorMateria = (registros, ind) => agrupar(registros, "materiaId", ind.nomeMateria);
export const desempenhoPorTopico = (registros, materiaId, ind) => agrupar(registros.filter((r) => r.materiaId === materiaId), "topicoId", ind.nomeTopico);
export const desempenhoPorSubtopico = (registros, topicoId, ind) => agrupar(registros.filter((r) => r.topicoId === topicoId), "subtopicoId", ind.nomeSubtopico);

/* Evolução percentual por semana (ou por dia/mês), só com períodos que têm registro. */
export function evolucaoQuestoes(registros, agrupamento = "semana") {
  const chave = (d) => (agrupamento === "dia" ? d : agrupamento === "mes" ? `${d.slice(0, 7)}-01` : inicioDaSemana(d));
  const g = new Map();
  registros.forEach((r) => {
    const k = chave(r.data);
    if (!g.has(k)) g.set(k, []);
    g.get(k).push(r);
  });
  return [...g.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([periodo, lista]) => {
    const d = desempenhoQuestoes(lista);
    return { periodo, total: d.total, acertos: d.acertos, pct: d.pct };
  });
}

/* Simulados: resumo geral e histórico por vestibular (sem ranking entre vestibulares). */
export function desempenhoSimulados(simulados, ind) {
  const porData = [...simulados].sort((a, b) => a.data.localeCompare(b.data));
  const media = (lista) => (lista.length ? Math.round((lista.reduce((s, x) => s + pct(x.acertos, x.total), 0) / lista.length) * 10) / 10 : 0);
  const grupos = new Map();
  porData.forEach((s) => {
    if (!grupos.has(s.vestibularId)) grupos.set(s.vestibularId, []);
    grupos.get(s.vestibularId).push(s);
  });
  return {
    quantidade: simulados.length,
    mediaPct: media(simulados),
    porVestibular: [...grupos.entries()]
      .map(([vestibularId, lista]) => ({
        vestibularId,
        nome: ind?.nomeVestibular(vestibularId) || vestibularId,
        quantidade: lista.length,
        mediaPct: media(lista),
        ultimoPct: pct(lista[lista.length - 1].acertos, lista[lista.length - 1].total),
        historico: lista.map((s) => ({ id: s.id, data: s.data, nome: s.nome, pct: pct(s.acertos, s.total), acertos: s.acertos, total: s.total })),
      }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
  };
}

/* Dias com atividade acadêmica: sessão de estudo, questões, simulado ou outra. */
export function diasComAtividade({ sessoes = [], questoes = [], simulados = [], outras = [] } = {}) {
  const dias = new Set();
  [sessoes, questoes, simulados, outras].forEach((lista) => lista.forEach((r) => r?.data && dias.add(r.data.slice(0, 10))));
  return dias;
}

/* Consistência num período: dias estudados, dias em branco e sequências.
   A sequência atual não quebra por hoje ainda estar em branco. */
export function consistencia(diasAtivos, { inicio, fim }) {
  const dias = intervalo(inicio, fim).map((data) => ({ data, estudou: diasAtivos.has(data) }));
  const diasEstudados = dias.filter((d) => d.estudou).length;
  let atual = 0;
  for (let i = dias.length - 1; i >= 0; i--) {
    if (dias[i].estudou) atual++;
    else if (i === dias.length - 1) continue;
    else break;
  }
  let maior = 0, corrente = 0;
  dias.forEach((d) => { corrente = d.estudou ? corrente + 1 : 0; maior = Math.max(maior, corrente); });
  return {
    dias,
    totalDias: dias.length,
    diasEstudados,
    diasEmBranco: dias.length - diasEstudados,
    sequenciaAtual: atual,
    maiorSequencia: maior,
    ultimoDiaEstudado: [...dias].reverse().find((d) => d.estudou)?.data || null,
    diasDesdeUltimoEstudo: (() => {
      const u = [...diasAtivos].sort().pop();
      return u ? diasEntre(u, fim) : null;
    })(),
  };
}

/* Nomes pedidos na especificação (as funções de plano ficam em plano.js). */
export {
  desempenhoQuestoes as calculateQuestionPerformance,
  desempenhoPorMateria as calculateSubjectPerformance,
  desempenhoPorTopico as calculateTopicPerformance,
  desempenhoSimulados as calculateMockPerformance,
  consistencia as calculateStudyConsistency,
};
