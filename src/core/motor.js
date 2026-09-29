/* Motor de metas da semana, em blocos de 30 min (ver blocos.js).

   Só o moderador decide quais matérias estão ativas e o peso (1 a 3) de
   cada uma; o motor reparte o tempo do aluno na proporção dos pesos:

   1. Capacidade: blocos de cada dia (dias bloqueados valem 0).
   2. Revisões: entram no seu dia, mesmo sem espaço (o dia fica sobrecarregado).
   3. Repartição: os blocos livres da semana (R) vão para as matérias ativas
      com conteúdo pendente, na proporção dos pesos, pelo método dos maiores
      restos. Desempate: maior peso, depois a posição no edital.
   4. Bloco mínimo: toda matéria ativa com conteúdo pendente aparece ao menos
      uma vez na semana (uma revisão conta); quem ficou sem bloco recebe 1,
      tirado da que ficou com mais.
   5. Metas: os blocos de cada matéria viram metas de até maxSessao, iguais.
   6. Dias: rodadas intercaladas (maior peso primeiro); cada meta vai para o
      dia com mais blocos livres que a comporte e ainda não tenha a matéria.
   7. Ordem no dia: revisões, depois a ordem do aluno, depois o edital.

   Tudo é determinístico: mesma entrada, mesma saída (ids com a chave da
   semana e um índice). A ordem escolhida pelo aluno (ordemMaterias) só muda
   a sequência dentro do dia, nunca os minutos: por isso ela não entra no
   desempate da repartição (senão o aluno mudaria a divisão do moderador
   só reordenando a lista). */

import { DIAS } from "./nucleo.js";
import { deBlocos, paraBlocos } from "./blocos.js";

const pesoDe = (m) => (m.peso === 1 || m.peso === 2 || m.peso === 3 ? m.peso : 2);

/* Passo 3. materias: [{ materiaId, peso, pos, pendente }] → { [materiaId]: blocos } */
export function repartirPorPeso(R, materias) {
  const blocos = Object.fromEntries(materias.map((m) => [m.materiaId, 0]));
  const eleg = materias.filter((m) => m.pendente !== false);
  const soma = eleg.reduce((s, m) => s + pesoDe(m), 0);
  if (!soma || R <= 0) return blocos;
  // restos em inteiros (R × peso mod soma) para não depender de arredondamento
  const partes = eleg.map((m) => ({ m, base: Math.floor((R * pesoDe(m)) / soma), resto: (R * pesoDe(m)) % soma }));
  partes.forEach((p) => { blocos[p.m.materiaId] = p.base; });
  let sobra = R - partes.reduce((s, p) => s + p.base, 0);
  [...partes]
    .sort((a, b) => b.resto - a.resto || pesoDe(b.m) - pesoDe(a.m) || (a.m.pos ?? 0) - (b.m.pos ?? 0))
    .forEach((p) => { if (sobra > 0) { blocos[p.m.materiaId]++; sobra--; } });
  return blocos;
}

/* Passo 4. Toda matéria pendente aparece ao menos uma vez. comRevisao: ids
   com revisão na semana (a revisão conta como o bloco). Quem cede é a que
   ficou com mais blocos; no empate, a de menor peso e depois a mais ao fim
   do edital. Uma matéria só cede o último bloco se tiver revisão. */
export function garantirMinimo(blocos, materias, comRevisao = new Set()) {
  const out = { ...blocos };
  const semTempo = [];
  const pendentes = materias.filter((m) => m.pendente !== false);
  pendentes.forEach((m) => {
    if (out[m.materiaId] > 0 || comRevisao.has(m.materiaId)) return;
    const doador = pendentes
      .filter((d) => d.materiaId !== m.materiaId && out[d.materiaId] > (comRevisao.has(d.materiaId) ? 0 : 1))
      .sort((a, b) => out[b.materiaId] - out[a.materiaId] || pesoDe(a) - pesoDe(b) || (b.pos ?? 0) - (a.pos ?? 0))[0];
    if (!doador) { semTempo.push(m.materiaId); return; }
    out[doador.materiaId]--;
    out[m.materiaId] = 1;
  });
  return { blocos: out, semTempo };
}

