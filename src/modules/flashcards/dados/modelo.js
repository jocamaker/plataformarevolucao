/* Modelo de dados dos flashcards: normalização e validação de cada
   documento, geração dos cartões a partir das notas e os campos de fila.

   Nota × cartão (como no Anki): a nota é o texto-fonte; dela saem os
   cartões de revisão. Básico → 1 cartão. Cloze → um por lacuna (c1, c2…).
   Oclusão de imagem → um por forma desenhada. Cada cartão tem o próprio
   estado FSRS; editar a nota mantém o progresso dos cartões que continuam.

   Fila (para a consulta "pendentes hoje" usar só índices de um campo):
     fila       data em que o cartão (já estudado) volta; null se novo ou suspenso
     ordemNovo  posição na fila de novos; null se já estudado, suspenso,
                enterrado ou adiado
   Enterrado/adiado (enterradoAte): o estudado volta na fila só a partir
   dessa data; o novo sai da fila de novos até lá (desenterrarVencidos
   devolve os que já passaram da data). */

import { createEmptyCard } from "ts-fsrs";
import { ErroFlashcards } from "./contrato.js";

export const TIPOS = Object.freeze(["basico", "cloze", "oclusao"]);

// os mesmos números do ts-fsrs (State)
export const ESTADOS = Object.freeze({ novo: 0, aprendendo: 1, revisao: 2, reaprendendo: 3 });

export const LIMITES = Object.freeze({
  nome: 80, // matéria e tópico
  campoHtml: 100000, // cada campo de texto formatado (o Firestore aceita 1 MB por documento)
  tags: 30,
  tag: 40,
  formas: 100,
});

/* ---------- configurações do aluno ---------- */

export const CONFIG_PADRAO = Object.freeze({
  retencao: 0.9, // retenção-alvo (probabilidade de lembrar na hora da revisão)
  intervaloMaximo: 90, // dias: cada cartão volta pelo menos a cada 3 meses (ajustável)
  novosPorDia: 20,
  revisoesPorDia: 200,
  passosAprendizado: ["1m", "10m"],
  passosReaprendizado: ["10m"],
  viradaDoDia: 4, // hora em que começa o novo dia de estudo
});

const PASSO = /^\d{1,4}(m|h|d)$/;

export function normalizarConfig(dados = {}) {
  const c = { ...CONFIG_PADRAO, ...dados };
  const erros = {};
  const num = (v) => (typeof v === "string" && v.trim() !== "" ? Number(v) : v);
  const r = {
    retencao: num(c.retencao),
    intervaloMaximo: num(c.intervaloMaximo),
    novosPorDia: num(c.novosPorDia),
    revisoesPorDia: num(c.revisoesPorDia),
    passosAprendizado: [...(c.passosAprendizado || [])].map((p) => String(p).trim()),
    passosReaprendizado: [...(c.passosReaprendizado || [])].map((p) => String(p).trim()),
    viradaDoDia: num(c.viradaDoDia),
  };
  if (!(typeof r.retencao === "number" && r.retencao >= 0.7 && r.retencao <= 0.99)) erros.retencao = "A retenção-alvo vai de 70% a 99%.";
  if (!(Number.isInteger(r.intervaloMaximo) && r.intervaloMaximo >= 1 && r.intervaloMaximo <= 36500)) erros.intervaloMaximo = "O intervalo máximo vai de 1 a 36.500 dias.";
  if (!(Number.isInteger(r.novosPorDia) && r.novosPorDia >= 0 && r.novosPorDia <= 9999)) erros.novosPorDia = "De 0 a 9.999 cartões novos por dia.";
  if (!(Number.isInteger(r.revisoesPorDia) && r.revisoesPorDia >= 0 && r.revisoesPorDia <= 99999)) erros.revisoesPorDia = "De 0 a 99.999 revisões por dia.";
  if (r.passosAprendizado.length > 10 || !r.passosAprendizado.every((p) => PASSO.test(p))) erros.passosAprendizado = "Passos como 1m, 10m, 1h ou 1d (até 10).";
  if (r.passosReaprendizado.length > 10 || !r.passosReaprendizado.every((p) => PASSO.test(p))) erros.passosReaprendizado = "Passos como 10m, 1h ou 1d (até 10).";
  if (!(Number.isInteger(r.viradaDoDia) && r.viradaDoDia >= 0 && r.viradaDoDia <= 23)) erros.viradaDoDia = "A virada do dia é uma hora de 0 a 23.";
  if (Object.keys(erros).length) throw new ErroFlashcards("Configuração inválida.", { codigo: "validacao", campos: erros });
  return r;
}

