/* O motor de agendamento: o comportamento que o FSRS precisa ter aqui. */

import { describe, expect, it } from "vitest";
import { ESTADOS, cartaoNovo, fsrsDoDoc, normalizarNota } from "../dados/modelo.js";
import { AVALIACOES, criarAgendador, formatarIntervalo } from "./agendador.js";

const [NOVAMENTE, DIFICIL, BOM, FACIL] = AVALIACOES.map((a) => a.valor);
const hora = (d, h = 10) => new Date(2026, 8, d, h);
const nota = normalizarNota({ tipo: "basico", materiaId: "m", topicoId: "t", campos: { frente: "a", verso: "b" }, tags: [] });
const novo = (agora = hora(1)) => ({ id: "c", ...cartaoNovo({ nota, notaId: "n", ordinal: "1", agora, posicaoNovo: 1 }) });
const ag = (config = {}) => criarAgendador(config, { fuzz: false });

// um cartão já em revisão: novo → Bom → Bom
function emRevisao(a = ag()) {
  let c = novo(hora(1, 10));
  c = { ...c, fsrs: a.responder(c, BOM, hora(1, 10)) };
  c = { ...c, fsrs: a.responder(c, BOM, hora(1, 10, 10)) };
  const due = new Date(c.fsrs.due);
  return { cartao: c, venceEm: due };
}

describe("FSRS: primeira resposta de um cartão novo", () => {
  it("Novamente, Difícil e Bom ficam em aprendizado (minutos); Fácil já vai para revisão (dias)", () => {
    const p = ag().previsoes(novo(), hora(1));
    expect(p[NOVAMENTE].fsrs.state).toBe(ESTADOS.aprendendo);
    expect(p[BOM].fsrs.state).toBe(ESTADOS.aprendendo);
    expect(p[FACIL].fsrs.state).toBe(ESTADOS.revisao);
    expect(p[NOVAMENTE].intervaloMs).toBe(60000); // 1º passo: 1 min
    expect(p[BOM].intervaloMs).toBe(10 * 60000); // 2º passo: 10 min
    expect(p[FACIL].intervaloMs).toBeGreaterThanOrEqual(86400000);
  });
  it("estabilidade inicial cresce de Novamente a Fácil; dificuldade cai", () => {
    const p = ag().previsoes(novo(), hora(1));
    const S = AVALIACOES.map((a) => p[a.valor].fsrs.stability);
    const D = AVALIACOES.map((a) => p[a.valor].fsrs.difficulty);
    expect(S).toEqual([...S].sort((x, y) => x - y));
    expect(D).toEqual([...D].sort((x, y) => y - x));
    D.forEach((d) => { expect(d).toBeGreaterThanOrEqual(1); expect(d).toBeLessThanOrEqual(10); });
  });
});

describe("FSRS: cartão em revisão", () => {
  it("intervalos em ordem: Novamente < Difícil < Bom < Fácil", () => {
    const a = ag();
    const { cartao, venceEm } = emRevisao(a);
    const p = a.previsoes(cartao, venceEm);
    const ms = AVALIACOES.map((x) => p[x.valor].intervaloMs);
    expect(ms[0]).toBeLessThan(ms[1]);
    expect(ms[1]).toBeLessThan(ms[2]);
    expect(ms[2]).toBeLessThan(ms[3]);
  });
  it("Novamente: esqueceu → reaprendendo, estabilidade cai, dificuldade sobe, conta um lapso", () => {
    const a = ag();
    const { cartao, venceEm } = emRevisao(a);
    const depois = a.responder(cartao, NOVAMENTE, venceEm);
    expect(depois.state).toBe(ESTADOS.reaprendendo);
    expect(depois.stability).toBeLessThan(cartao.fsrs.stability);
    expect(depois.difficulty).toBeGreaterThan(cartao.fsrs.difficulty);
    expect(depois.lapses).toBe(cartao.fsrs.lapses + 1);
    expect(depois.due.getTime() - venceEm.getTime()).toBe(10 * 60000); // passo de reaprendizado
  });
  it("Difícil sobe pouco a estabilidade e a dificuldade; Bom quase não mexe na dificuldade; Fácil a diminui", () => {
    const a = ag();
    const { cartao, venceEm } = emRevisao(a);
    const d = (x) => a.responder(cartao, x, venceEm);
    const [dif, bom, fac] = [d(DIFICIL), d(BOM), d(FACIL)];
    expect(dif.stability).toBeGreaterThan(cartao.fsrs.stability);
    expect(dif.stability).toBeLessThan(bom.stability);
    expect(bom.stability).toBeLessThan(fac.stability);
    expect(dif.difficulty).toBeGreaterThan(cartao.fsrs.difficulty);
    // no FSRS-6 o Bom não soma nem subtrai; só a reversão à média mexe (pouco)
    expect(Math.abs(bom.difficulty - cartao.fsrs.difficulty)).toBeLessThan(0.1);
    expect(fac.difficulty).toBeLessThan(cartao.fsrs.difficulty);
  });
  it("probabilidade de lembrar: ~retenção-alvo no vencimento, cai com o tempo", () => {
    const a = ag({ retencao: 0.9 });
    const { cartao, venceEm } = emRevisao(a);
    const noDia = a.retencao(cartao, venceEm);
    expect(noDia).toBeGreaterThan(0.85);
    expect(noDia).toBeLessThan(0.95);
    expect(a.retencao(cartao, new Date(venceEm.getTime() + 30 * 86400000))).toBeLessThan(noDia);
    expect(a.retencao(novo(), hora(1))).toBeNull();
  });
});

