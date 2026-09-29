/* Visão completa de um aluno, usada pelas telas do aluno e pelo painel do
   moderador: os mesmos registros e os mesmos cálculos (uma fonte só). */

import { useMemo } from "react";
import { useApp } from "./AppContext.jsx";
import {
  useAluno, usePlano, useProgresso, useQuestoes, useResumosSemana, useRevisoes, useSemana, useSessoes, useSimulados,
} from "./hooks.js";
import {
  calcularAtrasos, calcularProgressoPlano, conteudoDaVez, duracaoRevisao, estadoItem, itensDoPlano, pesoDaMateria, statusItem,
} from "../core/plano.js";
import { planoParaMotor } from "../core/migracao.js";
import { conteudoDaMeta, listasDoDia } from "../core/semana.js";
import { consistencia, diasComAtividade } from "../core/desempenho.js";
import { somarDias } from "../core/datas.js";

export function useVisaoAluno(alunoId, { semana: comSemana = true } = {}) {
  const { ind } = useApp();
  const aluno = useAluno(alunoId);
  const planoBruto = usePlano(alunoId);
  const progresso = useProgresso(alunoId);
  // plano antigo: convertido em memória para o motor de blocos (a gravação é do moderador)
  const plano = useMemo(() => (planoBruto && ind ? planoParaMotor(planoBruto, ind, progresso || {}) : planoBruto), [planoBruto, ind, progresso]);
  const { semana, hoje } = useSemana(comSemana ? alunoId : null);
  const revisoes = useRevisoes(alunoId);
  const sessoes = useSessoes(alunoId);
  const questoes = useQuestoes(alunoId);
  const simulados = useSimulados(alunoId);
  const resumosSemana = useResumosSemana(alunoId);

  const carregando = [aluno, plano, progresso, revisoes, sessoes, questoes, simulados].some((x) => x === undefined) || !ind;

  const derivado = useMemo(() => {
    if (carregando || !hoje) return null;
    const prog = progresso || {};
    const itens = plano ? itensDoPlano(plano, ind) : [];
    const daVez = (materiaId) => conteudoDaVez(itens, prog, materiaId, ind);
    const comConteudo = (m) => ({ ...m, ...conteudoDaMeta(m, daVez) });
    const semanaValida = semana && semana.chave <= hoje && hoje <= somarDias(semana.chave, 6) ? semana : null;
    const duracaoRev = (materiaId) => duracaoRevisao(pesoDaMateria(plano, materiaId));
    const dia = semanaValida ? listasDoDia(semanaValida, hoje, revisoes, duracaoRev) : { metasHoje: [], atrasadas: [] };
    const metasHoje = dia.metasHoje.map(comConteudo);
    const atrasadas = dia.atrasadas.map(comConteudo);
    const todasDoDia = [...atrasadas, ...metasHoje];
    const ativos = diasComAtividade({ sessoes, questoes, simulados });
    const c30 = consistencia(ativos, { inicio: somarDias(hoje, -29), fim: hoje });
    return {
      itens,
      daVez,
      comConteudo,
      semana: semanaValida,
      metasHoje,
      atrasadas,
      feitasHoje: todasDoDia.filter((m) => m.done).length,
      totalHoje: todasDoDia.length,
      minutosPlanejadosHoje: todasDoDia.reduce((s, m) => s + m.minutos, 0),
      minutosHoje: sessoes.filter((x) => x.data === hoje).reduce((s, x) => s + x.minutos, 0),
      questoesHoje: questoes.filter((q) => q.data === hoje).reduce((s, q) => s + q.total, 0),
      progressoPlano: plano ? calcularProgressoPlano(itens, prog, plano.cronograma, hoje) : null,
      atrasos: plano ? calcularAtrasos(itens, prog, plano.cronograma, hoje) : null,
      status: (it) => statusItem(it, prog, plano?.cronograma, hoje),
      estado: (it) => estadoItem(it, prog),
      consistencia30: c30,
    };
  }, [carregando, hoje, plano, progresso, semana, revisoes, sessoes, questoes, simulados, ind]);

  return { carregando, aluno, plano, planoBruto, progresso: progresso || {}, semanaDoc: semana, revisoes, sessoes, questoes, simulados, resumosSemana, hoje, ind, ...(derivado || {}) };
}