/* Cota da semana: repartição + bloco mínimo. */
export function cotaDaSemana(R, materias, comRevisao) {
  return garantirMinimo(repartirPorPeso(R, materias), materias, comRevisao);
}

/* Passo 5. n blocos em metas de até max blocos, o mais iguais possível
   (maiores primeiro): 5 com máximo 2 → [2, 2, 1]. */
export function dividirEmMetas(n, max) {
  if (n <= 0) return [];
  const teto = Math.max(1, max);
  const qtd = Math.ceil(n / teto);
  const base = Math.floor(n / qtd);
  const extra = n % qtd;
  return Array.from({ length: qtd }, (_, i) => base + (i < extra ? 1 : 0));
}

/* Posição de cada matéria no dia: a ordem do aluno, depois o edital. */
export function rankDaOrdem(ordemMaterias = [], materias = []) {
  const ordem = new Map((ordemMaterias || []).map((id, i) => [id, i]));
  const edital = new Map(materias.map((m, i) => [m.materiaId, m.pos ?? i]));
  const fora = ordem.size;
  return (id) => (ordem.has(id) ? ordem.get(id) : fora + (edital.has(id) ? edital.get(id) : 999));
}

/* Passo 7. Revisões primeiro; depois as matérias pelo rank. Estável. */
export function ordenarDia(metas, rank) {
  return metas
    .map((m, i) => ({ m, i }))
    .sort((a, b) => (a.m.tipo === "revisao" ? 0 : 1) - (b.m.tipo === "revisao" ? 0 : 1) || rank(a.m.materiaId) - rank(b.m.materiaId) || a.i - b.i)
    .map((x) => x.m);
}

/* Passo 6. metasPorMateria: [[materiaId, [blocos…]]] na ordem das rodadas.
   livres: { dia: blocos }. Devolve o que ficou em cada dia e o que não coube. */
export function distribuirPelosDias(metasPorMateria, livres) {
  const livre = { ...livres };
  const dias = Object.fromEntries(DIAS.map((d) => [d.k, []]));
  const naoCouberam = {};
  const temNoDia = (k, id) => dias[k].some((x) => x.materiaId === id);
  const escolher = (id, b, semRepetir) => DIAS
    .filter((d) => livre[d.k] >= b && (!semRepetir || !temNoDia(d.k, id)))
    .reduce((melhor, d) => (!melhor || livre[d.k] > livre[melhor.k] ? d : melhor), null);
  const colocar = (id, b) => {
    const dia = escolher(id, b, true) || escolher(id, b, false);
    if (dia) {
      dias[dia.k].push({ materiaId: id, blocos: b });
      livre[dia.k] -= b;
      return;
    }
    if (b > 1) { colocar(id, Math.ceil(b / 2)); colocar(id, Math.floor(b / 2)); return; }
    naoCouberam[id] = (naoCouberam[id] || 0) + b;
  };
  const maior = metasPorMateria.reduce((s, [, l]) => Math.max(s, l.length), 0);
  for (let i = 0; i < maior; i++) metasPorMateria.forEach(([id, lista]) => { if (lista[i]) colocar(id, lista[i]); });
  return { dias, livre, naoCouberam };
}

/* A semana inteira. Entrada:
     materias       [{ materiaId, peso, maxSessao, pendente, pos }] (só as ativas)
     capacidade     { dia: min } onde pode haver metas novas (dias bloqueados = 0)
     capacidadeCota { dia: min } que conta para a cota da semana (padrão: capacidade)
     revisoes       [{ k, blocos, materiaId, … }] revisões a colocar agora (k = dia da semana)
     revisoesCota   { dia: blocos } de revisão da semana inteira (padrão: as de `revisoes`)
     comRevisao     Set de matérias com revisão na semana (padrão: as de `revisoes`)
     ocupado        { dia: blocos } já tomados por metas mantidas (reorganização)
     usado          { materiaId: blocos } da cota já feitos ou em dias passados
     pendencias     { materiaId: blocos } de semanas anteriores (replanejamento):
                    entram antes da cota; o que não couber volta no resumo
     ordemMaterias  [materiaId] (só ordem no dia)
     prefixo        início dos ids (ex.: "2026-09-28:")
   Saída: { dias: { dia: [meta] }, resumo } */
