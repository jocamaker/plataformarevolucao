import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { contratoDoRepositorio } from "./contrato.suite.js";
import { abrirRepoDemonstracao } from "./repoDemonstracao.js";

let n = 0;
contratoDoRepositorio("demonstração (IndexedDB)", () => abrirRepoDemonstracao({ uid: `aluno-${++n}` }));

describe("demonstração: o que fica gravado no navegador", () => {
  it("sobrevive a reabrir e não mistura alunos", async () => {
    const ana = await abrirRepoDemonstracao({ uid: "ana-demo" });
    await ana.lote([{ tipo: "definir", colecao: "materias", id: "m1", dados: { nome: "Física", ordem: 0, criadoEm: new Date(2026, 8, 28) } }]);
    const reaberta = await abrirRepoDemonstracao({ uid: "ana-demo" });
    const m = await reaberta.obter("materias", "m1");
    expect(m.nome).toBe("Física");
    expect(m.criadoEm).toBeInstanceOf(Date);
    const bia = await abrirRepoDemonstracao({ uid: "ana-demo-2" }); // prefixo parecido, outro aluno
    expect(await bia.listar("materias")).toEqual([]);
  });
  it("imagens: grava, lê e apaga", async () => {
    const r = await abrirRepoDemonstracao({ uid: "img" });
    const ref = await r.enviarImagem(new Blob(["x"], { type: "image/webp" }));
    expect(ref).toMatch(/^idb-fc:/);
    expect(await r.urlImagem(ref)).toMatch(/^blob:/);
    await r.apagarImagem(ref);
    expect(await r.urlImagem(ref)).toBeNull();
  });
});
