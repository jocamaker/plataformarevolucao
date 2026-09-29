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

// duração máxima de cada meta de uma matéria
export const DURACOES_META = [1, 2, 3, 4, 5, 6].map(deBlocos); // 30 … 180
export const MAX_SESSAO_PADRAO = deBlocos(2);

// valor válido mais próximo (no empate, o maior)
export function arredMaxSessao(min) {
  const v = Number(min) || MAX_SESSAO_PADRAO;
  return DURACOES_META.reduce((melhor, d) => (Math.abs(d - v) <= Math.abs(melhor - v) ? d : melhor), DURACOES_META[0]);
}

// "Preciso de mais tempo"
export const TEMPO_EXTRA = [1, 2, 3, 4].map(deBlocos); // 30, 60, 90, 120

// passos de um seletor de tempo por dia, dentro de [min, max]
export function passosDeTempo(min = 0, max = deBlocos(16)) {
  const out = [];
  for (let v = arredBloco(min); v <= max; v += BLOCO_MIN) out.push(v);
  return out;
}
