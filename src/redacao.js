/* Regras das devolutivas de redação (sem React). */

import { COMPETENCIAS_ENEM, notaDevolutiva } from "./core/nucleo.js";

// Cor de cada competência: paleta categórica validada (claro e escuro) em
// src/styles/base.css (--c1…--c5). Sobre a foto, que é sempre clara, valem
// os tons do tema claro.
export const COR_NA_FOLHA = { c1: "#2a78d6", c2: "#eb6834", c3: "#1baf7a", c4: "#eda100", c5: "#e87ba4" };

export const NOTAS_COMPETENCIA = [0, 40, 80, 120, 160, 200];

export const TIPOS_MARCACAO = [
  { id: "problema", nome: "Problema" },
  { id: "elogio", nome: "Elogio" },
];

// "C1 · Norma-padrão da língua escrita" → { sigla: "C1", nome: "Norma-padrão da língua escrita" }
export const competencia = (id) => {
  const c = COMPETENCIAS_ENEM.find((x) => x.id === id);
  const [sigla, nome] = (c?.nome || "").split(" · ");
  return { id, sigla: sigla || id.toUpperCase(), nome: nome || "" };
};

export const normalizarTema = (t = "") => t.trim().toLowerCase().replace(/\s+/g, " ");

// Devolutivas que o aluno vê: só as enviadas, da mais recente para a mais antiga.
export function devolutivasDoAluno(devolutivas, uid) {
  return devolutivas
    .filter((d) => d.alunoId === uid && d.status === "enviada")
    .sort((a, b) => (b.enviadaEm || "").localeCompare(a.enviadaEm || ""));
}

// Média das devolutivas enviadas sobre o mesmo tema (só faz sentido com 2+).
export function mediaDoTema(devolutivas, d) {
  if (d.rubrica !== "enem") return null;
  const mesmas = devolutivas.filter((x) => x.status === "enviada" && x.rubrica === "enem" && normalizarTema(x.tema) === normalizarTema(d.tema));
  if (mesmas.length < 2) return null;
  const media = (fn) => Math.round(mesmas.reduce((s, x) => s + fn(x), 0) / mesmas.length);
  return {
    quantas: mesmas.length,
    total: media((x) => notaDevolutiva(x).total),
    porCompetencia: Object.fromEntries(COMPETENCIAS_ENEM.map((c) => [c.id, media((x) => Number(x.notas?.[c.id]) || 0)])),
  };
}

// Pontos da evolução, em ordem cronológica, em % da nota máxima (compara ENEM com nota livre).
export function evolucao(devolutivasEnviadas) {
  return [...devolutivasEnviadas]
    .sort((a, b) => (a.enviadaEm || a.recebidaEm || "").localeCompare(b.enviadaEm || b.recebidaEm || ""))
    .map((d) => ({ id: d.id, data: d.enviadaEm || d.recebidaEm, tema: d.tema, pct: Math.round(notaDevolutiva(d).pct), texto: notaDevolutiva(d).texto }));
}

export const statusDevolutiva = (d) => (d.status === "rascunho" ? "Rascunho" : d.lida ? "Lida pelo aluno" : "Enviada · não lida");
