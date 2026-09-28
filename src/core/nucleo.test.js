import { describe, expect, it } from "vitest";
import {
  CICLO_TEMPLATES, DIAS, DISP_PADRAO, MATERIAS_FLAT, dividirSessoes,
  expandirAlocacoes, gerarSemana, recalcularPlanoInteligente, semanaKey, hojeISO,
} from "./nucleo.js";

const metasDa = (semana) => DIAS.flatMap((d) => semana[d.k]);

describe("expandirAlocacoes (correção 1)", () => {
  it("divide a área Matemática entre as matérias e preserva o total", () => {
    const [mat] = CICLO_TEMPLATES.fuvest.alocacoes;
    const partes = expandirAlocacoes([mat]);
    expect(partes.map((p) => p.materiaId)).toEqual(["algebra", "geometria", "trigonometria", "estatistica"]);
    expect(partes.reduce((s, p) => s + p.minutosSemanais, 0)).toBe(mat.minutosSemanais);
    partes.forEach((p) => expect(p.minutosSemanais % 15).toBe(0));
  });

  it("não mexe em alocações que já são matérias", () => {
    const fisica = CICLO_TEMPLATES.fuvest.alocacoes.find((a) => a.materiaId === "fisica");
    expect(expandirAlocacoes([fisica])).toEqual([fisica]);
  });

  it("todas as metas geradas pelos templates têm tópico real", () => {
    Object.values(CICLO_TEMPLATES).forEach((tpl) => {
      metasDa(gerarSemana(tpl, DISP_PADRAO)).forEach((m) => {
        expect(MATERIAS_FLAT.some((x) => x.id === m.materiaId)).toBe(true);
        expect(m.topicoId).toBeTruthy();
      });
    });
  });
});

describe("tópico segue o progresso (correção 2)", () => {
  it("pula o tópico concluído", () => {
    const ciclo = { alocacoes: [{ materiaId: "historia", materiaNome: "História", minutosSemanais: 120, maxSessao: 60 }] };
    const semSemProgresso = metasDa(gerarSemana(ciclo, DISP_PADRAO));
    const semComProgresso = metasDa(gerarSemana(ciclo, DISP_PADRAO, [], { progresso: { h1: 100 } }));
    expect(semSemProgresso.every((m) => m.topicoId === "h1")).toBe(true);
    expect(semComProgresso.every((m) => m.topicoId === "h2")).toBe(true);
  });
});

describe("recálculo não usa dias passados (correção 3) e mantém pendências (correção 5)", () => {
  const ciclo = CICLO_TEMPLATES.fuvest;
  const semana = gerarSemana(ciclo, DISP_PADRAO);

  it("com hoje = quinta, seg/ter/qua só guardam metas concluídas", () => {
    const { semana: nova } = recalcularPlanoInteligente(ciclo, DISP_PADRAO, semana, [], [], { hoje: "qui" });
    ["seg", "ter", "qua"].forEach((k) => expect(nova[k].every((m) => m.done)).toBe(true));
    expect(nova.qui.length + nova.sex.length + nova.sab.length + nova.dom.length).toBeGreaterThan(0);
  });

  it("pendência de matéria fora do ciclo não é descartada", () => {
    const extra = { id: "x", materiaId: "filosofia", materia: "Filosofia", topicoId: "f1", topico: "Filosofia Antiga", minutos: 30, done: false };
    const { semana: nova } = recalcularPlanoInteligente(ciclo, DISP_PADRAO, semana, [extra], [], { hoje: "seg" });
    expect(metasDa(nova).some((m) => m.materiaId === "filosofia")).toBe(true);
  });
});

describe("datas locais (correção 4)", () => {
  it("semanaKey devolve a segunda-feira local", () => {
    expect(semanaKey(new Date(2026, 8, 27, 23, 30))).toBe("2026-09-21"); // domingo à noite
    expect(semanaKey(new Date(2026, 8, 21, 0, 5))).toBe("2026-09-21");
  });

  it("hojeISO bate com a data local", () => {
    const d = new Date();
    const esperado = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    expect(hojeISO()).toBe(esperado);
  });
});

describe("prioridade das pendências no recálculo (correções 6, 7 e 8)", () => {
  const ciclo = CICLO_TEMPLATES.fuvest;
  // semana toda cumprida até sábado; domingo com 2h livres
  const semana = gerarSemana(ciclo, DISP_PADRAO);
  DIAS.forEach((d) => { if (d.k !== "dom") semana[d.k].forEach((m) => { m.done = true; }); });
  semana.dom = [];
  const quimica = { id: "a", materiaId: "quimica", materia: "Química", minutos: 60, done: false };

  it("a pendência entra antes de qualquer outra matéria", () => {
    const { semana: nova } = recalcularPlanoInteligente(ciclo, DISP_PADRAO, semana, [quimica], [], { hoje: "dom" });
    expect(nova.dom[0].materiaId).toBe("quimica");
    expect(nova.dom[0].minutos).toBe(60);
  });

  it("matéria com a cota da semana cumprida não ganha sessão extra", () => {
    const cumprida = DIAS.flatMap((d) => semana[d.k]).filter((m) => m.done).map((m) => m.materiaId);
    const { semana: nova } = recalcularPlanoInteligente(ciclo, DISP_PADRAO, semana, [], [], { hoje: "dom" });
    const soma = (id) => DIAS.flatMap((d) => semana[d.k]).filter((m) => m.materiaId === id).reduce((s, m) => s + m.minutos, 0);
    const aloc = expandirAlocacoes(ciclo.alocacoes);
    nova.dom.forEach((m) => {
      const cota = aloc.find((a) => a.materiaId === m.materiaId).minutosSemanais;
      expect(soma(m.materiaId) + m.minutos).toBeLessThanOrEqual(cota);
    });
    expect(cumprida.length).toBeGreaterThan(0);
  });

  it("o que não cabe volta em naoCouberam", () => {
    const grande = { ...quimica, minutos: 300 };
    const { resumo } = recalcularPlanoInteligente(ciclo, DISP_PADRAO, semana, [grande], [], { hoje: "dom" });
    expect(resumo.minutosSemEspaco).toBe(300 - DISP_PADRAO.dom);
    expect(resumo.naoCouberam[0].materiaId).toBe("quimica");
  });
});

describe("dividirSessoes (correção 11)", () => {
  it("sessões equilibradas, no menor número possível, sem passar do máximo", () => {
    expect(dividirSessoes(105, 90)).toEqual([55, 50]);
    expect(dividirSessoes(180, 90)).toEqual([90, 90]);
    expect(dividirSessoes(185, 90)).toEqual([65, 60, 60]);
    expect(dividirSessoes(60, 90)).toEqual([60]);
    expect(dividirSessoes(97, 45)).toEqual([33, 32, 32]);
    [[105, 90], [185, 90], [97, 45], [240, 80]].forEach(([t, m]) => {
      const s = dividirSessoes(t, m);
      expect(s.reduce((a, b) => a + b, 0)).toBe(t);
      expect(Math.max(...s)).toBeLessThanOrEqual(m);
    });
  });
});
