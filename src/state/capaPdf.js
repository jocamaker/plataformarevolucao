/* Capa da prova: o alto da primeira página do PDF, desenhado com o pdf.js.

   O pdf.js roda num iframe descartável, nunca na página da plataforma: o
   build "legacy" traz polyfills que trocam funções globais do navegador
   (JSON.stringify, Array.prototype.push, métodos de Iterator e Set…) quando
   o navegador não passa nos testes deles. Dentro do iframe, isso (e as
   fontes e o worker do pdf.js) some junto com ele. Os arquivos só são
   baixados aqui, quando o moderador escolhe o PDF; o aluno recebe a imagem. */

// só os endereços: o código entra no iframe, não no pacote da página
import urlPdfjs from "pdfjs-dist/legacy/build/pdf.min.mjs?url";
import urlTrabalhador from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

const LIMITE_MS = 45000;

export async function capaDoPdf(arquivo, { largura = 960, altura = 0.62 } = {}) {
  const quadro = document.createElement("iframe");
  quadro.setAttribute("aria-hidden", "true");
  quadro.tabIndex = -1;
  quadro.style.cssText = "position:fixed;left:-10000px;top:0;width:10px;height:10px;border:0;visibility:hidden";
  quadro.srcdoc = "<!doctype html><meta charset=utf-8><title>capa</title>";
  const carregado = new Promise((ok) => quadro.addEventListener("load", ok, { once: true }));
  document.body.appendChild(quadro);
  let desistir;
  const limite = new Promise((_, falha) => { desistir = setTimeout(() => falha(new Error("O PDF demorou demais para abrir.")), LIMITE_MS); });
  const trabalho = (async () => {
    const bytes = await arquivo.arrayBuffer();
    await carregado;
    const w = quadro.contentWindow;
    const absoluto = (u) => new URL(u, document.baseURI).href;
    // import() executado no iframe: o módulo e os polyfills dele ficam lá
    const pdfjs = await w.Function("u", "return import(u)")(absoluto(urlPdfjs));
    pdfjs.GlobalWorkerOptions.workerSrc = absoluto(urlTrabalhador);
    // os bytes precisam ser um Uint8Array do próprio iframe (o pdf.js confere o tipo)
    const tarefa = pdfjs.getDocument({ data: new w.Uint8Array(bytes) });
    try {
      const doc = await tarefa.promise;
      const pagina = await doc.getPage(1);
      const base = pagina.getViewport({ scale: 1 });
      const viewport = pagina.getViewport({ scale: largura / base.width });
      const canvas = w.document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      // só o alto da página (a parte de cima da capa do caderno)
      canvas.height = Math.round(Math.min(viewport.height, viewport.width * altura));
      const g = canvas.getContext("2d");
      g.fillStyle = "#ffffff";
      g.fillRect(0, 0, canvas.width, canvas.height);
      await pagina.render({ canvasContext: g, canvas, viewport }).promise;
      const blob = await new Promise((ok, falha) => canvas.toBlob((b) => (b ? ok(b) : falha(new Error("Não foi possível gerar a capa."))), "image/jpeg", 0.86));
      // uma cópia criada aqui: o Blob do iframe não passa no "instanceof Blob" desta página
      return new Blob([blob], { type: "image/jpeg" });
    } finally {
      tarefa.destroy(); // libera o worker e a memória do documento
    }
  })();
  trabalho.catch(() => {}); // se o tempo esgotar, o que sobrar dele não vira erro solto
  try {
    return await Promise.race([limite, trabalho]);
  } finally {
    clearTimeout(desistir);
    quadro.remove(); // leva junto o pdf.js, os polyfills, as fontes e o worker
  }
}
