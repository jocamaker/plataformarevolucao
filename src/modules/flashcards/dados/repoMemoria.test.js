import { describe, expect, it } from "vitest";
import { contratoDoRepositorio } from "./contrato.suite.js";
import { criarRepoMemoria } from "./repoMemoria.js";

contratoDoRepositorio("memória", async () => criarRepoMemoria({ uid: "ana" }));

describe("repositório em memória com persistência", () => {
  it("grava cada lote de uma vez na persistência", async () => {
    const gravacoes = [];
    const r = criarRepoMemoria({ uid: "ana", persistencia: { gravar: async (m) => { gravacoes.push(m); } } });
    await r.lote([
      { tipo: "definir", colecao: "materias", id: "m1", dados: { nome: "Física", ordem: 0 } },
      { tipo: "definir", colecao: "topicos", id: "t1", dados: { materiaId: "m1", nome: "Óptica", ordem: 0 } },
    ]);
    await r.lote([{ tipo: "remover", colecao: "topicos", id: "t1" }]);
    expect(gravacoes).toEqual([
      [["materias/m1", { nome: "Física", ordem: 0 }], ["topicos/t1", { materiaId: "m1", nome: "Óptica", ordem: 0 }]],
      [["topicos/t1", null]],
    ]);
  });

  it("se a persistência falha, nada muda na memória", async () => {
    const r = criarRepoMemoria({ uid: "ana", persistencia: { gravar: async () => { throw new Error("disco cheio"); } } });
    await expect(r.lote([{ tipo: "definir", colecao: "materias", id: "m1", dados: { nome: "Física", ordem: 0 } }])).rejects.toThrow("disco cheio");
    expect(await r.obter("materias", "m1")).toBeNull();
  });

  it("começa do que já estava salvo e não mistura alunos", async () => {
    const ana = criarRepoMemoria({ uid: "ana", inicial: { "materias/m1": { nome: "Física", ordem: 0 } } });
    const carlos = criarRepoMemoria({ uid: "carlos" });
    expect((await ana.obter("materias", "m1")).nome).toBe("Física");
    expect(await carlos.listar("materias")).toEqual([]);
    expect(() => criarRepoMemoria({})).toThrow(/Sem aluno/);
  });
});
