/* Imagens dos cartões: comprimidas antes de salvar (o banco guarda só a
   referência; o arquivo vai para o armazenamento). Foto de celular de 4 MB
   vira ~150–400 KB em WebP (JPEG onde o navegador não gera WebP). */

export const IMAGEM_MAX_ENTRADA_MB = 25;
const LIMITE_SAIDA = 2.8 * 1024 * 1024; // as regras aceitam até 3 MB

async function decodificar(arquivo) {
  if (typeof createImageBitmap === "function") {
    try { return await createImageBitmap(arquivo, { imageOrientation: "from-image" }); } catch { /* cai no <img> */ }
  }
  const url = URL.createObjectURL(arquivo);
  try {
    return await new Promise((ok, falha) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => falha(new Error("Não foi possível ler esta imagem."));
      i.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

const paraBlob = (canvas, tipo, q) => new Promise((ok) => canvas.toBlob(ok, tipo, q));

/* → { blob, largura, altura } */
export async function comprimirImagem(arquivo, { lado = 1600, qualidade = 0.82 } = {}) {
  if (!arquivo?.type?.startsWith("image/")) throw new Error("Escolha um arquivo de imagem (JPG, PNG, WebP…).");
  if (arquivo.size > IMAGEM_MAX_ENTRADA_MB * 1024 * 1024) throw new Error(`Imagem grande demais (até ${IMAGEM_MAX_ENTRADA_MB} MB).`);
  const img = await decodificar(arquivo);
  const w0 = img.width || img.naturalWidth;
  const h0 = img.height || img.naturalHeight;
  let escala = Math.min(1, lado / Math.max(w0, h0));
  let q = qualidade;
  for (let tentativa = 0; tentativa < 6; tentativa += 1) {
    const largura = Math.max(1, Math.round(w0 * escala));
    const altura = Math.max(1, Math.round(h0 * escala));
    const canvas = document.createElement("canvas");
    canvas.width = largura;
    canvas.height = altura;
    const g = canvas.getContext("2d");
    g.fillStyle = "#ffffff"; // PNG transparente não fica preto no JPEG
    g.fillRect(0, 0, largura, altura);
    g.drawImage(img, 0, 0, largura, altura);
    let blob = await paraBlob(canvas, "image/webp", q);
    if (!blob || blob.type !== "image/webp") blob = await paraBlob(canvas, "image/jpeg", q);
    if (blob && blob.size <= LIMITE_SAIDA) {
      img.close?.();
      return { blob, largura, altura };
    }
    escala *= 0.8;
    q = Math.max(0.6, q - 0.06);
  }
  img.close?.();
  throw new Error("Não foi possível reduzir a imagem para menos de 3 MB.");
}
