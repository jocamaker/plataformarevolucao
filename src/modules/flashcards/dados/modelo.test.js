import { describe, expect, it } from "vitest";
import { chaveDia, inicioDaChave, proximaVirada, somarDias } from "./datas.js";
import {
  CONFIG_PADRAO, ESTADOS, cartaoNovo, comFila, fsrsDoDoc, fsrsParaDoc, idCartao, lacunasDoTexto, normalizarConfig, normalizarMateria,
  normalizarNota, normalizarTags, normalizarTopico, ordinaisDaNota, sincronizarCartoes,
} from "./modelo.js";

const agora = new Date(2026, 8, 28, 10, 0);
const notaBasica = { tipo: "basico", materiaId: "m1", topicoId: "t1", campos: { frente: "<p>Capital da França?</p>", verso: "<p>Paris</p>" }, tags: [] };
const notaCloze = (texto, extra = {}) => ({ tipo: "cloze", materiaId: "m1", topicoId: "t1", campos: { texto }, tags: [], ...extra });

describe("configurações", () => {
  it("usa os padrões e aceita números vindos de campos de texto", () => {
    expect(normalizarConfig()).toEqual({ ...CONFIG_PADRAO, passosAprendizado: ["1m", "10m"], passosReaprendizado: ["10m"] });
    expect(normalizarConfig({ retencao: "0.85", novosPorDia: "30" })).toMatchObject({ retencao: 0.85, novosPorDia: 30 });
  });
  it("recusa valores fora da faixa, campo a campo", () => {
    try {
      normalizarConfig({ retencao: 0.5, intervaloMaximo: 0, novosPorDia: -1, passosAprendizado: ["10x"], viradaDoDia: 24 });
      throw new Error("deveria recusar");
    } catch (e) {
      expect(Object.keys(e.campos).sort()).toEqual(["intervaloMaximo", "novosPorDia", "passosAprendizado", "retencao", "viradaDoDia"]);
    }
  });
});

describe("matérias, tópicos e tags", () => {
  it("nomes limpos e obrigatórios", () => {
    expect(normalizarMateria({ nome: "  Biologia   celular ", ordem: "2" })).toEqual({ nome: "Biologia celular", ordem: 2 });
    expect(() => normalizarMateria({ nome: "   " })).toThrow(/nome/);
    expect(() => normalizarMateria({ nome: "x".repeat(81) })).toThrow(/longo/);
    expect(normalizarTopico({ materiaId: "m1", nome: "Genética" })).toEqual({ materiaId: "m1", nome: "Genética", ordem: 0 });
    expect(() => normalizarTopico({ nome: "Sem matéria" })).toThrow(/matéria/);
  });
  it("tags sem repetir (maiúsculas contam igual), com espaços e de texto separado por vírgula", () => {
    expect(normalizarTags(["banca  FUVEST", "revisar", "Banca fuvest", " ", "revisar"])).toEqual(["banca FUVEST", "revisar"]);
    expect(normalizarTags("revisar, difícil")).toEqual(["revisar", "difícil"]);
    expect(() => normalizarTags(Array.from({ length: 31 }, (_, i) => `t${i}`))).toThrow(/30 tags/);
  });
});

describe("cloze", () => {
  it("acha as lacunas, com dica e repetidas", () => {
    expect(lacunasDoTexto("A {{c2::mitocôndria}} faz {{c1::respiração::processo}}; {{c2::ela}} tem DNA.")).toEqual([1, 2]);
    expect(lacunasDoTexto("sem lacunas")).toEqual([]);
    expect(lacunasDoTexto("{{c10::a}} {{c3::b}}")).toEqual([3, 10]);
  });
});

describe("notas", () => {
  it("básico exige frente e verso; guarda as imagens embutidas", () => {
    expect(() => normalizarNota({ ...notaBasica, campos: { frente: "<p> </p>", verso: "" } })).toThrow();
    const com = normalizarNota({ ...notaBasica, campos: { frente: '<p><img data-fc-img="st:flashcards/ana/a.webp" src="x"></p>', verso: "Paris" } });
    expect(com.imagens).toEqual(["st:flashcards/ana/a.webp"]);
    expect(ordinaisDaNota(normalizarNota(notaBasica))).toEqual(["1"]);
  });
  it("cloze exige ao menos uma lacuna e gera um cartão por lacuna", () => {
    expect(() => normalizarNota(notaCloze("nada escondido"))).toThrow();
    expect(ordinaisDaNota(normalizarNota(notaCloze("{{c1::DNA}} e {{c3::RNA}} e {{c1::genes}}")))).toEqual(["c1", "c3"]);
  });
  it("oclusão exige imagem e formas dentro dela; um cartão por forma", () => {
    const base = { tipo: "oclusao", materiaId: "m1", topicoId: "t1", tags: ["mapas"], campos: { imagem: { ref: "st:flashcards/ana/mapa.webp", largura: 800, altura: 600 } } };
    expect(() => normalizarNota({ ...base, campos: { ...base.campos, formas: [] } })).toThrow();
    expect(() => normalizarNota({ ...base, campos: { ...base.campos, formas: [{ id: "a", x: 0.9, y: 0.1, w: 0.3, h: 0.1 }] } })).toThrow();
    const n = normalizarNota({ ...base, campos: { ...base.campos, formas: [{ id: "a", x: 0.1, y: 0.1, w: 0.2, h: 0.1 }, { id: "b", tipo: "elipse", x: 0.5, y: 0.5, w: 0.2, h: 0.2 }] } });
    expect(ordinaisDaNota(n)).toEqual(["f_a", "f_b"]);
    expect(n.imagens).toEqual(["st:flashcards/ana/mapa.webp"]);
  });
  it("recusa tipo desconhecido e nota sem lugar na árvore", () => {
    expect(() => normalizarNota({ ...notaBasica, tipo: "outro" })).toThrow(/Tipo/);
    try { normalizarNota({ ...notaBasica, topicoId: "" }); } catch (e) { expect(e.campos.topicoId).toBeTruthy(); }
  });
});

