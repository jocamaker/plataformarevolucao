import { describe, expect, it } from "vitest";
import { ESTADOS, normalizarConfig } from "../dados/modelo.js";
import { SessaoEstudo, feitosHoje, montarPlano, montarRevisao, noEscopo } from "./fila.js";

const agora = new Date(2026, 8, 28, 10, 0);
const fimDoDia = new Date(2026, 8, 29, 4, 0);
const config = normalizarConfig({ novosPorDia: 3, revisoesPorDia: 4 });
const min = (m) => new Date(agora.getTime() + m * 60000);

let seq = 0;
function cartao({ estado = ESTADOS.revisao, due = agora, topico = "t1", materia = "m1", nota, tags = [], ordemNovo = null, ...resto } = {}) {
  seq += 1;
  return {
    id: `c${seq}`, notaId: nota || `n${seq}`, topicoId: topico, materiaId: materia, tags, ordemNovo,
    suspenso: false, enterradoAte: null, fsrs: { state: estado, due }, ...resto,
  };
}
const novo = (extra = {}) => cartao({ estado: ESTADOS.novo, ordemNovo: seq + 1, ...extra });

describe("plano do dia", () => {
  it("revisões das menos lembradas para as mais lembradas, até o limite", () => {
    const rs = [0.9, 0.5, 0.7, 0.3, 0.8, 0.6].map((r) => cartao({ r }));
    const plano = montarPlano({ agora, config: { ...config, novosPorDia: 0 }, pendentes: rs, retencao: (c) => c.r });
    expect(plano.principal.map((c) => c.r)).toEqual([0.3, 0.5, 0.6, 0.7]);
  });
  it("limites contam o que já foi feito hoje", () => {
    const dia = { revisoes: { a: { estadoAntes: ESTADOS.novo }, b: { estadoAntes: ESTADOS.novo }, c: { estadoAntes: ESTADOS.revisao }, d: { estadoAntes: ESTADOS.aprendendo } } };
    expect(feitosHoje(dia)).toEqual({ novos: 2, revisoes: 1, total: 4 });
    const plano = montarPlano({ agora, config, pendentes: Array.from({ length: 6 }, () => cartao()), novos: Array.from({ length: 5 }, () => novo()), dia });
    expect(plano.principal.filter((c) => c.fsrs.state === ESTADOS.novo)).toHaveLength(1);
    expect(plano.principal.filter((c) => c.fsrs.state === ESTADOS.revisao)).toHaveLength(3);
  });
  it("aprendizado entra sempre (sem limite), em ordem de horário", () => {
    const a1 = cartao({ estado: ESTADOS.aprendendo, due: min(9) });
    const a2 = cartao({ estado: ESTADOS.reaprendendo, due: min(2) });
    const plano = montarPlano({ agora, config: { ...config, novosPorDia: 0, revisoesPorDia: 0 }, pendentes: [a1, a2] });
    expect(plano.aprendendo.map((c) => c.id)).toEqual([a2.id, a1.id]);
    expect(plano.principal).toEqual([]);
  });
  it("suspensos, enterrados e fora do escopo ficam de fora", () => {
    const ok = cartao({ topico: "t1" });
    const plano = montarPlano({
      agora, config, escopo: { materiaId: "m1" },
      pendentes: [ok, cartao({ suspenso: true }), cartao({ enterradoAte: fimDoDia }), cartao({ materia: "m2" })],
    });
    expect(plano.principal.map((c) => c.id)).toEqual([ok.id]);
  });
  it("irmãos (mesma nota) não entram juntos", () => {
    const a = cartao({ nota: "n-cloze", estado: ESTADOS.aprendendo, due: min(1) });
    const b = cartao({ nota: "n-cloze" });
    const c = novo({ nota: "n-cloze" });
    const d = novo({ nota: "n-outra" });
    const plano = montarPlano({ agora, config, pendentes: [a, b], novos: [c, d] });
    expect(plano.aprendendo.map((x) => x.id)).toEqual([a.id]);
    expect(plano.principal.map((x) => x.id)).toEqual([d.id]);
  });
  it("novos espalhados entre as revisões", () => {
    const plano = montarPlano({ agora, config: { ...config, revisoesPorDia: 6, novosPorDia: 2 }, pendentes: Array.from({ length: 6 }, () => cartao()), novos: [novo(), novo()] });
    const pos = plano.principal.map((c, i) => (c.fsrs.state === ESTADOS.novo ? i : -1)).filter((i) => i >= 0);
    expect(pos).toHaveLength(2);
    expect(pos[1] - pos[0]).toBeGreaterThanOrEqual(3);
  });
  it("escopo por tópico e por tag (maiúsculas não importam)", () => {
    const c = cartao({ topico: "t9", tags: ["Banca FUVEST"] });
    expect(noEscopo(c, { topicoId: "t9" })).toBe(true);
    expect(noEscopo(c, { topicoId: "t1" })).toBe(false);
    expect(noEscopo(c, { tag: "banca fuvest" })).toBe(true);
    expect(noEscopo(c, { tag: "revisar" })).toBe(false);
  });
});

