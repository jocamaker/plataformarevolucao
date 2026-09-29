/* HTML dos cartões: limpeza (só o que o editor produz; nada de scripts,
   estilos ou eventos) e a montagem de frente e verso de cada tipo. */

import DOMPurify from "dompurify";
import { RE_LACUNA } from "../dados/modelo.js";

const TAGS = ["p", "br", "strong", "b", "em", "i", "u", "s", "sub", "sup", "ul", "ol", "li", "img", "span", "div", "blockquote", "code", "pre", "h1", "h2", "h3", "mark", "hr"];
const ATRIBUTOS = ["src", "alt", "data-fc-img", "class"];

export const limparHtml = (html) => DOMPurify.sanitize(String(html || ""), { ALLOWED_TAGS: TAGS, ALLOWED_ATTR: ATRIBUTOS });

// imagens embutidas: o banco guarda só a referência (data-fc-img); o endereço é resolvido na hora
export function semEnderecos(html) {
  const s = String(html || "");
  if (!s.includes("data-fc-img")) return s;
  const t = document.createElement("template");
  t.innerHTML = s;
  t.content.querySelectorAll("img[data-fc-img]").forEach((img) => img.removeAttribute("src"));
  return t.innerHTML;
}

const escapar = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* Cloze: a lacuna da vez (n) vira […] (ou [dica]) na frente e aparece
   destacada no verso; as outras lacunas aparecem como texto normal. */
export function htmlCloze(texto, n, lado) {
  return String(texto || "").replace(new RegExp(RE_LACUNA.source, "g"), (_, num, resposta, dica) => {
    if (Number(num) !== n) return resposta;
    if (lado === "frente") return `<span class="fc-lacuna">[${dica ? escapar(dica) : "…"}]</span>`;
    return `<span class="fc-lacuna fc-lacuna--revelada">${resposta}</span>`;
  });
}

/* No editor, a lacuna é um trecho marcado (fundo destacado), não o texto
   {{c1::…}}: o aluno só seleciona e toca em "Esconder". O banco continua
   guardando {{cN::resposta}} (ou {{cN::resposta::dica}}); estas duas funções
   convertem entre um e outro. O HTML vem do próprio editor, em que só a
   lacuna vira <span>. */
const desescapar = (s) => String(s).replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

export function lacunasParaMarcas(html) {
  return String(html || "").replace(new RegExp(RE_LACUNA.source, "g"), (_, n, resposta, dica) =>
    `<span data-lacuna="${Number(n)}"${dica ? ` data-dica="${escapar(dica)}"` : ""}>${resposta}</span>`);
}

const RE_MARCA = /<span\b([^>]*\bdata-lacuna="\d+"[^>]*)>([\s\S]*?)<\/span>/g;
export function marcasParaLacunas(html) {
  return String(html || "").replace(RE_MARCA, (_, atributos, dentro) => {
    const n = /data-lacuna="(\d+)"/.exec(atributos)[1];
    const dica = /data-dica="([^"]*)"/.exec(atributos)?.[1];
    return `{{c${n}::${dentro}${dica ? `::${desescapar(dica)}` : ""}}}`;
  });
}

export const numeroDaLacuna = (ordinal) => Number(String(ordinal).replace(/^c/, ""));
export const idDaForma = (ordinal) => String(ordinal).replace(/^f_/, "");