describe("FSRS: configurações do aluno", () => {
  it("retenção-alvo maior → intervalos menores", () => {
    const intervaloBom = (retencao) => {
      const a = ag({ retencao });
      const { cartao, venceEm } = emRevisao(a);
      return a.previsoes(cartao, venceEm)[BOM].intervaloMs;
    };
    expect(intervaloBom(0.95)).toBeLessThan(intervaloBom(0.9));
    expect(intervaloBom(0.9)).toBeLessThan(intervaloBom(0.8));
  });
  it("nunca passa do intervalo máximo (nem no Fácil, que a biblioteca empurraria 1–2 dias além)", () => {
    const a = ag({ intervaloMaximo: 30 });
    const { cartao, venceEm } = emRevisao(a);
    const p = a.previsoes(cartao, new Date(venceEm.getTime() + 20 * 86400000));
    AVALIACOES.forEach((x) => expect(p[x.valor].intervaloMs).toBeLessThanOrEqual(30 * 86400000));
    let c = novo();
    let agora = hora(1);
    for (let i = 0; i < 12; i += 1) {
      c = { ...c, fsrs: a.responder(c, FACIL, agora) };
      const dias = (c.fsrs.due.getTime() - agora.getTime()) / 86400000;
      expect(dias).toBeLessThanOrEqual(30.01);
      agora = c.fsrs.due;
    }
  });
  it("passos de aprendizado configuráveis", () => {
    const p = ag({ passosAprendizado: ["5m", "1h"] }).previsoes(novo(), hora(1));
    expect(p[NOVAMENTE].intervaloMs).toBe(5 * 60000);
    expect(p[BOM].intervaloMs).toBe(60 * 60000);
  });
  it("resetar volta a novo", () => {
    const a = ag();
    const { cartao } = emRevisao(a);
    expect(fsrsDoDoc(a.novo(hora(2))).state).toBe(ESTADOS.novo);
    expect(cartao.fsrs.state).toBe(ESTADOS.revisao);
  });
  it("recusa avaliação fora de 1 a 4", () => {
    expect(() => ag().responder(novo(), 5, hora(1))).toThrow(/Avaliação/);
  });
});

describe("intervalo para mostrar no botão", () => {
  it("formata como o Anki, em português", () => {
    expect(formatarIntervalo(30000)).toBe("<1 min");
    expect(formatarIntervalo(10 * 60000)).toBe("10 min");
    expect(formatarIntervalo(3 * 3600000)).toBe("3 h");
    expect(formatarIntervalo(86400000)).toBe("1 dia");
    expect(formatarIntervalo(4 * 86400000)).toBe("4 dias");
    expect(formatarIntervalo(40 * 86400000)).toBe("1,3 mês");
    expect(formatarIntervalo(100 * 86400000)).toBe("3,3 meses");
    expect(formatarIntervalo(800 * 86400000)).toBe("2,2 anos");
  });
});

describe("retenção-alvo e reagendamento", () => {
  it("modificador de intervalo: 1 com 90%, maior abaixo, menor acima", () => {
    expect(ag({ retencao: 0.9 }).modificadorIntervalo).toBeCloseTo(1, 5);
    expect(ag({ retencao: 0.8 }).modificadorIntervalo).toBeGreaterThan(1);
    expect(ag({ retencao: 0.95 }).modificadorIntervalo).toBeLessThan(1);
  });

  it("reagendar conta da última revisão, respeita o teto e ignora novos/aprendizado", () => {
    const { cartao } = emRevisao();
    const agora = hora(3);
    const r = ag({ retencao: 0.95 }).reagendar(cartao, agora);
    const dias = Math.max(1, Math.round(cartao.fsrs.stability * ag({ retencao: 0.95 }).modificadorIntervalo));
    expect(r.due.getTime()).toBe(new Date(cartao.fsrs.last_review).getTime() + dias * 86400000);
    expect(r.stability).toBe(cartao.fsrs.stability);
    expect(ag().reagendar(novo(), agora)).toBeNull();
  });
});