describe("sessão de estudo", () => {
  const sessao = (principal, aprendendo = []) => new SessaoEstudo({ plano: { principal, aprendendo }, fimDoDia });

  it("nunca dois seguidos do mesmo tópico quando há alternativa", () => {
    const cs = [cartao({ topico: "A" }), cartao({ topico: "A" }), cartao({ topico: "A" }), cartao({ topico: "B" }), cartao({ topico: "B" })];
    const s = sessao(cs);
    const vistos = [];
    for (let i = 0; i < cs.length; i += 1) {
      const { cartao: c } = s.proximo(agora);
      vistos.push(c.topicoId);
      s.registrar(c, { ...c, fsrs: { state: ESTADOS.revisao, due: new Date(2026, 9, 5) } });
    }
    expect(vistos.slice(0, 4)).toEqual(["A", "B", "A", "B"]);
    expect(s.proximo(agora)).toEqual({ fim: true });
    expect(s.progresso()).toMatchObject({ feitos: 5, total: 5 });
  });

  it("errou: o cartão volta hoje, na hora certa (ou até 20 min antes se não houver mais nada)", () => {
    const c = cartao();
    const s = sessao([c]);
    const { cartao: atual } = s.proximo(agora);
    s.registrar(atual, { ...atual, fsrs: { state: ESTADOS.reaprendendo, due: min(10) } });
    expect(s.contagens()).toEqual({ novos: 0, aprendendo: 1, revisao: 0 });
    expect(s.proximo(agora).cartao.id).toBe(c.id); // nada mais: antecipa (10 min < 20 min)
    const s2 = sessao([c]);
    const x = s2.proximo(agora).cartao;
    s2.registrar(x, { ...x, fsrs: { state: ESTADOS.reaprendendo, due: min(45) } });
    expect(s2.proximo(agora)).toEqual({ espera: min(45) });
    expect(s2.proximo(min(45)).cartao.id).toBe(c.id);
    expect(s2.progresso()).toMatchObject({ feitos: 0, total: 1 });
  });

  it("aprendizado vencido tem prioridade sobre o resto", () => {
    const a = cartao({ estado: ESTADOS.aprendendo, due: min(-1), topico: "X" });
    const r = cartao({ topico: "Y" });
    const s = sessao([r], [a]);
    expect(s.proximo(agora).cartao.id).toBe(a.id);
  });

  it("desfazer devolve o cartão como próximo e acerta o progresso", () => {
    const c1 = cartao({ topico: "A" });
    const c2 = cartao({ topico: "B" });
    const s = sessao([c1, c2]);
    const primeiro = s.proximo(agora).cartao;
    const passo = s.registrar(primeiro, { ...primeiro, fsrs: { state: ESTADOS.revisao, due: new Date(2026, 9, 9) } });
    expect(s.progresso().feitos).toBe(1);
    s.desfazer(passo);
    expect(s.progresso()).toMatchObject({ feitos: 0, respostas: 0 });
    expect(s.proximo(agora).cartao.id).toBe(primeiro.id);
    const errou = s.registrar(primeiro, { ...primeiro, fsrs: { state: ESTADOS.reaprendendo, due: min(10) } });
    s.desfazer(errou);
    expect(s.contagens().aprendendo).toBe(0);
  });

  it("suspender ou enterrar no meio tira o cartão da conta", () => {
    const c1 = cartao();
    const s = sessao([c1, cartao()]);
    s.descartar(c1.id);
    expect(s.progresso().total).toBe(1);
    expect(s.proximo(agora).cartao.id).not.toBe(c1.id);
  });
});

describe("rever antes do prazo", () => {
  it("todos os já estudados do escopo, vencidos ou não, dos menos lembrados primeiro", () => {
    const longe = cartao({ due: new Date(2026, 10, 1), r: 0.97 });
    const fraco = cartao({ due: new Date(2026, 9, 5), r: 0.6 });
    const hoje = cartao({ r: 0.8 });
    const aprendendo = cartao({ estado: ESTADOS.aprendendo, due: min(30), r: 0.7 });
    const outroTopico = cartao({ topico: "t2", r: 0.1 });
    const plano = montarRevisao({
      agora,
      cartoes: [longe, fraco, hoje, aprendendo, outroTopico, novo(), cartao({ suspenso: true }), cartao({ enterradoAte: min(600) })],
      escopo: { topicoId: "t1" },
      retencao: (c) => c.r,
    });
    expect(plano.principal.map((c) => c.id)).toEqual([fraco.id, aprendendo.id, hoje.id, longe.id]);
    expect(plano.aprendendo).toEqual([]);
  });

  it("respostas antecipadas não gastam o limite do dia", () => {
    const dia = { revisoes: { a: { estadoAntes: ESTADOS.revisao, antecipada: true }, b: { estadoAntes: ESTADOS.revisao } } };
    expect(feitosHoje(dia)).toEqual({ novos: 0, revisoes: 1, total: 2 });
  });
});

