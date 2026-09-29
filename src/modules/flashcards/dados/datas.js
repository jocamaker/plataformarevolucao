/* Dias no fuso do aparelho. Nunca toISOString() para "o dia de hoje": ele
   devolve o dia em UTC, que no Brasil vira o dia seguinte a partir das 21h.

   Virada do dia: como no Anki, o "dia de estudo" começa às 4h por padrão;
   quem estuda à 1h da manhã ainda está no dia anterior. */

const dois = (n) => String(n).padStart(2, "0");

// o dia de estudo de um instante
export function diaDeEstudo(instante, virada = 4) {
  const d = new Date(instante.getTime() - virada * 3600000);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// "AAAA-MM-DD" do dia de estudo
export function chaveDia(instante, virada = 4) {
  const d = diaDeEstudo(instante, virada);
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
}

// quando começa o próximo dia de estudo (a virada seguinte)
export function proximaVirada(instante, virada = 4) {
  const d = diaDeEstudo(instante, virada);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, virada);
}

// o instante em que começa o dia de estudo de uma chave "AAAA-MM-DD"
export function inicioDaChave(chave, virada = 4) {
  const [a, m, d] = chave.split("-").map(Number);
  return new Date(a, m - 1, d, virada);
}

// chave de n dias antes/depois
export function somarDias(chave, n) {
  const [a, m, d] = chave.split("-").map(Number);
  const x = new Date(a, m - 1, d + n);
  return `${x.getFullYear()}-${dois(x.getMonth() + 1)}-${dois(x.getDate())}`;
}