export function planejarSemana(entrada) {
  const {
    materias = [], capacidade = {}, revisoes = [], ocupado = {}, usado = {}, ordemMaterias = [], prefixo = "", pendencias = {},
  } = entrada;
  const capacidadeCota = entrada.capacidadeCota || capacidade;
  const revPorDia = {};
  revisoes.forEach((r) => { revPorDia[r.k] = (revPorDia[r.k] || 0) + r.blocos; });
  const revisoesCota = entrada.revisoesCota || revPorDia;
  const comRevisao = entrada.comRevisao || new Set(revisoes.map((r) => r.materiaId));

  // 1 e 3: blocos livres da semana e a cota de cada matéria
  const R = DIAS.reduce((s, d) => s + Math.max(0, paraBlocos(capacidadeCota[d.k]) - (revisoesCota[d.k] || 0)), 0);
  const { blocos: cota, semTempo } = cotaDaSemana(R, materias, comRevisao);
  const restante = Object.fromEntries(materias.map((m) => [m.materiaId, Math.max(0, (cota[m.materiaId] || 0) - (usado[m.materiaId] || 0))]));

  // 2: revisões no seu dia; o que passar da capacidade fica sinalizado
  const livres = {};
  const sobrecarga = [];
  DIAS.forEach((d) => {
    const cap = paraBlocos(capacidade[d.k]) - (ocupado[d.k] || 0) - (revPorDia[d.k] || 0);
    if (cap < 0 && revPorDia[d.k]) sobrecarga.push(d.k);
    livres[d.k] = Math.max(0, cap);
  });

  // 5 e 6: metas por matéria, em rodadas do maior peso para o menor
  // (pendências de semanas anteriores, se houver, vão antes da cota)
  const rodada = [...materias].sort((a, b) => pesoDe(b) - pesoDe(a) || (a.pos ?? 0) - (b.pos ?? 0));
  const maxDe = (id) => paraBlocos(materias.find((m) => m.materiaId === id)?.maxSessao) || 2;
  const idsPend = Object.keys(pendencias).filter((id) => pendencias[id] > 0)
    .sort((a, b) => rodada.findIndex((m) => m.materiaId === a) - rodada.findIndex((m) => m.materiaId === b));
  const pend = distribuirPelosDias(idsPend.map((id) => [id, dividirEmMetas(pendencias[id], maxDe(id))]), livres);
  const porMateria = rodada.map((m) => [m.materiaId, dividirEmMetas(restante[m.materiaId], maxDe(m.materiaId))]);
  const { dias: daCota, naoCouberam } = distribuirPelosDias(porMateria, pend.livre);
  const colocadas = Object.fromEntries(DIAS.map((d) => [d.k, [...pend.dias[d.k].map((x) => ({ ...x, replanejada: true })), ...daCota[d.k]]]));

  // 7: monta e ordena cada dia
  const rank = rankDaOrdem(ordemMaterias, materias);
  const dias = {};
  const blocosPorMateria = {};
  DIAS.forEach((d) => {
    const revs = revisoes.filter((r) => r.k === d.k).map((r) => ({ ...r, tipo: "revisao", minutos: deBlocos(r.blocos), done: false }));
    const ciclo = colocadas[d.k].map((x) => {
      blocosPorMateria[x.materiaId] = (blocosPorMateria[x.materiaId] || 0) + x.blocos;
      return { tipo: "ciclo", materiaId: x.materiaId, minutos: deBlocos(x.blocos), done: false, ...(x.replanejada ? { replanejada: true } : {}) };
    });
    dias[d.k] = ordenarDia([...revs, ...ciclo], rank).map((m, i) => ({ id: `${prefixo}${d.k}-${i}`, ...m }));
    dias[d.k].forEach((m) => { delete m.blocos; delete m.k; });
  });

  return {
    dias,
    resumo: { R, cota, restante, blocosPorMateria, materiasSemTempo: semTempo, sobrecarga, naoCouberam, pendenciasSemEspaco: pend.naoCouberam },
  };
}
