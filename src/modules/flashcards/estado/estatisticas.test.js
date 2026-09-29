/* Estatísticas: os números saem só dos dados (resumo dos dias e cartões). */

import { describe, expect, it } from "vitest";
import { ESTADOS } from "../dados/modelo.js";
import { distribuicao, previsao, resumirDias, sequencia, serieRevisoes, somarPeriodo } from "./estatisticas.js";

const dia = (chave, respostas) => ({
  id: chave, dia: chave,
  revisoes: Object.fromEntries(respostas.map(([avaliacao, estadoAntes, materiaId = "m1", duracaoMs = 5000], i) => [`${chave}-${i}`, { avaliacao, estadoAntes, materiaId, duracaoMs }])),
});

describe("resumo dos dias", () => {
  const dias = [
    dia("2026-09-26", [[3, ESTADOS.novo], [1, ESTADOS.aprendendo], [3, ESTADOS.revisao], [1, ESTADOS.revisao, "m2"]]),
    dia("2026-09-27", [[4, ESTADOS.revisao], [2, ESTADOS.reaprendendo]]),
    dia("2026-09-28", []),
  ];

  it("separa novos, aprendendo e revisão; conta tempo, erros e a retenção real", () => {
    const r = resumirDias(dias);
    expect(r.get("2026-09-26")).toEqual({ novos: 1, aprendendo: 1, revisao: 2, total: 4, ms: 20000, erros: 2, revisoesFeitas: 2, revisoesCertas: 1 });
    expect(r.get("2026-09-27")).toMatchObject({ aprendendo: 1, revisao: 1, revisoesCertas: 1 });
    expect(r.has("2026-09-28")).toBe(false); // dia sem respostas não conta como estudado
  });

  it("filtra por matéria", () => {
    const r = resumirDias(dias, { materiaId: "m2" });
    expect([...r.keys()]).toEqual(["2026-09-26"]);
    expect(r.get("2026-09-26")).toMatchObject({ total: 1, erros: 1, revisoesFeitas: 1, revisoesCertas: 0 });
  });

  it("soma um período e monta a série diária e semanal", () => {
    const r = resumirDias(dias);
    expect(somarPeriodo(r, "2026-09-26", "2026-09-28")).toMatchObject({ total: 6, diasEstudados: 2 });
    const diaria = serieRevisoes(r, "2026-09-28", 7);
    expect(diaria).toHaveLength(7);
    expect(diaria.at(-1).chave).toBe("2026-09-28");
    expect(diaria.at(-2)).toMatchObject({ chave: "2026-09-27", total: 2 });
    const semanal = serieRevisoes(r, "2026-09-28", 14, { porSemana: true });
    // 28/09/2026 é segunda-feira: a última semana começa nela
    expect(semanal.at(-1)).toMatchObject({ inicio: "2026-09-28", fim: "2026-09-28", total: 0 });
    expect(semanal.at(-2)).toMatchObject({ inicio: "2026-09-21", fim: "2026-09-27", total: 6 });
  });
});

describe("sequência de dias", () => {
  const com = (...chaves) => resumirDias(chaves.map((c) => dia(c, [[3, ESTADOS.revisao]])));

  it("conta até hoje; se hoje ainda não estudou, a sequência de ontem continua valendo", () => {
    expect(sequencia(com("2026-09-26", "2026-09-27", "2026-09-28"), "2026-09-28")).toMatchObject({ atual: 3, maior: 3, estudouHoje: true });
    expect(sequencia(com("2026-09-26", "2026-09-27"), "2026-09-28")).toMatchObject({ atual: 2, estudouHoje: false });
    expect(sequencia(com("2026-09-25", "2026-09-26"), "2026-09-28")).toMatchObject({ atual: 0, maior: 2 });
  });

  it("maior sequência atravessa o mês; avisa quando chega ao início dos dados carregados", () => {
    const r = com("2026-08-30", "2026-08-31", "2026-09-01", "2026-09-02", "2026-09-27", "2026-09-28");
    expect(sequencia(r, "2026-09-28")).toMatchObject({ atual: 2, maior: 4, limitada: false });
    expect(sequencia(com("2026-09-27", "2026-09-28"), "2026-09-28", "2026-09-27")).toMatchObject({ atual: 2, limitada: true });
  });
});

const cartao = (id, materiaId, estado, { fsrs = {}, ...resto } = {}) => ({
  id, materiaId, suspenso: false, fila: null, ...resto,
  fsrs: { state: estado, scheduled_days: 0, stability: 0, last_review: null, ...fsrs },
});

describe("cartões: distribuição e previsão", () => {
  const agora = new Date(2026, 8, 28, 10);
  const materias = [{ id: "m1", nome: "Biologia" }, { id: "m2", nome: "História" }, { id: "m3", nome: "Vazia" }];
  const cartoes = [
    cartao("a", "m1", ESTADOS.novo),
    cartao("b", "m1", ESTADOS.aprendendo, { fila: new Date(2026, 8, 28, 10, 5) }),
    cartao("c", "m1", ESTADOS.revisao, { fila: new Date(2026, 8, 20, 9), fsrs: { scheduled_days: 30, stability: 30, last_review: new Date(2026, 7, 21) } }),
    cartao("d", "m2", ESTADOS.revisao, { fila: new Date(2026, 8, 30, 9), fsrs: { scheduled_days: 3, stability: 3, last_review: new Date(2026, 8, 27) } }),
    cartao("e", "m2", ESTADOS.reaprendendo, { suspenso: true, fila: null }),
  ];

  it("estados por matéria (suspenso vence o estado FSRS; maduro = intervalo ≥ 21 dias)", () => {
    const { linhas, total } = distribuicao(cartoes, materias);
    expect(linhas.map((l) => l.nome)).toEqual(["Biologia", "História"]); // matéria sem cartões fica de fora
    expect(linhas[0]).toMatchObject({ novo: 1, aprendendo: 1, revisao: 1, suspenso: 0, total: 3, maduros: 1 });
    expect(linhas[1]).toMatchObject({ revisao: 1, suspenso: 1, total: 2, maduros: 0 });
    expect(total).toMatchObject({ novo: 1, aprendendo: 1, revisao: 2, suspenso: 1, total: 5 });
  });

  it("previsão: atrasados entram em hoje; novos e suspensos ficam de fora", () => {
    const { pontos, atrasados } = previsao(cartoes, agora, { dias: 7 });
    expect(atrasados).toBe(1);
    expect(pontos[0]).toEqual({ chave: "2026-09-28", total: 2 }); // atrasado + aprendendo de hoje
    expect(pontos[2]).toEqual({ chave: "2026-09-30", total: 1 });
    expect(pontos.reduce((s, p) => s + p.total, 0)).toBe(3);
  });
});
