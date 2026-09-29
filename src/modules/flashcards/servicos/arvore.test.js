/* Matérias, tópicos e notas gravados no banco (repositório em memória). */

import { beforeEach, describe, expect, it } from "vitest";
import { criarRepoMemoria } from "../dados/repoMemoria.js";
import { ESTADOS } from "../dados/modelo.js";
import { criarAgendador } from "../motor/agendador.js";
import { responder } from "./agenda.js";
import { apagarMateria, apagarTopico, contarConteudo, criarMateria, criarTopico, moverTopico, renomear, reordenar } from "./arvore.js";
import { alterarTags, apagarNotas, moverNotas, salvarNota } from "./notas.js";
import { criarExemplos } from "./exemplos.js";

let repo;
let bio;
let gen;
let cito;
const cloze = (texto, extra = {}) => ({ tipo: "cloze", materiaId: bio, topicoId: gen, campos: { texto }, tags: [], ...extra });

beforeEach(async () => {
  repo = criarRepoMemoria({ uid: "ana" });
  bio = await criarMateria(repo, { nome: "Biologia" });
  gen = await criarTopico(repo, { materiaId: bio, nome: "Genética" });
  cito = await criarTopico(repo, { materiaId: bio, nome: "Citologia" }, [{ ordem: 0 }]);
});

describe("matérias e tópicos", () => {
  it("cria em ordem, renomeia e reordena só o que mudou", async () => {
    const qui = await criarMateria(repo, { nome: "Química" }, [{ ordem: 0 }]);
    expect((await repo.obter("materias", qui)).ordem).toBe(1);
    await renomear(repo, "materias", qui, "  Química orgânica ");
    expect((await repo.obter("materias", qui)).nome).toBe("Química orgânica");
    await expect(renomear(repo, "topicos", gen, " ")).rejects.toThrow();
    const lista = await repo.listar("materias", { ordem: ["ordem", "asc"] });
    await reordenar(repo, "materias", [lista[1], lista[0]]);
    expect((await repo.listar("materias", { ordem: ["ordem", "asc"] })).map((m) => m.nome)).toEqual(["Química orgânica", "Biologia"]);
  });

  it("mover tópico leva notas e cartões junto, com o progresso", async () => {
    const { id } = await salvarNota(repo, cloze("{{c1::DNA}} e {{c2::RNA}}"));
    const fis = await criarMateria(repo, { nome: "Física" });
    await moverTopico(repo, gen, fis);
    expect((await repo.obter("topicos", gen)).materiaId).toBe(fis);
    expect((await repo.obter("notas", id)).materiaId).toBe(fis);
    expect((await repo.listar("cartoes", { onde: [["notaId", "==", id]] })).every((c) => c.materiaId === fis)).toBe(true);
  });

  it("apagar tópico e matéria apaga o conteúdo e as imagens; o histórico fica", async () => {
    const img = await repo.enviarImagem(new Blob(["x"], { type: "image/webp" }));
    const n1 = await salvarNota(repo, { tipo: "basico", materiaId: bio, topicoId: gen, campos: { frente: `<img data-fc-img="${img}">`, verso: "ok" }, tags: [] });
    await salvarNota(repo, { tipo: "basico", materiaId: bio, topicoId: cito, campos: { frente: "a", verso: "b" }, tags: [] });
    const [c] = await repo.listar("cartoes", { onde: [["notaId", "==", n1.id]] });
    const { revisao } = await responder(repo, { cartao: c, avaliacao: 3, agendador: criarAgendador({}, { fuzz: false }), agora: new Date() });
    expect(await contarConteudo(repo, "materiaId", bio)).toEqual({ notas: 2, cartoes: 2 });
    expect(await apagarTopico(repo, gen)).toEqual({ notas: 1, cartoes: 1 });
    expect(await repo.urlImagem(img)).toBeNull();
    expect(await repo.obter("revisoes", revisao.id)).not.toBeNull();
    await apagarMateria(repo, bio);
    expect(await repo.listar("materias")).toEqual([]);
    expect(await repo.listar("topicos")).toEqual([]);
    expect(await repo.listar("cartoes")).toEqual([]);
  });
});

describe("notas", () => {
  it("criar gera um cartão por lacuna; editar mantém o progresso dos que ficam", async () => {
    const { id, criados } = await salvarNota(repo, cloze("{{c1::DNA}} e {{c2::RNA}}"));
    expect(criados).toBe(2);
    const [c1] = await repo.listar("cartoes", { onde: [["ordinal", "==", "c1"]] });
    await responder(repo, { cartao: c1, avaliacao: 4, agendador: criarAgendador({}, { fuzz: false }), agora: new Date() });
    const r = await salvarNota(repo, { ...cloze("{{c1::DNA}} e {{c3::proteína}}"), id });
    expect(r).toMatchObject({ criados: 1, removidos: 1, cartoes: 2 });
    const cartoes = await repo.listar("cartoes", { onde: [["notaId", "==", id]] });
    expect(cartoes.map((c) => c.ordinal).sort()).toEqual(["c1", "c3"]);
    expect(cartoes.find((c) => c.ordinal === "c1").fsrs.state).toBe(ESTADOS.revisao);
    expect((await repo.obter("notas", id)).criadoEm).toBeInstanceOf(Date);
  });

  it("mover e mudar tags levam os cartões junto; tags novas ficam conhecidas", async () => {
    const a = await salvarNota(repo, cloze("{{c1::a}} {{c2::b}}", { tags: ["fuvest"] }), { tagsConhecidas: [] });
    expect((await repo.obter("config", "config")).tagsConhecidas).toEqual(["fuvest"]);
    const nota = await repo.obter("notas", a.id);
    await moverNotas(repo, [nota], { materiaId: bio, topicoId: cito });
    expect((await repo.listar("cartoes", { onde: [["topicoId", "==", cito]] }))).toHaveLength(2);
    await alterarTags(repo, [await repo.obter("notas", a.id)], { adicionar: ["revisar"], remover: ["FUVEST"] }, { tagsConhecidas: ["fuvest"] });
    expect((await repo.obter("notas", a.id)).tags).toEqual(["revisar"]);
    expect((await repo.listar("cartoes", { onde: [["tags", "array-contains", "revisar"]] }))).toHaveLength(2);
    expect((await repo.obter("config", "config")).tagsConhecidas).toEqual(["fuvest", "revisar"]);
    await apagarNotas(repo, [await repo.obter("notas", a.id)]);
    expect(await repo.listar("cartoes")).toEqual([]);
  });

  it("recusa nota inválida sem gravar nada", async () => {
    await expect(salvarNota(repo, cloze("sem lacuna"))).rejects.toThrow();
    expect(await repo.listar("notas")).toEqual([]);
  });

  it("exemplos: 3 matérias, notas de todos os tipos de texto", async () => {
    const r2 = criarRepoMemoria({ uid: "bia" });
    expect(await criarExemplos(r2)).toBe(9);
    expect((await r2.listar("materias")).map((m) => m.nome).sort()).toEqual(["Biologia", "História", "Química"]);
    expect(await r2.contar("cartoes")).toBe(12);
  });
});
