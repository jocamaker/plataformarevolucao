import { describe, expect, it } from "vitest";
import { DIAS } from "./nucleo.js";
import {
  aplicarReplanejamento, listasDoDia, moverMeta, previaReplanejamento, reordenarNoDia, reorganizarSemana, semanaVigente,
  sincronizarRevisoes,
} from "./semana.js";

const ctx = {
  materias: [
    { materiaId: "biologia", peso: 3, maxSessao: 60, pos: 0, pendente: true },
    { materiaId: "quimica", peso: 2, maxSessao: 60, pos: 1, pendente: true },
  ],
  disp: { seg: 120, ter: 120, qua: 120, qui: 120, sex: 120, sab: 180, dom: 60 },
  revisoes: [],
  duracaoRevisao: (id) => (id === "quimica" ? 60 : 60),
  conteudoDaVez: (m) => ({ topicoId: `${m}-t`, topico: "T", subtopicoId: null, itemId: `t:${m}-t` }),
};
const todas = (est) => DIAS.flatMap((d) => est.metas[d.k]);
const min = (l) => l.reduce((s, m) => s + m.minutos, 0);
const nova = () => structuredClone(semanaVigente(null, ctx, "2026-09-28").est); // semana de seg 28/09

describe("semana", () => {
  it("gera a semana com ids únicos, em blocos de 30, na proporção dos pesos", () => {
    const est = nova();
    expect(est.chave).toBe("2026-09-28");
    expect(new Set(todas(est).map((m) => m.id)).size).toBe(todas(est).length);
    expect(todas(est).every((m) => m.id.startsWith("2026-09-28:") && m.minutos % 30 === 0)).toBe(true);
    // 840 min = 28 blocos: 3/5 → 17 blocos, 2/5 → 11; metas de até 60 min
    // pedem número par de blocos, e o que sobra de cada dia é preenchido
    const bio = min(todas(est).filter((m) => m.materiaId === "biologia"));
    const qui = min(todas(est).filter((m) => m.materiaId === "quimica"));
    expect(bio + qui).toBe(840);
    expect(Math.abs(bio - 504)).toBeLessThanOrEqual(60);
    expect(todas(est).every((m) => m.minutos >= 60)).toBe(true);
  });

  it("quem começa no meio da semana não recebe metas nos dias que já passaram", () => {
    const { est } = semanaVigente(null, { ...ctx, inicio: "2026-10-01" }, "2026-10-01"); // quinta
    expect(["seg", "ter", "qua"].every((k) => est.metas[k].length === 0)).toBe(true);
    expect(todas(est).length).toBeGreaterThan(0);
  });

  it("reorganizar mantém dias passados e metas feitas e desconta o que já foi feito", () => {
    const est = nova();
    const feita = est.metas.seg[0];
    feita.done = true; feita.feitoEm = "2026-09-28";
    const passada = est.metas.seg.filter((m) => !m.done);
    const r = reorganizarSemana(est, ctx, "2026-09-29"); // terça
    expect(r.metas.seg).toEqual([feita, ...passada]);
    expect(min(todas(r).filter((m) => m.materiaId === "biologia"))).toBe(min(todas(est).filter((m) => m.materiaId === "biologia"))); // o total da semana continua o mesmo
  });

  it("replanejar leva as pendências para os dias que faltam e não perde o que não coube", () => {
    const est = nova();
    est.pendentes = [{ id: "p1", tipo: "ciclo", materiaId: "quimica", minutos: 600, done: false }];
    const previa = previaReplanejamento(est, ctx, "2026-10-01");
    const r = aplicarReplanejamento(est, previa, "2026-10-01");
    const semEspaco = min(r.pendentes);
    const agendado = min(["qui", "sex", "sab", "dom"].flatMap((k) => r.metas[k]));
    expect(semEspaco).toBeGreaterThan(0);
    expect(r.pendentes.every((m) => m.origem === "sem espaço na semana" && m.minutos % 30 === 0)).toBe(true);
    expect(agendado).toBeLessThanOrEqual(120 + 120 + 180 + 60);
    expect(todas(r).every((m) => m.minutos % 30 === 0)).toBe(true);
    expect(r.metas.seg).toEqual(est.metas.seg); // dias passados ficam como estão
  });

  it("revisões: entram no dia certo, saem quando deixam de estar agendadas e as vencidas aparecem como atrasadas", () => {
    const est = nova();
    const revisoes = [{ id: "r1", materiaId: "biologia", topicoId: "bi1", itemId: "bi1-x", duracaoMin: 20, sessoes: [
      { dia: "2026-09-21", status: "agendada" }, { dia: "2026-10-01", status: "agendada" },
    ] }];
    const s1 = sincronizarRevisoes(est, revisoes, "2026-09-28", ctx.duracaoRevisao);
    expect(s1.metas.qui[0]).toMatchObject({ tipo: "revisao", revisaoId: "r1", dia: "2026-10-01", minutos: 60 });
    expect(sincronizarRevisoes(s1, revisoes, "2026-09-28", ctx.duracaoRevisao)).toBe(s1); // nada muda
    const { atrasadas } = listasDoDia(s1, "2026-09-28", revisoes, ctx.duracaoRevisao);
    expect(atrasadas.find((m) => m.revisaoId === "r1")).toMatchObject({ dia: "2026-09-21", avulsa: true, minutos: 60 });
    // mudar o peso da matéria muda a duração da revisão ainda aberta
    expect(sincronizarRevisoes(s1, revisoes, "2026-09-28", () => 30).metas.qui[0].minutos).toBe(30);
    revisoes[0].sessoes[1].status = "ignorada";
    expect(sincronizarRevisoes(s1, revisoes, "2026-09-28").metas.qui.some((m) => m.revisaoId)).toBe(false);
  });
});