/* ---------- matérias, tópicos e tags ---------- */

const limpar = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

function nomeValido(nome, rotulo) {
  const n = limpar(nome);
  if (!n) throw new ErroFlashcards(`Dê um nome ${rotulo}.`, { codigo: "validacao", campos: { nome: `Dê um nome ${rotulo}.` } });
  if (n.length > LIMITES.nome) throw new ErroFlashcards(`Nome longo demais (até ${LIMITES.nome} caracteres).`, { codigo: "validacao", campos: { nome: `Até ${LIMITES.nome} caracteres.` } });
  return n;
}

const ordemValida = (o) => (Number.isFinite(Number(o)) ? Number(o) : 0);

export function normalizarMateria(d) {
  return { nome: nomeValido(d.nome, "à matéria"), ordem: ordemValida(d.ordem) };
}

export function normalizarTopico(d) {
  if (!d.materiaId) throw new ErroFlashcards("Escolha a matéria do tópico.", { codigo: "validacao", campos: { materiaId: "Escolha a matéria." } });
  return { materiaId: String(d.materiaId), nome: nomeValido(d.nome, "ao tópico"), ordem: ordemValida(d.ordem) };
}

// tags livres: sem repetir (maiúsculas e minúsculas contam como a mesma), sem espaços sobrando
export function normalizarTags(tags = []) {
  const vistas = new Set();
  const r = [];
  for (const t of Array.isArray(tags) ? tags : String(tags).split(",")) {
    const tag = limpar(t).slice(0, LIMITES.tag);
    const chave = tag.toLocaleLowerCase("pt-BR");
    if (tag && !vistas.has(chave)) { vistas.add(chave); r.push(tag); }
  }
  if (r.length > LIMITES.tags) throw new ErroFlashcards(`Até ${LIMITES.tags} tags por cartão.`, { codigo: "validacao", campos: { tags: `Até ${LIMITES.tags} tags.` } });
  return r;
}

/* ---------- cloze ---------- */

// {{c1::resposta}} ou {{c1::resposta::dica}}
export const RE_LACUNA = /\{\{c(\d{1,3})::([\s\S]*?)(?:::([\s\S]*?))?\}\}/g;

// os números das lacunas de um texto, em ordem, sem repetir
export function lacunasDoTexto(texto) {
  const nums = new Set();
  for (const m of String(texto || "").matchAll(RE_LACUNA)) {
    const n = Number(m[1]);
    if (n >= 1) nums.add(n);
  }
  return [...nums].sort((a, b) => a - b);
}

/* ---------- notas ---------- */

// texto visível de um HTML (para saber se um campo está vazio de verdade)
export const textoDoHtml = (html) => String(html || "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
const temConteudo = (html) => textoDoHtml(html) !== "" || /<img\b/i.test(String(html || ""));

// referências de imagens embutidas nos campos: <img data-fc-img="ref">
const RE_IMG = /data-fc-img="([^"]+)"/g;
const refsDoHtml = (html) => [...String(html || "").matchAll(RE_IMG)].map((m) => m[1]);

