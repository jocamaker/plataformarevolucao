/* Arquivos anexados pelo moderador (fotos de redação, vídeos, capas).
   Não cabem no localStorage (~5 MB), então ficam no IndexedDB deste navegador.
   Nos dados guardamos só a referência "idb:<id>"; um endereço http(s) comum
   (ou um asset do build) passa direto.
   🔥 FIREBASE: trocar por Storage — upload devolve uma URL de download, que
   entra no lugar da referência "idb:". */

import { useEffect, useState } from "react";

const BANCO = "aprova-arquivos";
const LOJA = "arquivos";

function abrir() {
  return new Promise((ok, erro) => {
    const req = indexedDB.open(BANCO, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(LOJA);
    req.onsuccess = () => ok(req.result);
    req.onerror = () => erro(req.error);
  });
}

async function operar(modo, fn) {
  const banco = await abrir();
  return new Promise((ok, erro) => {
    const tx = banco.transaction(LOJA, modo);
    const req = fn(tx.objectStore(LOJA));
    tx.oncomplete = () => { banco.close(); ok(req?.result); };
    tx.onerror = tx.onabort = () => { banco.close(); erro(tx.error); };
  });
}

export const ehArquivoLocal = (ref) => typeof ref === "string" && ref.startsWith("idb:");

export async function salvarArquivo(blob) {
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  await operar("readwrite", (loja) => loja.put(blob, id));
  return `idb:${id}`;
}

export const lerArquivo = (ref) => operar("readonly", (loja) => loja.get(ref.slice(4)));

export function apagarArquivo(ref) {
  return ehArquivoLocal(ref) ? operar("readwrite", (loja) => loja.delete(ref.slice(4))).catch(() => {}) : Promise.resolve();
}

export const limparArquivos = () => operar("readwrite", (loja) => loja.clear()).catch(() => {});

/* URL utilizável de uma referência. `faltando`: o arquivo foi anexado em
   outro navegador (ou apagado) e não existe aqui. */
export function useArquivoUrl(ref) {
  const [estado, setEstado] = useState({ url: ehArquivoLocal(ref) ? null : ref || null, carregando: ehArquivoLocal(ref), faltando: false });
  useEffect(() => {
    if (!ehArquivoLocal(ref)) { setEstado({ url: ref || null, carregando: false, faltando: false }); return undefined; }
    let ativo = true;
    let url = null;
    setEstado({ url: null, carregando: true, faltando: false });
    lerArquivo(ref)
      .then((blob) => {
        if (!ativo) return;
        url = blob ? URL.createObjectURL(blob) : null;
        setEstado({ url, carregando: false, faltando: !blob });
      })
      .catch(() => { if (ativo) setEstado({ url: null, carregando: false, faltando: true }); });
    return () => { ativo = false; if (url) URL.revokeObjectURL(url); };
  }, [ref]);
  return estado;
}

/* Foto de celular (3–8 MB) → JPEG de até `lado` px no lado maior (~200–400 KB).
   Mantém a legibilidade da letra e cabe folgado no armazenamento. */
export async function comprimirImagem(arquivo, lado = 1800, qualidade = 0.85) {
  const url = URL.createObjectURL(arquivo);
  try {
    const img = await new Promise((ok, erro) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => erro(new Error("Não foi possível ler a imagem."));
      i.src = url;
    });
    const escala = Math.min(1, lado / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * escala);
    canvas.height = Math.round(img.naturalHeight * escala);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff"; // PNG com transparência não vira fundo preto
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise((ok) => canvas.toBlob((b) => ok(b || arquivo), "image/jpeg", qualidade));
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Duração de um arquivo de vídeo, em segundos (null se não der para ler).
export function lerDuracaoVideo(arquivo) {
  return new Promise((ok) => {
    const url = URL.createObjectURL(arquivo);
    const v = document.createElement("video");
    v.preload = "metadata";
    const fim = (valor) => { URL.revokeObjectURL(url); ok(valor); };
    v.onloadedmetadata = () => fim(Number.isFinite(v.duration) ? v.duration : null);
    v.onerror = () => fim(null);
    v.src = url;
  });
}
