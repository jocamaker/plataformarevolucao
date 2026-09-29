/* Exemplo de oclusão de imagem: um diagrama de célula desenhado na hora
   (sem baixar nada), com os nomes das estruturas escondidos. */

import { salvarNota } from "../servicos/notas.js";
import { criarTopico } from "../servicos/arvore.js";

const L = 1200;
const A = 760;

export async function criarExemploOclusao(repo) {
  const materia = (await repo.listar("materias")).find((m) => m.nome === "Biologia");
  if (!materia || typeof document === "undefined") return 0;
  const topicos = await repo.listar("topicos", { onde: [["materiaId", "==", materia.id]] });
  const topicoId = topicos.find((t) => t.nome === "Citologia")?.id || await criarTopico(repo, { materiaId: materia.id, nome: "Citologia" }, topicos);

  const cv = document.createElement("canvas");
  cv.width = L; cv.height = A;
  const g = cv.getContext("2d");
  g.fillStyle = "#ffffff"; g.fillRect(0, 0, L, A);
  // célula
  g.fillStyle = "#e9f6ef"; g.strokeStyle = "#2f9e6a"; g.lineWidth = 8;
  g.beginPath(); g.ellipse(560, 380, 400, 280, 0, 0, Math.PI * 2); g.fill(); g.stroke();
  // núcleo
  g.fillStyle = "#cfd8ff"; g.strokeStyle = "#4b5bd6"; g.lineWidth = 6;
  g.beginPath(); g.arc(520, 360, 115, 0, Math.PI * 2); g.fill(); g.stroke();
  g.fillStyle = "#7f8ce8"; g.beginPath(); g.arc(545, 345, 35, 0, Math.PI * 2); g.fill();
  // mitocôndrias
  const mito = (x, y, r) => {
    g.save(); g.translate(x, y); g.rotate(r);
    g.fillStyle = "#ffd9c2"; g.strokeStyle = "#e0703a"; g.lineWidth = 5;
    g.beginPath(); g.ellipse(0, 0, 62, 28, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(-40, 0); for (let i = -40; i <= 40; i += 16) g.lineTo(i, i % 32 === 0 ? -14 : 14); g.stroke();
    g.restore();
  };
  mito(780, 470, -0.4); mito(300, 520, 0.5); mito(760, 250, 0.3);
  // ribossomos
  g.fillStyle = "#6b6b7b";
  [[680, 560], [700, 580], [420, 220], [440, 205], [860, 380], [640, 180]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 7, 0, Math.PI * 2); g.fill(); });
  // rótulos com linhas
  g.font = "600 30px Inter, Arial, sans-serif"; g.textBaseline = "middle";
  const rotulos = [
    { texto: "Membrana plasmática", x: 60, y: 60, alvo: [260, 170] },
    { texto: "Núcleo", x: 60, y: 700, alvo: [430, 430] },
    { texto: "Mitocôndria", x: 900, y: 60, alvo: [790, 245] },
    { texto: "Citoplasma", x: 930, y: 700, alvo: [840, 560] },
  ];
  const formas = [];
  for (const r of rotulos) {
    const w = g.measureText(r.texto).width;
    g.strokeStyle = "#9aa0b4"; g.lineWidth = 3;
    g.beginPath(); g.moveTo(r.x + w / 2, r.y + (r.y < A / 2 ? 22 : -22)); g.lineTo(...r.alvo); g.stroke();
    g.fillStyle = "#1c1c28"; g.fillText(r.texto, r.x, r.y);
    formas.push({ id: r.texto.slice(0, 4).toLowerCase().replace(/[^a-z]/g, "") || `f${formas.length}`, tipo: "retangulo", x: (r.x - 12) / L, y: (r.y - 26) / A, w: (w + 24) / L, h: 52 / A, rotulo: r.texto });
  }
  const blob = await new Promise((ok) => cv.toBlob(ok, "image/webp", 0.9));
  const ref = await repo.enviarImagem(blob.type === "image/webp" ? blob : await new Promise((ok) => cv.toBlob(ok, "image/jpeg", 0.9)));
  const config = await repo.obter("config", "config");
  await salvarNota(repo, {
    tipo: "oclusao", materiaId: materia.id, topicoId,
    campos: { imagem: { ref, largura: L, altura: A }, formas, extra: "<p>Célula animal (esquema). Cada nome escondido é um cartão.</p>" },
    tags: ["imagens"],
  }, { tagsConhecidas: config?.tagsConhecidas || [] });
  return formas.length;
}