function campoHtml(v, nome, erros) {
  const s = String(v ?? "");
  if (s.length > LIMITES.campoHtml) erros[nome] = "Texto longo demais para um cartão.";
  return s;
}

const numero01 = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;

function normalizarForma(f, i, erros) {
  const forma = {
    id: String(f?.id || `f${i + 1}`).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 24) || `f${i + 1}`,
    tipo: f?.tipo === "elipse" ? "elipse" : "retangulo",
    x: Number(f?.x), y: Number(f?.y), w: Number(f?.w), h: Number(f?.h),
    rotulo: limpar(f?.rotulo).slice(0, 80),
  };
  const ok = [forma.x, forma.y, forma.w, forma.h].every(numero01) && forma.w > 0 && forma.h > 0 && forma.x + forma.w <= 1.0001 && forma.y + forma.h <= 1.0001;
  if (!ok) erros.formas = "Há uma forma fora da imagem.";
  return forma;
}

/* Valida a nota. materiaId e topicoId dizem onde ela mora; o dono é o aluno
   da árvore em que ela é gravada (não vai no documento). */
export function normalizarNota(d) {
  const erros = {};
  const tipo = d.tipo;
  if (!TIPOS.includes(tipo)) throw new ErroFlashcards("Tipo de cartão desconhecido.", { codigo: "validacao", campos: { tipo: "Escolha o tipo." } });
  if (!d.materiaId || !d.topicoId) erros.topicoId = "Escolha a matéria e o tópico.";
  const c = d.campos || {};
  let campos;
  if (tipo === "basico") {
    campos = { frente: campoHtml(c.frente, "frente", erros), verso: campoHtml(c.verso, "verso", erros) };
    if (!temConteudo(campos.frente)) erros.frente = "Escreva a frente do cartão.";
    if (!temConteudo(campos.verso)) erros.verso = "Escreva o verso do cartão.";
  } else if (tipo === "cloze") {
    campos = { texto: campoHtml(c.texto, "texto", erros), extra: campoHtml(c.extra, "extra", erros) };
    if (!lacunasDoTexto(campos.texto).length) erros.texto = "Marque ao menos uma lacuna, como {{c1::resposta}}.";
  } else {
    const img = c.imagem || {};
    const formas = Array.isArray(c.formas) ? c.formas : [];
    campos = {
      imagem: { ref: String(img.ref || ""), largura: Number(img.largura) || 0, altura: Number(img.altura) || 0 },
      formas: formas.map((f, i) => normalizarForma(f, i, erros)),
      extra: campoHtml(c.extra, "extra", erros),
    };
    if (!campos.imagem.ref) erros.imagem = "Envie a imagem.";
    if (!campos.formas.length) erros.formas = "Desenhe ao menos uma forma sobre a imagem.";
    if (campos.formas.length > LIMITES.formas) erros.formas = `Até ${LIMITES.formas} formas por imagem.`;
    if (new Set(campos.formas.map((f) => f.id)).size !== campos.formas.length) erros.formas = "Há formas repetidas.";
  }
  let tags = [];
  try { tags = normalizarTags(d.tags); } catch (e) { Object.assign(erros, e.campos); }
  if (Object.keys(erros).length) throw new ErroFlashcards("Confira o cartão.", { codigo: "validacao", campos: erros });
  const imagens = [...new Set([
    ...Object.values(campos).flatMap((v) => (typeof v === "string" ? refsDoHtml(v) : [])),
    ...(tipo === "oclusao" ? [campos.imagem.ref] : []),
  ])];
  return { tipo, materiaId: String(d.materiaId), topicoId: String(d.topicoId), campos, tags, imagens };
}

// os cartões que uma nota gera ("1"; "c1", "c2"…; "f_<id da forma>")
export function ordinaisDaNota(nota) {
  if (nota.tipo === "basico") return ["1"];
  if (nota.tipo === "cloze") return lacunasDoTexto(nota.campos.texto).map((n) => `c${n}`);
  return nota.campos.formas.map((f) => `f_${f.id}`);
}

