/* Lacunas: a marcação do editor e o formato salvo ({{c1::…}}) vão e voltam sem perda. */

import { describe, expect, it } from "vitest";
import { lacunasDoTexto } from "../dados/modelo.js";
import { htmlCloze, lacunasParaMarcas, marcasParaLacunas } from "./html.js";

describe("lacunas no editor", () => {
  it("do banco para o editor e de volta", () => {
    const salvo = "<p>A {{c1::mitocôndria}} faz a {{c2::respiração <strong>celular</strong>}}; o {{c1::ATP::moeda}} sai dela.</p>";
    const editor = lacunasParaMarcas(salvo);
    expect(editor).toContain('<span data-lacuna="1">mitocôndria</span>');
    expect(editor).toContain('<span data-lacuna="1" data-dica="moeda">ATP</span>');
    expect(marcasParaLacunas(editor)).toBe(salvo);
  });

  it("aceita o HTML que o editor gera (classe e ordem de atributos)", () => {
    const doEditor = '<p>O <span class="fc-lacuna-ed" data-lacuna="3">Brasil</span> e <span data-dica="&quot;a&quot; &amp; b" data-lacuna="4" class="fc-lacuna-ed">Chile</span></p>';
    const salvo = marcasParaLacunas(doEditor);
    expect(salvo).toBe('<p>O {{c3::Brasil}} e {{c4::Chile::"a" & b}}</p>');
    expect(lacunasDoTexto(salvo)).toEqual([3, 4]);
    expect(htmlCloze(salvo, 4, "frente")).toContain('[&quot;a&quot; &amp; b]');
  });

  it("texto sem lacunas passa igual", () => {
    expect(marcasParaLacunas("<p>nada <em>aqui</em></p>")).toBe("<p>nada <em>aqui</em></p>");
    expect(lacunasParaMarcas("<p>nada</p>")).toBe("<p>nada</p>");
  });
});
