import { describe, expect, it } from "vitest";
import { estruturaInicial, indiceEstrutura } from "./estrutura.js";
import {
  consistencia, desempenhoPorMateria, desempenhoPorSubtopico, desempenhoPorTopico, desempenhoQuestoes,
  desempenhoSimulados, diasComAtividade, evolucaoQuestoes, filtrarRegistros,
} from "./desempenho.js";
import { datasDoPeriodo, somarDias, diasEntre, inicioDaSemana } from "./datas.js";
import { validarPdf, validarQuestoes, validarSimulado } from "./validacao.js";

const ind = indiceEstrutura(estruturaInicial());
const Q = [
  { id: "1", data: "2026-09-01", materiaId: "biologia", topicoId: "bi1", subtopicoId: "bi1-membrana", vestibularId: "fuvest", total: 20, acertos: 13, erros: 7 },
  { id: "2", data: "2026-09-08", materiaId: "biologia", topicoId: "bi1", subtopicoId: "bi1-organelas", vestibularId: "fuvest", total: 10, acertos: 8, erros: 1 },
  { id: "3", data: "2026-09-15", materiaId: "quimica", topicoId: "qu1", subtopicoId: null, vestibularId: "enem", total: 30, acertos: 21, erros: 9 },
  { id: "4", data: "2026-09-22", materiaId: "biologia", topicoId: "bi1", subtopicoId: "bi1-membrana", vestibularId: "fuvest", total: 40, acertos: 30, erros: 10 },
];

describe("questões", () => {
  it("percentual = acertos / questões; questões em branco à parte", () => {
    expect(desempenhoQuestoes(Q)).toEqual({ registros: 4, total: 100, acertos: 72, erros: 27, emBranco: 1, pct: 72, pctErros: 27 });
    expect(desempenhoQuestoes([])).toMatchObject({ total: 0, pct: 0 });
  });

  it("filtros combináveis: período + matéria + tópico + subtópico + vestibular", () => {
    expect(filtrarRegistros(Q, { materiaId: "biologia", inicio: "2026-09-05" }).map((r) => r.id)).toEqual(["2", "4"]);
    expect(filtrarRegistros(Q, { subtopicoId: "bi1-membrana", fim: "2026-09-10" }).map((r) => r.id)).toEqual(["1"]);
    expect(filtrarRegistros(Q, { vestibularId: "enem" }).map((r) => r.id)).toEqual(["3"]);
    expect(filtrarRegistros(Q, {})).toHaveLength(4);
  });

  it("por matéria, por tópico e por subtópico", () => {
    expect(desempenhoPorMateria(Q, ind).map((m) => [m.nome, m.pct])).toEqual([["Biologia", 72.9], ["Química", 70]]);
    expect(desempenhoPorTopico(Q, "biologia", ind)).toMatchObject([{ id: "bi1", total: 70, acertos: 51 }]);
    expect(desempenhoPorSubtopico(Q, "bi1", ind).map((s) => [s.nome, s.pct])).toEqual([["Membrana", 71.7], ["Organelas", 80]]);
  });

  it("evolução semanal só com semanas que têm registro", () => {
    expect(evolucaoQuestoes(Q).map((p) => [p.periodo, p.pct])).toEqual([
      [inicioDaSemana("2026-09-01"), 65], [inicioDaSemana("2026-09-08"), 80], [inicioDaSemana("2026-09-15"), 70], [inicioDaSemana("2026-09-22"), 75],
    ]);
  });
});

describe("simulados", () => {
  it("média e histórico por vestibular, em ordem de data", () => {
    const S = [
      { id: "a", data: "2026-09-05", vestibularId: "fuvest", nome: "F2", total: 90, acertos: 61, erros: 29 },
      { id: "b", data: "2026-08-20", vestibularId: "fuvest", nome: "F1", total: 90, acertos: 55, erros: 35 },
      { id: "c", data: "2026-09-10", vestibularId: "enem", nome: "E1", total: 45, acertos: 36, erros: 9 },
    ];
    const r = desempenhoSimulados(S, ind);
    expect(r.quantidade).toBe(3);
    const fuvest = r.porVestibular.find((v) => v.vestibularId === "fuvest");
    expect(fuvest.historico.map((h) => h.pct)).toEqual([61.1, 67.8]);
    expect(fuvest.ultimoPct).toBe(67.8);
  });
});

describe("dias estudados e dias em branco", () => {
  const ativos = diasComAtividade({
    sessoes: [{ data: "2026-09-25" }, { data: "2026-09-27" }],
    questoes: [{ data: "2026-09-26" }],
    simulados: [{ data: "2026-09-20" }],
  });

  it("qualquer atividade conta e o resto é dia em branco", () => {
    const c = consistencia(ativos, { inicio: "2026-09-21", fim: "2026-09-27" });
    expect(c.diasEstudados).toBe(3);
    expect(c.diasEmBranco).toBe(4);
    expect(c.sequenciaAtual).toBe(3);
  });

  it("hoje em branco não quebra a sequência; ontem em branco quebra", () => {
    expect(consistencia(ativos, { inicio: "2026-09-21", fim: "2026-09-28" }).sequenciaAtual).toBe(3);
    expect(consistencia(ativos, { inicio: "2026-09-21", fim: "2026-09-29" }).sequenciaAtual).toBe(0);
  });
});

describe("datas e períodos locais", () => {
  it("períodos prontos", () => {
    expect(datasDoPeriodo("7d", "2026-09-27")).toEqual({ inicio: "2026-09-21", fim: "2026-09-27" });
    expect(datasDoPeriodo("mes", "2026-09-27")).toEqual({ inicio: "2026-09-01", fim: "2026-09-27" });
    expect(somarDias("2026-02-28", 1)).toBe("2026-03-01");
    expect(diasEntre("2026-09-01", "2026-10-01")).toBe(30);
  });
});

describe("validações", () => {
  const base = { data: "2026-09-27", materiaId: "biologia", topicoId: "bi1", total: 30, acertos: 24, erros: 6 };
  it("aceita registro válido e recusa acertos + erros acima do total, negativos e data futura", () => {
    expect(validarQuestoes(base, "2026-09-27").ok).toBe(true);
    expect(validarQuestoes({ ...base, erros: 7 }).erros.erros).toMatch(/passa do total/);
    expect(validarQuestoes({ ...base, acertos: -1 }).erros.acertos).toBeTruthy();
    expect(validarQuestoes({ ...base, total: 0 }).erros.total).toBeTruthy();
    expect(validarQuestoes({ ...base, data: "2026-09-28" }, "2026-09-27").erros.data).toBeTruthy();
    expect(validarSimulado({ ...base, vestibularId: "", nome: "" }).erros).toMatchObject({ vestibularId: expect.any(String), nome: expect.any(String) });
  });

  it("PDF: tipo, tamanho e assinatura", async () => {
    const pdf = new File(["%PDF-1.7 conteúdo"], "apostila.pdf", { type: "application/pdf" });
    const falso = new File(["não sou pdf"], "falso.pdf", { type: "application/pdf" });
    const png = new File(["x"], "foto.png", { type: "image/png" });
    expect(await validarPdf(pdf)).toEqual({ ok: true });
    expect((await validarPdf(falso)).erro).toMatch(/não é de um PDF/);
    expect((await validarPdf(png)).erro).toMatch(/precisa ser um PDF/);
    expect((await validarPdf(pdf, 0.000001)).erro).toMatch(/limite/);
  });
});