export const idCartao = (notaId, ordinal) => `${notaId}__${ordinal}`;

// filtro "está na fila de novos" (adiantar para hoje usa posições negativas)
export const FILTRO_NOVOS = Object.freeze(["ordemNovo", ">=", -Number.MAX_SAFE_INTEGER]);

/* ---------- cartões ---------- */

// estado FSRS do ts-fsrs → documento (sem undefined; datas como Date)
export function fsrsParaDoc(card) {
  return {
    due: new Date(card.due),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps ?? 0,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.last_review ? new Date(card.last_review) : null,
  };
}

// documento → estado FSRS para o ts-fsrs
export function fsrsDoDoc(f) {
  return {
    due: new Date(f.due),
    stability: f.stability,
    difficulty: f.difficulty,
    elapsed_days: f.elapsed_days,
    scheduled_days: f.scheduled_days,
    learning_steps: f.learning_steps ?? 0,
    reps: f.reps,
    lapses: f.lapses,
    state: f.state,
    ...(f.last_review ? { last_review: new Date(f.last_review) } : {}),
  };
}

// recalcula fila e ordemNovo a partir do estado (o único lugar que decide isso)
export function comFila(cartao) {
  const novo = cartao.fsrs.state === ESTADOS.novo;
  let fila = null;
  let ordemNovo = null;
  if (!cartao.suspenso) {
    if (novo) ordemNovo = cartao.enterradoAte ? null : cartao.posicaoNovo;
    else {
      const due = new Date(cartao.fsrs.due);
      const enterrado = cartao.enterradoAte ? new Date(cartao.enterradoAte) : null;
      fila = enterrado && enterrado > due ? enterrado : due;
    }
  }
  return { ...cartao, fila, ordemNovo };
}

export function cartaoNovo({ nota, notaId, ordinal, agora, posicaoNovo }) {
  return comFila({
    notaId,
    ordinal,
    tipo: nota.tipo,
    materiaId: nota.materiaId,
    topicoId: nota.topicoId,
    tags: [...nota.tags],
    fsrs: fsrsParaDoc(createEmptyCard(agora)),
    suspenso: false,
    enterradoAte: null,
    posicaoNovo,
    criadoEm: agora,
    atualizadoEm: agora,
  });
}

/* O que muda nos cartões quando a nota é criada ou editada:
   cartões novos para ordinais novos, os que continuam só recebem o lugar e
   as tags da nota (o progresso fica), os que sumiram saem. */
export function sincronizarCartoes({ nota, notaId, cartoesAtuais = [], agora, proximaPosicao }) {
  const desejados = ordinaisDaNota(nota);
  const atuais = new Map(cartoesAtuais.map((c) => [c.ordinal, c]));
  const criar = [];
  const atualizar = [];
  let posicao = proximaPosicao;
  for (const ordinal of desejados) {
    const atual = atuais.get(ordinal);
    if (!atual) {
      criar.push({ id: idCartao(notaId, ordinal), dados: cartaoNovo({ nota, notaId, ordinal, agora, posicaoNovo: posicao }) });
      posicao += 1;
    } else if (atual.materiaId !== nota.materiaId || atual.topicoId !== nota.topicoId || !mesmasTags(atual.tags, nota.tags)) {
      atualizar.push({ id: idCartao(notaId, ordinal), dados: { materiaId: nota.materiaId, topicoId: nota.topicoId, tags: [...nota.tags], atualizadoEm: agora } });
    }
  }
  const remover = cartoesAtuais.filter((c) => !desejados.includes(c.ordinal)).map((c) => idCartao(notaId, c.ordinal));
  return { criar, atualizar, remover, proximaPosicao: posicao };
}

const mesmasTags = (a = [], b = []) => a.length === b.length && a.every((t, i) => t === b[i]);
