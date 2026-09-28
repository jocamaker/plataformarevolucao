import { describe, expect, it } from "vitest";
import { DIAS } from "./nucleo.js";
import {
  aplicarReplanejamento, listasDoDia, previaReplanejamento, reorganizarSemana, semanaVigente, sincronizarRevisoes,
} from "./semana.js";

const ctx = {
  ciclo: { alocacoes: [
    { materiaId: "biologia", materiaNome: "Biologia", minutosSemanais: 240, maxSessao: 60 },
    { materiaId: "quimica", materiaNome: "Química", minutosSemanais: 180, maxSessao: 60 },
  ] },
  disp: { seg: 120, ter: 120, qua: 120, qui: 120, sex: 120, sab: 180, dom: 60 },
  revisoes: [],
  conteudoDaVez: (m) => ({ topicoId: `${m}-t`, topico: "T", subtopicoId: null, itemId: `t:${m}-t` }),
};
const todas = (est) => DIAS.flatMap((d) => est.metas[d.k]);
const min = (l) => l.reduce((s, m) => s + m.minutos, 0);

describe("semana", () => {
  it("gera a semana com ids únicos por semana e cumpre a cota de cada matéria", () => {
    const { est } = semanaVigente(null, ctx, "2026-09-28");
    expect(est.chave).toBe("2026-09-28");
    expect(new Set(todas(est).map((m) => m.id)).size).toBe(todas(est).length);
    expect(todas(est).every((m) => m.id.startsWith("2026-09-28:"))).toBe(true);
    expect(min(todas(est).filter((m) => m.materiaId === "biologia"))).toBe(240);
  });

  it("quem começa no meio da semana não recebe metas nos dias que já passaram", () => {
    const { est } = semanaVigente(null, { ...ctx, inicio: "2026-10-01" }, "2026-10-01"); // quinta
    expect(["seg", "ter", "qua"].every((k) => est.metas[k].length === 0)).toBe(true);
    expect(todas(est).length).toBeGreaterThan(0);
  });

  it("reorganizar mantém dias passados e metas feitas e desconta o que já foi feito", () => {
    const { est } = semanaVigente(null, ctx, "2026-09-28");
    const feita = est.metas.seg[0];
    feita.done = true; feita.feitoEm = "2026-09-28";
    const passada = est.metas.seg.filter((m) => !m.done);
    const nova = reorganizarSemana(est, ctx, "2026-09-29"); // terça
    expect(nova.metas.seg).toEqual([feita, ...passada]);
    const biologia = min(todas(nova).filter((m) => m.materiaId === "biologia"));
    expect(biologia).toBe(240); // o total da semana continua o da cota
  });

  it("replanejar leva as pendências para os dias que faltam e não perde o que não coube", () => {
    const { est } = semanaVigente(null, ctx, "2026-09-28");
    est.pendentes = [{ id: "p1", tipo: "ciclo", materiaId: "quimica", minutos: 600, done: false }];
    const previa = previaReplanejamento(est, ctx, "2026-10-01");
    const r = aplicarReplanejamento(est, previa, "2026-10-01");
    const semEspaco = min(r.pendentes);
    const agendado = min(["qui", "sex", "sab", "dom"].flatMap((k) => r.metas[k]));
    expect(semEspaco).toBeGreaterThan(0);
    expect(r.pendentes.every((m) => m.origem === "sem espaço na semana")).toBe(true);
    expect(agendado).toBeLessThanOrEqual(120 + 120 + 180 + 60);
    expect(r.metas.seg.length + r.metas.ter.length + r.metas.qua.length).toBe(0 + 0 + 0 + est.metas.seg.filter((m) => m.done).length);
  });

  it("revisões: entram no dia certo, saem quando deixam de estar agendadas e as vencidas aparecem como atrasadas", () => {
    const { est } = semanaVigente(null, ctx, "2026-09-28");
    const revisoes = [{ id: "r1", materiaId: "biologia", topicoId: "bi1", itemId: "bi1-x", duracaoMin: 20, sessoes: [
      { dia: "2026-09-21", status: "agendada" }, { dia: "2026-10-01", status: "agendada" },
    ] }];
    const s1 = sincronizarRevisoes(est, revisoes, "2026-09-28");
    expect(s1.metas.qui[0]).toMatchObject({ tipo: "revisao", revisaoId: "r1", dia: "2026-10-01" });
    expect(sincronizarRevisoes(s1, revisoes, "2026-09-28")).toBe(s1); // nada muda
    const { atrasadas } = listasDoDia(s1, "2026-09-28", revisoes);
    expect(atrasadas.find((m) => m.revisaoId === "r1")).toMatchObject({ dia: "2026-09-21", avulsa: true });
    revisoes[0].sessoes[1].status = "ignorada";
    expect(sincronizarRevisoes(s1, revisoes, "2026-09-28").metas.qui.some((m) => m.revisaoId)).toBe(false);
  });
});
