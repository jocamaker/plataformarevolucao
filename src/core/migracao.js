/* Migração para o motor de blocos e pesos (motorVersao 3). Pura e idempotente:
   rodar de novo sobre um plano já migrado não muda nada.
   v2 → v3: meta de estudo de 60 a 180 min (maxSessao de 30 vira 60), limite
   padrão do dia de 8 h para 16 h e permissões novas ligadas onde faltam.

   - peso: quem não tem recebe um, pela incidência antiga (minutosSemanais em
     relação à maior matéria do plano): r ≥ 0,75 → 3; 0,45 ≤ r < 0,75 → 2;
     r < 0,45 → 1. Tudo zerado → 2.
   - maxSessao: o valor válido mais próximo (30 a 180).
   - revisao.duracaoMin sai (a duração vem do peso).
   - disponibilidade (só no plano do aluno): cada dia em múltiplo de 30,
     dentro dos limites; abaixo do mínimo semanal, os dias com mais tempo
     sobem de 30 em 30 até alcançá-lo.
   minutosSemanais e prioridade ficam no documento, sem efeito. */

import { DIAS } from "./nucleo.js";
import { BLOCO_MIN, DURACOES_META, arredBloco, arredMaxSessao } from "./blocos.js";
import { LIMITES_PADRAO, PERMISSOES_PADRAO, minimoSemanal, pesoValido } from "./plano.js";

export const MOTOR_VERSAO = 3;
const LIMITE_ANTIGO = 480; // máximo por dia do motor v2

export function pesoPelaIncidencia(minutos, maior) {
  if (!maior) return 2;
  const r = (Number(minutos) || 0) / maior;
  return r >= 0.75 ? 3 : r >= 0.45 ? 2 : 1;
}

export function migrarMaterias(materias = []) {
  const maior = Math.max(0, ...materias.map((m) => Number(m.minutosSemanais) || 0));
  return materias.map((m) => ({
    ...m,
    peso: pesoValido(m.peso) ? m.peso : pesoPelaIncidencia(m.minutosSemanais, maior),
    maxSessao: DURACOES_META.includes(m.maxSessao) ? m.maxSessao : arredMaxSessao(m.maxSessao),
  }));
}

export function migrarDisponibilidade(disp = {}, limites = LIMITES_PADRAO, minimo = 0) {
  const { minDia, maxDia } = { ...LIMITES_PADRAO, ...(limites || {}) };
  const out = Object.fromEntries(DIAS.map((d) => [d.k, Math.min(maxDia, Math.max(minDia, arredBloco(disp?.[d.k])))]));
  const total = () => DIAS.reduce((s, d) => s + out[d.k], 0);
  while (total() < minimo) {
    const dia = DIAS.filter((d) => out[d.k] + BLOCO_MIN <= maxDia).reduce((a, d) => (!a || out[d.k] > out[a.k] ? d : a), null);
    if (!dia) break;
    out[dia.k] += BLOCO_MIN;
  }
  return out;
}

/* plano: modelo (jornada) ou plano do aluno. minimo: mínimo semanal do aluno
   (só vale para quem tem disponibilidade). → { plano, mudou } */
export function migrarPlanoV2(plano, { minimo = 0 } = {}) {
  if (!plano) return { plano, mudou: false };
  const novo = { ...plano, materias: migrarMaterias(plano.materias || []), motorVersao: MOTOR_VERSAO };
  if (plano.revisao) novo.revisao = { intervalos: [...(plano.revisao.intervalos || [7, 15, 30])] };
  if (!plano.limitesTempo) novo.limitesTempo = { ...LIMITES_PADRAO };
  else if ((plano.motorVersao || 0) < MOTOR_VERSAO && plano.limitesTempo.maxDia === LIMITE_ANTIGO) novo.limitesTempo = { ...plano.limitesTempo, maxDia: LIMITES_PADRAO.maxDia };
  // permissões criadas depois do plano: ligadas por padrão
  if (plano.permissoesAluno) novo.permissoesAluno = { ...PERMISSOES_PADRAO, ...plano.permissoesAluno };
  if (plano.disponibilidade) novo.disponibilidade = migrarDisponibilidade(plano.disponibilidade, novo.limitesTempo, minimo);
  const mudou = JSON.stringify(novo) !== JSON.stringify(plano);
  return { plano: mudou ? novo : plano, mudou };
}

/* Plano que o motor e as telas usam: um plano gravado antes do motor de
   blocos é convertido em memória (pesos, blocos, revisões), para o aluno já
   ver metas de 30 min antes de o moderador gravar a migração. */
export function planoParaMotor(plano, ind, prog = {}) {
  if (!plano || plano.motorVersao === MOTOR_VERSAO || !ind) return plano;
  return migrarPlanoV2(plano, { minimo: minimoSemanal(migrarPlanoV2(plano).plano, ind, prog) }).plano;
}
