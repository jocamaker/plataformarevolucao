/* Datas locais (YYYY-MM-DD) sem passar por UTC.
   toISOString converte para UTC e, no Brasil, depois das 21h já devolve o dia
   seguinte; por isso tudo aqui monta a data a partir dos campos locais. */

import { isoLocal } from "./nucleo.js";

export { isoLocal };

// "2026-09-27" → Date ao meio-dia local (meio-dia evita pulos de horário de verão)
export function dataDe(iso) {
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d, 12);
}

export const hoje = (agora = new Date()) => isoLocal(agora);

export function somarDias(iso, dias) {
  const d = dataDe(iso);
  d.setDate(d.getDate() + dias);
  return isoLocal(d);
}

// dias de a até b (b − a), inteiro
export function diasEntre(a, b) {
  return Math.round((dataDe(b) - dataDe(a)) / 86400000);
}

export const inicioDoMes = (iso) => `${String(iso).slice(0, 7)}-01`;

export function fimDoMes(iso) {
  const d = dataDe(inicioDoMes(iso));
  d.setMonth(d.getMonth() + 1, 0);
  return isoLocal(d);
}

// segunda-feira da semana de iso
export function inicioDaSemana(iso) {
  const d = dataDe(iso);
  const dow = d.getDay();
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  return isoLocal(d);
}

// lista de datas de a até b, inclusive
export function intervalo(a, b) {
  const out = [];
  for (let d = a; d <= b; d = somarDias(d, 1)) out.push(d);
  return out;
}

export const noIntervalo = (iso, inicio, fim) => (!inicio || iso >= inicio) && (!fim || iso <= fim);

// Períodos prontos dos filtros. `hojeIso` explícito para testar.
export const PERIODOS = [
  { id: "hoje", nome: "Hoje" },
  { id: "7d", nome: "Últimos 7 dias" },
  { id: "30d", nome: "Últimos 30 dias" },
  { id: "mes", nome: "Mês atual" },
  { id: "tudo", nome: "Tudo" },
  { id: "personalizado", nome: "Personalizado" },
];

export function datasDoPeriodo(id, hojeIso = hoje()) {
  switch (id) {
    case "hoje": return { inicio: hojeIso, fim: hojeIso };
    case "7d": return { inicio: somarDias(hojeIso, -6), fim: hojeIso };
    case "30d": return { inicio: somarDias(hojeIso, -29), fim: hojeIso };
    case "mes": return { inicio: inicioDoMes(hojeIso), fim: hojeIso };
    default: return { inicio: null, fim: null };
  }
}

// ISO de data e hora local: "2026-09-27T21:30"
export function agoraLocal(agora = new Date()) {
  const dois = (n) => String(n).padStart(2, "0");
  return `${isoLocal(agora)}T${dois(agora.getHours())}:${dois(agora.getMinutes())}`;
}

export const fmtDataCurta = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "");
export const fmtDataLonga = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "");

export function fmtDataHora(isoDataHora) {
  if (!isoDataHora) return "";
  const [data, hora = ""] = isoDataHora.split("T");
  return `${fmtDataLonga(data)}${hora ? ` às ${hora.slice(0, 5)}` : ""}`;
}