describe("mover meta dentro da semana", () => {
  const segunda = "2026-09-28";

  it("antecipa uma meta de domingo para sábado, quinta ou hoje; adia uma de hoje para domingo", () => {
    const est = nova();
    const dom = est.metas.dom[0];
    expect(moverMeta(est, dom.id, "sab", segunda)).toEqual({ ok: true });
    expect(est.metas.sab.at(-1).id).toBe(dom.id);
    expect(moverMeta(est, dom.id, "qui", segunda).ok).toBe(true);
    expect(moverMeta(est, dom.id, "2026-09-28", segunda).ok).toBe(true); // hoje, pela data
    expect(est.metas.seg.at(-1).id).toBe(dom.id);
    const hoje = est.metas.seg[0];
    expect(moverMeta(est, hoje.id, "dom", segunda).ok).toBe(true);
    expect(est.editada).toBe(true);
  });

  it("leva uma meta atrasada desta semana e uma pendência de semana anterior para hoje", () => {
    const est = nova();
    const deSegunda = est.metas.seg[0];
    expect(moverMeta(est, deSegunda.id, "qua", "2026-09-30").ok).toBe(true); // quarta: a de segunda estava atrasada
    est.pendentes = [{ id: "p1", tipo: "ciclo", materiaId: "quimica", minutos: 60, done: false }];
    expect(moverMeta(est, "p1", "qua", "2026-09-30").ok).toBe(true);
    expect(est.pendentes).toEqual([]);
    expect(est.metas.qua.some((m) => m.id === "p1")).toBe(true);
  });

  it("revisão muda de dia com a data da sessão e mantém a ligação", () => {
    const est = sincronizarRevisoes(nova(), [{ id: "r1", materiaId: "biologia", topicoId: "bi1", sessoes: [{ dia: "2026-10-04", status: "agendada" }] }], segunda, ctx.duracaoRevisao);
    const rev = est.metas.dom.find((m) => m.revisaoId === "r1");
    const r = moverMeta(est, rev.id, "sab", segunda);
    expect(r).toEqual({ ok: true, revisao: { revisaoId: "r1", de: "2026-10-04", para: "2026-10-03" } });
    expect(est.metas.sab.at(-1)).toMatchObject({ revisaoId: "r1", dia: "2026-10-03" });
  });

  it("recusa dia passado, outra semana e meta concluída", () => {
    const est = nova();
    const m = est.metas.qui[0];
    expect(moverMeta(est, m.id, "seg", "2026-09-30")).toMatchObject({ ok: false, motivo: expect.stringMatching(/passou/) });
    expect(moverMeta(est, m.id, "2026-10-05", segunda)).toMatchObject({ ok: false, motivo: expect.stringMatching(/semana atual/) });
    expect(moverMeta(est, m.id, "2026-09-27", segunda).ok).toBe(false);
    m.done = true;
    expect(moverMeta(est, m.id, "sex", segunda)).toMatchObject({ ok: false, motivo: expect.stringMatching(/concluída/) });
  });

  it("reordena as metas de um dia", () => {
    const est = nova();
    const [a, b] = est.metas.seg;
    expect(reordenarNoDia(est, "seg", b.id, -1)).toBe(true);
    expect(est.metas.seg.slice(0, 2).map((x) => x.id)).toEqual([b.id, a.id]);
    expect(reordenarNoDia(est, "seg", b.id, -1)).toBe(false);
  });
});
