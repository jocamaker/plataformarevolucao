import { describe, expect, it } from "vitest";
import { criarRepositorioLocal } from "./local.js";
import { apagarCampo, carimbo, incrementar } from "./contrato.js";

const memoria = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }; };
const novo = () => criarRepositorioLocal({ armazenamento: memoria(), arquivos: { salvar: async () => {} }, relogio: () => new Date("2026-09-28T13:00:00Z") });

describe("repositório local", () => {
  it("lote é tudo ou nada", async () => {
    const r = novo();
    await r.definir("a", "1", { v: 1 });
    await expect(r.lote([
      { tipo: "atualizar", colecao: "a", id: "1", dados: { v: 2 } },
      { tipo: "atualizar", colecao: "a", id: "nao-existe", dados: { v: 3 } },
    ])).rejects.toThrow(/Não existe/);
    expect((await r.obter("a", "1")).v).toBe(1);
  });

  it("mesclar cria e soma em profundidade; atualizar aceita caminhos e sentinelas", async () => {
    const r = novo();
    await r.mesclar("p", "x", { itens: { a: { minutos: incrementar(30) } } });
    await r.mesclar("p", "x", { itens: { a: { minutos: incrementar(15), em: carimbo() }, b: { minutos: incrementar(5) } } });
    expect(await r.obter("p", "x")).toEqual({ id: "x", itens: { a: { minutos: 45, em: "2026-09-28T13:00:00.000Z" }, b: { minutos: 5 } } });
    await r.atualizar("p", "x", { "itens.a.em": apagarCampo(), "itens.b.minutos": 7 });
    expect((await r.obter("p", "x")).itens).toEqual({ a: { minutos: 45 }, b: { minutos: 7 } });
  });

  it("filtros de igualdade e intervalo; observar avisa a cada escrita", async () => {
    const r = novo();
    await r.lote([["1", "2026-09-01"], ["2", "2026-09-20"], ["3", "2026-09-28"]].map(([id, data]) => ({ tipo: "definir", colecao: "q", id, dados: { alunoId: "a", data } })));
    expect((await r.listar("q", [["alunoId", "==", "a"], ["data", ">=", "2026-09-15"]])).map((d) => d.id)).toEqual(["2", "3"]);
    const vistos = [];
    const parar = r.observar("q", [["data", "<", "2026-09-10"]], (l) => vistos.push(l.length));
    await new Promise((ok) => setTimeout(ok, 0));
    await r.criar("q", { alunoId: "a", data: "2026-09-02" });
    parar();
    await r.criar("q", { alunoId: "a", data: "2026-09-03" });
    expect(vistos).toEqual([1, 2]);
  });

  it("contas: senha mínima, e-mail único, entrar e sair", async () => {
    const r = novo();
    await expect(r.criarConta("x@y.com", "123")).rejects.toThrow(/6 caracteres/);
    const uid = await r.criarConta("X@y.com", "segredo");
    await expect(r.criarConta("x@y.com", "outra123")).rejects.toThrow(/Já existe/);
    expect(await r.entrar("x@y.com", "segredo")).toBe(uid);
    await expect(r.entrar("x@y.com", "errada")).rejects.toThrow();
  });
});
