import { describe, expect, it } from "vitest";
import { DIAS } from "./nucleo.js";
import { BLOCO_MIN, arredBloco, deBlocos, paraBlocos } from "./blocos.js";
import { cotaDaSemana, dividirEmMetas, planejarSemana, repartirPorPeso } from "./motor.js";
import { duracaoRevisao } from "./plano.js";
import { gerarSemanaNova, reorganizarSemana } from "./semana.js";

const todas = (dias) => DIAS.flatMap((d) => dias[d.k]);
const soma = (l) => l.reduce((s, m) => s + m.minutos, 0);
const porMateria = (dias) => {
  const out = {};
  todas(dias).filter((m) => m.tipo === "ciclo").forEach((m) => { out[m.materiaId] = (out[m.materiaId] || 0) + m.minutos; });
  return out;
};
const dispUniforme = (min, dias = DIAS.map((d) => d.k)) => Object.fromEntries(DIAS.map((d) => [d.k, dias.includes(d.k) ? min : 0]));
const mat = (materiaId, peso, extra = {}) => ({ materiaId, peso, maxSessao: 60, pendente: true, ...extra });
const comPos = (lista) => lista.map((m, pos) => ({ pos, ...m }));

// gerador pseudoaleatório com semente fixa (mulberry32)
function aleatorio(semente) {
  let a = semente;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("blocos de 30 min", () => {
  it("arredonda para o múltiplo de 30 mais próximo, no empate para cima", () => {
    expect([0, 14, 15, 29, 44, 45, 75, 100].map(arredBloco)).toEqual([0, 0, 30, 30, 30, 60, 90, 90]);
    expect(paraBlocos(95)).toBe(3);
    expect(deBlocos(4)).toBe(120);
  });

  it("todas as metas são múltiplas de 30 em ~200 combinações de tempo e pesos", () => {
    const r = aleatorio(20260929);
    for (let caso = 0; caso < 200; caso++) {
      const n = 1 + Math.floor(r() * 9);
      const materias = comPos(Array.from({ length: n }, (_, i) => mat(`m${i}`, 1 + Math.floor(r() * 3), {
        maxSessao: deBlocos(1 + Math.floor(r() * 6)), pendente: r() > 0.1,
      })));
      const capacidade = Object.fromEntries(DIAS.map((d) => [d.k, deBlocos(Math.floor(r() * 10))]));
      const revisoes = r() > 0.5 ? [{ k: DIAS[Math.floor(r() * 7)].k, blocos: 1 + Math.floor(r() * 2), materiaId: "m0", revisaoId: "r" }] : [];
      const { dias, resumo } = planejarSemana({ materias, capacidade, revisoes, prefixo: `c${caso}:` });
      todas(dias).forEach((m) => {
        expect(m.minutos % BLOCO_MIN).toBe(0);
        // meta de estudo: 60 a 180 min; 30 min só em revisão
        if (m.tipo === "ciclo") { expect(m.minutos).toBeGreaterThanOrEqual(60); expect(m.minutos).toBeLessThanOrEqual(180); }
        else expect(m.minutos).toBeGreaterThanOrEqual(30);
      });
      // nenhum dia passa da capacidade (fora a sobrecarga de revisão, sinalizada)
      DIAS.forEach((d) => {
        const ciclo = soma(dias[d.k].filter((m) => m.tipo === "ciclo"));
        const rev = soma(dias[d.k].filter((m) => m.tipo === "revisao"));
        expect(ciclo).toBeLessThanOrEqual(Math.max(0, capacidade[d.k] - rev));
        if (rev > capacidade[d.k]) expect(resumo.sobrecarga).toContain(d.k);
      });
      // a soma das metas de ciclo é R, menos no máximo 1 bloco solto por dia
      // (um bloco sozinho não vira meta de estudo)
      if (materias.some((m) => m.pendente)) {
        const ciclo = soma(todas(dias).filter((m) => m.tipo === "ciclo"));
        expect(ciclo).toBeLessThanOrEqual(deBlocos(resumo.R));
        expect(ciclo).toBeGreaterThanOrEqual(deBlocos(resumo.R - 7));
      }
    }
  });
});

describe("repartição por peso", () => {
  it("pesos 3 : 1 com 8 h por semana dão 6 h e 2 h", () => {
    const { dias } = planejarSemana({ materias: comPos([mat("a", 3), mat("b", 1)]), capacidade: dispUniforme(120, ["seg", "ter", "qua", "qui"]) });
    expect(porMateria(dias)).toEqual({ a: 360, b: 120 });
  });

  it("pesos 3 : 2 : 1 com 12 h por semana dão 6 h, 4 h e 2 h", () => {
    const { dias } = planejarSemana({ materias: comPos([mat("a", 3), mat("b", 2), mat("c", 1)]), capacidade: dispUniforme(120, ["seg", "ter", "qua", "qui", "sex", "sab"]) });
    expect(porMateria(dias)).toEqual({ a: 360, b: 240, c: 120 });
  });

  it("maiores restos: 7 blocos com pesos 1 : 1 : 1 dão 3, 2 e 2 (desempate pelo edital)", () => {
    expect(repartirPorPeso(7, comPos([mat("a", 1), mat("b", 1), mat("c", 1)]))).toEqual({ a: 3, b: 2, c: 2 });
    // restos e pesos iguais: o bloco que sobra vai para o primeiro do edital
    expect(repartirPorPeso(1, comPos([mat("a", 1), mat("b", 1)]))).toEqual({ a: 1, b: 0 });
  });

  it("mínimo: a matéria de peso 1 recebe uma meta de 60 min, tirada da maior; com revisão na semana, não", () => {
    const materias = comPos([mat("a", 3), mat("b", 3), mat("d", 1)]);
    expect(repartirPorPeso(6, materias)).toEqual({ a: 3, b: 2, d: 1 });
    const { blocos } = cotaDaSemana(6, materias);
    expect(blocos).toEqual({ a: 2, b: 2, d: 2 }); // o bloco solto de d vira meta com um bloco de a
    expect(cotaDaSemana(6, materias, new Set(["d"])).blocos).toEqual({ a: 4, b: 2, d: 0 }); // a revisão conta
    // na semana: aparece 60 min de estudo ou 30 min de revisão
    const cap = dispUniforme(0); cap.seg = 180;
    const semana = planejarSemana({ materias, capacidade: cap });
    expect(porMateria(semana.dias).d).toBe(60);
    // com revisão de "d" (1 bloco), os 6 blocos livres vão para a e b
    const comRev = planejarSemana({ materias, capacidade: { ...cap, seg: 210 }, revisoes: [{ k: "seg", blocos: 1, materiaId: "d", revisaoId: "r1" }] });
    expect(porMateria(comRev.dias).d).toBeUndefined();
    expect(comRev.dias.seg.find((m) => m.materiaId === "d")).toMatchObject({ tipo: "revisao", minutos: 30 });
  });

  it("sem espaço nem para a meta mínima, a matéria volta em materiasSemTempo", () => {
    const cap = dispUniforme(0); cap.seg = 60; // uma meta de 60 min: fica com a de maior peso
    const { dias, resumo } = planejarSemana({ materias: comPos([mat("a", 3), mat("b", 2), mat("c", 1)]), capacidade: cap });
    expect(porMateria(dias)).toEqual({ a: 60 });
    expect(resumo.materiasSemTempo).toEqual(["b", "c"]);
  });

  it("matéria com todos os tópicos concluídos e sem revisão não recebe bloco", () => {
    const { dias } = planejarSemana({ materias: comPos([mat("a", 2), mat("b", 3, { pendente: false })]), capacidade: dispUniforme(120) });
    expect(porMateria(dias).b).toBeUndefined();
    expect(porMateria(dias).a).toBe(7 * 120);
  });

  it("matéria inativa não gera meta (o motor só recebe as ativas)", () => {
    const { dias } = planejarSemana({ materias: comPos([mat("a", 2)]), capacidade: dispUniforme(60) });
    expect(todas(dias).every((m) => m.materiaId === "a")).toBe(true);
  });

  it("mudar o tempo diário mantém as proporções entre as matérias (tolerância de 2 blocos, a meta mínima)", () => {
    const materias = comPos([mat("a", 3), mat("b", 2), mat("c", 1)]);
    [dispUniforme(60), dispUniforme(90), dispUniforme(150), dispUniforme(240)].forEach((cap) => {
      const m = porMateria(planejarSemana({ materias, capacidade: cap }).dias);
      const total = m.a + m.b + m.c;
      expect(Math.abs(m.a - (total * 3) / 6)).toBeLessThanOrEqual(2 * BLOCO_MIN);
      expect(Math.abs(m.b - (total * 2) / 6)).toBeLessThanOrEqual(2 * BLOCO_MIN);
      expect(Math.abs(m.c - total / 6)).toBeLessThanOrEqual(2 * BLOCO_MIN);
    });
  });
});

describe("metas e dias", () => {
  it("divide os blocos em metas de 2 até maxSessao blocos, iguais: 7 com máximo 3 → 3 + 2 + 2", () => {
    expect(dividirEmMetas(7, 3)).toEqual([3, 2, 2]);
    expect(dividirEmMetas(6, 4)).toEqual([3, 3]);
    expect(dividirEmMetas(5, 2)).toEqual([2, 2]); // o bloco que sobra vai para o preenchimento do dia
    expect(dividirEmMetas(1, 4)).toEqual([]); // 30 min sozinho não é meta de estudo
    expect(dividirEmMetas(0, 2)).toEqual([]);
  });

  it("peso 3 aparece em mais dias que peso 1 e evita a mesma matéria duas vezes no dia", () => {
    const { dias } = planejarSemana({ materias: comPos([mat("a", 3), mat("b", 1)]), capacidade: dispUniforme(120) });
    const diasCom = (id) => DIAS.filter((d) => dias[d.k].some((m) => m.materiaId === id)).length;
    expect(diasCom("a")).toBeGreaterThan(diasCom("b"));
    // 21 blocos de "a" em metas de até 2 (11 metas) e 7 de "b" (4 metas):
    // "a" ocupa todos os dias antes de repetir; "b" nunca repete no mesmo dia
    expect(diasCom("a")).toBe(7);
    expect(diasCom("b")).toBe(4);
  });

  it("revisão entra no dia mesmo sem espaço e o dia fica sinalizado", () => {
    const cap = dispUniforme(0); cap.qua = 30;
    const { dias, resumo } = planejarSemana({
      materias: comPos([mat("a", 2)]), capacidade: cap,
      revisoes: [{ k: "qua", blocos: 2, materiaId: "a", revisaoId: "r1" }],
    });
    expect(dias.qua).toHaveLength(1);
    expect(dias.qua[0]).toMatchObject({ tipo: "revisao", minutos: 60 });
    expect(resumo.sobrecarga).toEqual(["qua"]);
  });

  it("a duração da revisão vem do peso: 30 min (peso 1), 60 min (pesos 2 e 3)", () => {
    expect([1, 2, 3].map(duracaoRevisao)).toEqual([30, 60, 60]);
    const revisoes = [{ id: "r1", materiaId: "a", topicoId: "t", sessoes: [{ dia: "2026-09-30", status: "agendada" }] }];
    const ctx = (peso) => ({ materias: comPos([mat("a", peso)]), disp: dispUniforme(120), revisoes, duracaoRevisao: () => duracaoRevisao(peso) });
    expect(gerarSemanaNova(ctx(1), "2026-09-28").metas.qua[0]).toMatchObject({ tipo: "revisao", minutos: 30 });
    expect(gerarSemanaNova(ctx(3), "2026-09-28").metas.qua[0]).toMatchObject({ tipo: "revisao", minutos: 60 });
  });

  it("ordemMaterias muda só a ordem dentro do dia, nunca os minutos; revisões vêm primeiro", () => {
    const materias = comPos([mat("a", 3), mat("b", 2), mat("c", 1)]);
    const revisoes = [{ k: "seg", blocos: 1, materiaId: "c", revisaoId: "r1" }];
    const sem = planejarSemana({ materias, capacidade: dispUniforme(180), revisoes });
    const com = planejarSemana({ materias, capacidade: dispUniforme(180), revisoes, ordemMaterias: ["c", "b"] });
    expect(porMateria(com.dias)).toEqual(porMateria(sem.dias));
    expect(com.dias.seg[0].tipo).toBe("revisao");
    DIAS.forEach((d) => {
      const ciclo = com.dias[d.k].filter((m) => m.tipo === "ciclo").map((m) => m.materiaId);
      const esperado = [...ciclo].sort((x, y) => ["c", "b", "a"].indexOf(x) - ["c", "b", "a"].indexOf(y));
      expect(ciclo).toEqual(esperado);
    });
  });

  it("determinismo: duas execuções iguais produzem saídas idênticas", () => {
    const entrada = () => ({ materias: comPos([mat("a", 3), mat("b", 2), mat("c", 1), mat("d", 2)]), capacidade: dispUniforme(150), prefixo: "2026-09-28:" });
    expect(planejarSemana(entrada())).toEqual(planejarSemana(entrada()));
  });

  it("dias antes do início do plano e dias passados numa reorganização ficam vazios", () => {
    const ctx = { materias: comPos([mat("a", 3), mat("b", 1)]), disp: dispUniforme(120), revisoes: [], inicio: "2026-10-01" };
    const nova = gerarSemanaNova(ctx, "2026-09-28");
    expect(["seg", "ter", "qua"].every((k) => nova.metas[k].length === 0)).toBe(true);
    const cheia = gerarSemanaNova({ ...ctx, inicio: null }, "2026-09-28");
    const reorg = reorganizarSemana({ ...cheia, metas: { ...cheia.metas, seg: [] } }, ctx, "2026-10-02"); // sexta
    expect(["seg", "ter", "qua", "qui"].map((k) => reorg.metas[k].length)).toEqual([0, cheia.metas.ter.length, cheia.metas.qua.length, cheia.metas.qui.length]);
    reorg.metas.sex.concat(reorg.metas.sab, reorg.metas.dom).forEach((m) => expect(m.minutos % 30).toBe(0));
  });
});