describe("cartões e fila", () => {
  const nota = normalizarNota(notaBasica);
  it("cartão novo entra na fila de novos, não na de revisões", () => {
    const c = cartaoNovo({ nota, notaId: "n1", ordinal: "1", agora, posicaoNovo: 7 });
    expect(c.fsrs.state).toBe(ESTADOS.novo);
    expect(c).toMatchObject({ ordemNovo: 7, fila: null, suspenso: false, materiaId: "m1", topicoId: "t1" });
    expect(idCartao("n1", "c2")).toBe("n1__c2");
  });
  it("estudado: fila = próxima revisão; enterrado adia; suspenso sai das duas filas", () => {
    const base = cartaoNovo({ nota, notaId: "n1", ordinal: "1", agora, posicaoNovo: 1 });
    const due = new Date(2026, 9, 5, 10);
    const estudado = comFila({ ...base, fsrs: { ...base.fsrs, state: ESTADOS.revisao, due } });
    expect(estudado).toMatchObject({ fila: due, ordemNovo: null });
    const amanha = new Date(2026, 8, 29, 4);
    const hoje = comFila({ ...estudado, fsrs: { ...estudado.fsrs, due: agora }, enterradoAte: amanha });
    expect(hoje.fila).toEqual(amanha);
    expect(comFila({ ...estudado, enterradoAte: amanha }).fila).toEqual(due); // já vence depois
    expect(comFila({ ...estudado, suspenso: true })).toMatchObject({ fila: null, ordemNovo: null });
    expect(comFila({ ...base, suspenso: true })).toMatchObject({ fila: null, ordemNovo: null });
    expect(comFila({ ...base, enterradoAte: amanha })).toMatchObject({ fila: null, ordemNovo: null }); // novo adiado sai da fila de novos
  });
  it("estado FSRS vai e volta do documento sem perder nada", () => {
    const c = cartaoNovo({ nota, notaId: "n1", ordinal: "1", agora, posicaoNovo: 1 });
    const volta = fsrsParaDoc(fsrsDoDoc(c.fsrs));
    expect(volta).toEqual(c.fsrs);
  });
  it("editar a nota mantém o progresso dos cartões que continuam", () => {
    const antes = normalizarNota(notaCloze("{{c1::DNA}} e {{c2::RNA}}"));
    const primeira = sincronizarCartoes({ nota: antes, notaId: "n1", agora, proximaPosicao: 10 });
    expect(primeira.criar.map((c) => c.id)).toEqual(["n1__c1", "n1__c2"]);
    expect(primeira.proximaPosicao).toBe(12);
    const atuais = primeira.criar.map((c) => ({ id: c.id, ...c.dados }));
    atuais[0].fsrs = { ...atuais[0].fsrs, state: ESTADOS.revisao, reps: 5 };
    const depois = normalizarNota(notaCloze("{{c1::DNA}} e {{c3::proteína}}", { topicoId: "t2", tags: ["fuvest"] }));
    const r = sincronizarCartoes({ nota: depois, notaId: "n1", cartoesAtuais: atuais, agora, proximaPosicao: 12 });
    expect(r.criar.map((c) => c.id)).toEqual(["n1__c3"]);
    expect(r.remover).toEqual(["n1__c2"]);
    expect(r.atualizar).toEqual([{ id: "n1__c1", dados: { materiaId: "m1", topicoId: "t2", tags: ["fuvest"], atualizadoEm: agora } }]);
  });
});

describe("dias de estudo (fuso do aparelho, virada às 4h)", () => {
  it("1h30 ainda é o dia anterior; 4h já é o novo dia", () => {
    expect(chaveDia(new Date(2026, 8, 28, 1, 30))).toBe("2026-09-27");
    expect(chaveDia(new Date(2026, 8, 28, 4, 0))).toBe("2026-09-28");
    expect(chaveDia(new Date(2026, 8, 28, 23, 59))).toBe("2026-09-28");
    expect(chaveDia(new Date(2026, 8, 28, 1, 30), 0)).toBe("2026-09-28");
  });
  it("próxima virada, início de um dia e somar dias atravessando o mês", () => {
    expect(proximaVirada(new Date(2026, 8, 28, 22))).toEqual(new Date(2026, 8, 29, 4));
    expect(proximaVirada(new Date(2026, 8, 29, 2))).toEqual(new Date(2026, 8, 29, 4));
    expect(inicioDaChave("2026-09-28")).toEqual(new Date(2026, 8, 28, 4));
    expect(somarDias("2026-09-29", 3)).toBe("2026-10-02");
    expect(somarDias("2026-03-01", -1)).toBe("2026-02-28");
  });
});
