/* Cartões de exemplo, para quem começa do zero ver na hora como funciona:
   básico, cloze (com lacunas c1, c2), fórmulas com sub/sobrescrito e tags. */

import { criarMateria, criarTopico } from "./arvore.js";
import { salvarNota } from "./notas.js";

const EXEMPLOS = [
  {
    materia: "Biologia",
    topicos: {
      Genética: [
        { tipo: "basico", frente: "Quem propôs as leis da hereditariedade, e com que planta?", verso: "<p><strong>Gregor Mendel</strong>, com ervilhas (<em>Pisum sativum</em>).</p>", tags: ["fuvest"] },
        { tipo: "cloze", texto: "<p>Na meiose, o {{c1::crossing-over}} acontece na {{c2::prófase I}}.</p>", tags: ["revisar"] },
        { tipo: "basico", frente: "Genótipo de um heterozigoto com os alelos A e a?", verso: "<p><strong>Aa</strong></p>" },
      ],
      Citologia: [
        { tipo: "cloze", texto: "<p>A {{c1::mitocôndria}} é a organela da {{c2::respiração celular}}.</p>" },
        { tipo: "basico", frente: "Que organela faz a fotossíntese?", verso: "<p>O <strong>cloroplasto</strong>.</p>", tags: ["fuvest"] },
      ],
    },
  },
  {
    materia: "Química",
    topicos: {
      Estequiometria: [
        { tipo: "basico", frente: "Fórmula da água oxigenada?", verso: "<p>H<sub>2</sub>O<sub>2</sub></p>" },
        { tipo: "cloze", texto: "<p>A constante de Avogadro vale {{c1::6,02 × 10<sup>23</sup>}} mol<sup>−1</sup>.</p>", tags: ["fuvest"] },
      ],
    },
  },
  {
    materia: "História",
    topicos: {
      "Brasil República": [
        { tipo: "cloze", texto: "<p>A República foi proclamada em {{c1::15 de novembro de 1889}}, por {{c2::Deodoro da Fonseca}}.</p>", tags: ["fuvest"] },
        { tipo: "basico", frente: "O que foi a Política do Café com Leite?", verso: "<ul><li>Alternância na presidência entre <strong>São Paulo</strong> (café) e <strong>Minas Gerais</strong> (leite).</li><li>Primeira República (1894–1930).</li></ul>" },
      ],
    },
  },
];

export async function criarExemplos(repo) {
  const materias = await repo.listar("materias");
  let conhecidas = [];
  let n = 0;
  for (const bloco of EXEMPLOS) {
    const materiaId = await criarMateria(repo, { nome: bloco.materia }, materias);
    materias.push({ id: materiaId, ordem: materias.length });
    const topicos = [];
    for (const [nome, notas] of Object.entries(bloco.topicos)) {
      const topicoId = await criarTopico(repo, { materiaId, nome }, topicos);
      topicos.push({ id: topicoId, ordem: topicos.length });
      for (const e of notas) {
        const campos = e.tipo === "basico" ? { frente: `<p>${e.frente}</p>`, verso: e.verso } : { texto: e.texto, extra: "" };
        await salvarNota(repo, { tipo: e.tipo, materiaId, topicoId, campos, tags: e.tags || [] }, { tagsConhecidas: conhecidas });
        conhecidas = [...new Set([...conhecidas, ...(e.tags || [])])];
        n += 1;
      }
    }
  }
  return n;
}
