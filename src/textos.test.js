import { describe, expect, it } from "vitest";
import { linhasDe, partesDe, preencher, primeiroNome, textoDe } from "./textos.js";

describe("frases editáveis", () => {
  it("o padrão da página inicial é a frase pedida pelo cliente", () => {
    expect(textoDe({}, "inicial.titulo")).toBe("Bem-vindo à *elite*.");
  });

  it("aluno > curso > vestibular > geral > padrão; campo vazio volta para o nível de cima", () => {
    const c = {
      geral: { "painel.plano.titulo": "Semana *focada*" },
      porGrupo: { "curso:medicina": { "painel.plano.titulo": "Rumo ao *jaleco*" }, "vestibular:fuvest": { "painel.plano.titulo": "Semana *FUVEST*" } },
    };
    const k = "painel.plano.titulo";
    expect(textoDe(c, k, { doAluno: { [k]: "Bora, *Ana*" }, cursoId: "medicina", vestibularId: "fuvest" })).toBe("Bora, *Ana*");
    expect(textoDe(c, k, { doAluno: { [k]: "  " }, cursoId: "medicina", vestibularId: "fuvest" })).toBe("Rumo ao *jaleco*");
    expect(textoDe(c, k, { cursoId: "direito", vestibularId: "fuvest" })).toBe("Semana *FUVEST*");
    expect(textoDe(c, k, { vestibularId: "enem" })).toBe("Semana *focada*");
    expect(textoDe({}, k)).toBe("Seu *edital*");
  });

  it("marca o destaque e quebra linhas", () => {
    expect(partesDe("Bem-vindo à *elite*.")).toEqual([{ texto: "Bem-vindo à " }, { texto: "elite", destaque: true }, { texto: "." }]);
    expect(partesDe("sem destaque")).toEqual([{ texto: "sem destaque" }]);
    expect(linhasDe("linha um\n\n  linha dois ")).toEqual(["linha um", "linha dois"]);
  });

  it("troca as variáveis conhecidas e mantém as desconhecidas", () => {
    expect(preencher("{saudacao}, {nome}. {outra}", { saudacao: "Boa noite", nome: "Ana" })).toBe("Boa noite, Ana. {outra}");
  });

  it("primeiro nome sem ponto final (evita \"Prof..\")", () => {
    expect(primeiroNome("Prof. Moderador")).toBe("Prof");
    expect(primeiroNome("Ana Beatriz")).toBe("Ana");
  });
});
