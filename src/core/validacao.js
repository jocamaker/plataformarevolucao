/* Validações de entrada. Devolvem { ok, erros: { campo: mensagem } }. */

const inteiro = (v) => Number.isInteger(Number(v)) && String(v).trim() !== "";
const dataValida = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || "");

function contagens(r, erros) {
  const total = Number(r.total), acertos = Number(r.acertos), erradas = Number(r.erros);
  if (!inteiro(r.total) || total <= 0) erros.total = "Informe quantas questões foram feitas (número inteiro maior que zero).";
  if (!inteiro(r.acertos) || acertos < 0) erros.acertos = "Acertos precisa ser um número inteiro, zero ou mais.";
  if (!inteiro(r.erros) || erradas < 0) erros.erros = "Erros precisa ser um número inteiro, zero ou mais.";
  if (!erros.total && !erros.acertos && !erros.erros && acertos + erradas > total) {
    erros.erros = `Acertos + erros (${acertos + erradas}) passa do total de questões (${total}).`;
  }
}

export function validarQuestoes(r, hojeIso) {
  const erros = {};
  if (!dataValida(r.data)) erros.data = "Escolha a data.";
  else if (hojeIso && r.data > hojeIso) erros.data = "A data não pode ser no futuro.";
  if (!r.materiaId) erros.materiaId = "Escolha a matéria.";
  if (!r.topicoId) erros.topicoId = "Escolha o tópico.";
  contagens(r, erros);
  return { ok: !Object.keys(erros).length, erros };
}

export function validarSimulado(r, hojeIso) {
  const erros = {};
  if (!r.vestibularId) erros.vestibularId = "Escolha o vestibular.";
  if (!String(r.nome || "").trim()) erros.nome = "Dê um nome ao simulado.";
  if (r.ano && (!inteiro(r.ano) || Number(r.ano) < 1990 || Number(r.ano) > 2100)) erros.ano = "Ano inválido.";
  if (!dataValida(r.data)) erros.data = "Escolha a data.";
  else if (hojeIso && r.data > hojeIso) erros.data = "A data não pode ser no futuro.";
  contagens(r, erros);
  return { ok: !Object.keys(erros).length, erros };
}

export const PDF_MAX_MB = 25;

/* PDF: tipo, extensão, tamanho e assinatura "%PDF" nos primeiros bytes. */
export async function validarPdf(arquivo, maxMb = PDF_MAX_MB) {
  if (!arquivo) return { ok: false, erro: "Escolha um arquivo." };
  const pareceNome = /\.pdf$/i.test(arquivo.name || "");
  const pareceTipo = !arquivo.type || arquivo.type === "application/pdf";
  if (!pareceNome || !pareceTipo) return { ok: false, erro: "O arquivo precisa ser um PDF." };
  if (arquivo.size > maxMb * 1024 * 1024) return { ok: false, erro: `O arquivo tem ${(arquivo.size / 1048576).toFixed(1)} MB; o limite é ${maxMb} MB.` };
  if (arquivo.size === 0) return { ok: false, erro: "O arquivo está vazio." };
  try {
    const cabeca = new Uint8Array(await arquivo.slice(0, 5).arrayBuffer());
    if (String.fromCharCode(...cabeca) !== "%PDF-") return { ok: false, erro: "O conteúdo não é de um PDF válido." };
  } catch { /* sem leitura (ambiente antigo): fica com a checagem de tipo e extensão */ }
  return { ok: true };
}

export const fmtTamanho = (bytes = 0) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
