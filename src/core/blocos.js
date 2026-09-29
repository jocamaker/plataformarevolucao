/* Unidade de tempo das metas: o bloco de 30 minutos.

   Toda meta (de ciclo, de revisão, tempo extra, replanejada ou pendente) tem
   um número inteiro de blocos, e o tempo de estudo de cada dia também. A
   carga dos tópicos e o progresso por item continuam em minutos: medem o
   conteúdo, não a meta. Nenhum outro passo de tempo (5, 15) entra no fluxo
   de metas; tudo passa por aqui. */

export const BLOCO_MIN = 30;

export const paraBlocos = (min) => Math.floor((Number(min) || 0) / BLOCO_MIN);
export const deBlocos = (n) => (Number(n) || 0) * BLOCO_MIN;

// múltiplo de 30 mais próximo; no empate (15, 45…), para cima
export const arredBloco = (min) => Math.floor((Math.max(0, Number(min) || 0) + BLOCO_MIN / 2) / BLOCO_MIN) * BLOCO_MIN;

export const ehMultiploDoBloco = (min) => Number.isInteger(min) && min >= 0 && min % BLOCO_MIN === 0;

/* Meta de estudo: de 60 a 180 min (2 a 6 blocos). Meta de 30 min só existe
   como revisão (matéria de peso 1). */
export const MIN_BLOCOS_META = 2;
export const MAX_BLOCOS_META = 6;
export const DURACOES_META = [2, 3, 4, 5, 6].map(deBlocos); // 60 … 180
export const MAX_SESSAO_PADRAO = deBlocos(2);

// duração válida de uma meta de estudo (60 a 180, em blocos de 30)
export const arredMeta = (min) => Math.min(deBlocos(MAX_BLOCOS_META), Math.max(deBlocos(MIN_BLOCOS_META), arredBloco(min)));

// valor válido mais próximo (no empate, o maior)
export function arredMaxSessao(min) {
  const v = Number(min) || MAX_SESSAO_PADRAO;
  return DURACOES_META.reduce((melhor, d) => (Math.abs(d - v) <= Math.abs(melhor - v) ? d : melhor), DURACOES_META[0]);
}

// "Preciso de mais tempo" (é meta de estudo: a partir de 60 min)
export const TEMPO_EXTRA = [2, 3, 4].map(deBlocos); // 60, 90, 120

// passos de um seletor de tempo por dia, dentro de [min, max]
export function passosDeTempo(min = 0, max = deBlocos(16)) {
  const out = [];
  for (let v = arredBloco(min); v <= max; v += BLOCO_MIN) out.push(v);
  return out;
}
