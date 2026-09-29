/* Consultas e alterações em documentos na memória, com a semântica do
   Firestore (para o adaptador de demonstração se comportar igual ao real). */

import { APAGAR, ErroFlashcards, OPERADORES } from "./contrato.js";

const ehData = (v) => v instanceof Date;
const ehObjeto = (v) => v !== null && typeof v === "object" && !Array.isArray(v) && !ehData(v);

export function valorDoCampo(doc, caminho) {
  return caminho.split(".").reduce((v, parte) => (ehObjeto(v) ? v[parte] : undefined), doc);
}

// tipos comparáveis: filtro de intervalo só casa valores do mesmo tipo
function tipo(v) {
  if (v === null || v === undefined) return "nulo";
  if (ehData(v)) return "data";
  return typeof v;
}

function comparar(a, b) {
  const x = ehData(a) ? a.getTime() : a;
  const y = ehData(b) ? b.getTime() : b;
  if (x < y) return -1;
  if (x > y) return 1;
  return 0;
}

function iguais(a, b) {
  if (ehData(a) && ehData(b)) return a.getTime() === b.getTime();
  return a === b;
}

function passaFiltro(doc, [campo, op, valor]) {
  if (!OPERADORES.includes(op)) throw new ErroFlashcards(`Operador não suportado: ${op}`, { codigo: "consulta" });
  const v = valorDoCampo(doc, campo);
  if (op === "==") return valor === null ? v === null : v !== undefined && iguais(v, valor);
  if (op === "array-contains") return Array.isArray(v) && v.some((x) => iguais(x, valor));
  if (tipo(v) !== tipo(valor) || tipo(v) === "nulo") return false;
  const c = comparar(v, valor);
  return (op === "<" && c < 0) || (op === "<=" && c <= 0) || (op === ">" && c > 0) || (op === ">=" && c >= 0);
}

export function ordensDaConsulta(ordem) {
  if (!ordem) return [];
  return Array.isArray(ordem[0]) ? ordem : [ordem];
}

export function aplicarConsulta(docs, { onde = [], ordem = null, limite = null } = {}) {
  let r = docs.filter((d) => onde.every((f) => passaFiltro(d, f)));
  const ordens = ordensDaConsulta(ordem);
  if (ordens.length) {
    // como no Firestore: quem não tem o campo da ordenação fica de fora
    r = r.filter((d) => ordens.every(([campo]) => valorDoCampo(d, campo) !== undefined));
    r.sort((a, b) => {
      for (const [campo, dir = "asc"] of ordens) {
        const c = comparar(valorDoCampo(a, campo), valorDoCampo(b, campo));
        if (c) return dir === "desc" ? -c : c;
      }
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
  } else {
    r.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }
  return limite != null ? r.slice(0, limite) : r;
}

/* ---------- escrita ---------- */

// cópia sem APAGAR nem undefined (um documento gravado com "definir")
export function limparDados(v) {
  if (Array.isArray(v)) return v.map(limparDados);
  if (!ehObjeto(v)) return v;
  const r = {};
  for (const [k, x] of Object.entries(v)) if (x !== APAGAR && x !== undefined) r[k] = limparDados(x);
  return r;
}

// "mesclar": mapas se juntam em profundidade; listas e datas são trocadas
export function mesclarProfundo(atual, novo) {
  const r = ehObjeto(atual) ? { ...atual } : {};
  for (const [k, v] of Object.entries(novo)) {
    if (v === APAGAR) delete r[k];
    else if (v === undefined) continue;
    else if (ehObjeto(v)) r[k] = mesclarProfundo(r[k], v);
    else r[k] = limparDados(v);
  }
  return r;
}

// "atualizar": chaves podem ser caminhos com ponto ("revisoes.abc")
export function aplicarAtualizacao(atual, patch) {
  const r = structuredClone(atual);
  for (const [caminho, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    const partes = caminho.split(".");
    let alvo = r;
    for (const p of partes.slice(0, -1)) {
      if (!ehObjeto(alvo[p])) alvo[p] = {};
      alvo = alvo[p];
    }
    const ultima = partes[partes.length - 1];
    if (v === APAGAR) delete alvo[ultima];
    else alvo[ultima] = limparDados(v);
  }
  return r;
}
