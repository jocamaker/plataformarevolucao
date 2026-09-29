/* Bateria de contrato: os mesmos testes para qualquer adaptador (memória,
   demonstração, Firestore). criar() devolve um repositório vazio do aluno. */

import { describe, expect, it } from "vitest";
import { APAGAR } from "./contrato.js";

const dia = (d, h = 12) => new Date(2026, 8, d, h);
const espera = (ms) => new Promise((ok) => { setTimeout(ok, ms); });

export function contratoDoRepositorio(nome, criar) {
  describe(`contrato do repositório: ${nome}`, () => {
    it("grava e lê documentos e a configuração, com datas como Date", async () => {
      const r = await criar();
      await r.lote([
        { tipo: "definir", colecao: "config", dados: { retencao: 0.9, criadoEm: dia(1) } },
        { tipo: "definir", colecao: "materias", id: "m1", dados: { nome: "Biologia", ordem: 0 } },
      ]);
      const config = await r.obter("config", "config");
      expect(config.retencao).toBe(0.9);
      expect(config.criadoEm).toBeInstanceOf(Date);
      expect(config.criadoEm.getTime()).toBe(dia(1).getTime());
      expect(await r.obter("materias", "m1")).toEqual({ id: "m1", nome: "Biologia", ordem: 0 });
      expect(await r.obter("materias", "nao-existe")).toBeNull();
    });

    it("consulta como o Firestore: intervalo só no mesmo tipo, null fora, ordem e limite", async () => {
      const r = await criar();
      await r.lote([
        { tipo: "definir", colecao: "cartoes", id: "a", dados: { fila: dia(5), ordemNovo: null, materiaId: "m1", tags: ["fuvest", "revisar"] } },
        { tipo: "definir", colecao: "cartoes", id: "b", dados: { fila: dia(3), ordemNovo: null, materiaId: "m2", tags: [] } },
        { tipo: "definir", colecao: "cartoes", id: "c", dados: { fila: null, ordemNovo: 2, materiaId: "m1", tags: ["fuvest"] } },
        { tipo: "definir", colecao: "cartoes", id: "d", dados: { fila: null, ordemNovo: 1, materiaId: "m1", tags: [] } },
        { tipo: "definir", colecao: "cartoes", id: "e", dados: { fila: dia(9), ordemNovo: null, materiaId: "m1", tags: [] } },
      ]);
      const pendentes = await r.listar("cartoes", { onde: [["fila", "<=", dia(6)]], ordem: ["fila", "asc"] });
      expect(pendentes.map((c) => c.id)).toEqual(["b", "a"]);
      const novos = await r.listar("cartoes", { onde: [["materiaId", "==", "m1"], ["ordemNovo", ">=", 0]], ordem: ["ordemNovo", "asc"], limite: 1 });
      expect(novos.map((c) => c.id)).toEqual(["d"]);
      const comTag = await r.listar("cartoes", { onde: [["tags", "array-contains", "fuvest"]] });
      expect(comTag.map((c) => c.id).sort()).toEqual(["a", "c"]);
      expect(await r.contar("cartoes", { onde: [["materiaId", "==", "m1"]] })).toBe(4);
      expect(await r.contar("cartoes", { onde: [["ordemNovo", ">=", 0]] })).toBe(2);
      const desc = await r.listar("cartoes", { onde: [["fila", ">", dia(1)]], ordem: ["fila", "desc"], limite: 2 });
      expect(desc.map((c) => c.id)).toEqual(["e", "a"]);
    });

    it("consultas das estatísticas e do reagendamento: campo aninhado e intervalo de texto", async () => {
      const r = await criar();
      await r.lote([
        { tipo: "definir", colecao: "cartoes", id: "a", dados: { fsrs: { state: 2, due: dia(5) } } },
        { tipo: "definir", colecao: "cartoes", id: "b", dados: { fsrs: { state: 0, due: dia(3) } } },
        { tipo: "definir", colecao: "cartoes", id: "c", dados: { fsrs: { state: 2, due: dia(9) } } },
        { tipo: "mesclar", colecao: "dias", id: "2026-08-30", dados: { dia: "2026-08-30", revisoes: { r1: { avaliacao: 3 } } } },
        { tipo: "mesclar", colecao: "dias", id: "2026-09-02", dados: { dia: "2026-09-02", revisoes: { r2: { avaliacao: 1 } } } },
        { tipo: "mesclar", colecao: "dias", id: "2026-09-28", dados: { dia: "2026-09-28", revisoes: { r3: { avaliacao: 4 } } } },
      ]);
      const emRevisao = await r.listar("cartoes", { onde: [["fsrs.state", "==", 2]] });
      expect(emRevisao.map((c) => c.id).sort()).toEqual(["a", "c"]);
      const recentes = await r.listar("dias", { onde: [["dia", ">=", "2026-09-01"]] });
      expect(recentes.map((d) => d.id).sort()).toEqual(["2026-09-02", "2026-09-28"]);
    });

    it("mesclar junta mapas; atualizar aceita caminho com ponto e APAGAR", async () => {
      const r = await criar();
      await r.lote([{ tipo: "mesclar", colecao: "dias", id: "2026-09-28", dados: { revisoes: { r1: { avaliacao: 3 } } } }]);
      await r.lote([{ tipo: "mesclar", colecao: "dias", id: "2026-09-28", dados: { revisoes: { r2: { avaliacao: 1 } } } }]);
      expect((await r.obter("dias", "2026-09-28")).revisoes).toEqual({ r1: { avaliacao: 3 }, r2: { avaliacao: 1 } });
      await r.lote([{ tipo: "atualizar", colecao: "dias", id: "2026-09-28", dados: { "revisoes.r1": APAGAR, total: 1 } }]);
      expect(await r.obter("dias", "2026-09-28")).toEqual({ id: "2026-09-28", revisoes: { r2: { avaliacao: 1 } }, total: 1 });
    });

    it("o lote é tudo ou nada", async () => {
      const r = await criar();
      await r.lote([{ tipo: "definir", colecao: "materias", id: "m1", dados: { nome: "Física", ordem: 0 } }]);
      await expect(r.lote([
        { tipo: "atualizar", colecao: "materias", id: "m1", dados: { nome: "Física 2" } },
        { tipo: "definir", colecao: "topicos", id: "t1", dados: { materiaId: "m1", nome: "Óptica", ordem: 0 } },
        { tipo: "atualizar", colecao: "materias", id: "nao-existe", dados: { nome: "x" } },
      ])).rejects.toThrow();
      expect((await r.obter("materias", "m1")).nome).toBe("Física");
      expect(await r.obter("topicos", "t1")).toBeNull();
    });

    it("remover apaga; coleção desconhecida é recusada", async () => {
      const r = await criar();
      await r.lote([{ tipo: "definir", colecao: "notas", id: "n1", dados: { tipo: "basico" } }]);
      await r.lote([{ tipo: "remover", colecao: "notas", id: "n1" }]);
      expect(await r.obter("notas", "n1")).toBeNull();
      await expect(r.lote([{ tipo: "definir", colecao: "usuarios", id: "x", dados: {} }])).rejects.toThrow(/desconhecida/);
      await expect(r.listar("usuarios")).rejects.toThrow(/desconhecida/);
      await expect(r.lote([{ tipo: "definir", colecao: "notas", id: "n2", dados: { campo: APAGAR } }])).rejects.toThrow(/APAGAR/);
    });

    it("observar entrega o estado inicial e cada mudança", async () => {
      const r = await criar();
      const vistos = [];
      const parar = r.observar("materias", { ordem: ["ordem", "asc"] }, (l) => vistos.push(l.map((m) => m.nome)));
      await espera(300);
      await r.lote([{ tipo: "definir", colecao: "materias", id: "m2", dados: { nome: "Química", ordem: 1 } }]);
      await r.lote([{ tipo: "definir", colecao: "materias", id: "m1", dados: { nome: "Física", ordem: 0 } }]);
      await espera(300);
      parar();
      expect(vistos[0]).toEqual([]);
      expect(vistos[vistos.length - 1]).toEqual(["Física", "Química"]);
    });
  });
}
