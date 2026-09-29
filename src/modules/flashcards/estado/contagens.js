/* Quanto há para hoje, no total e por matéria/tópico/tag, como o Anki
   mostra na lista de baralhos: novos (até o que sobra do limite do dia),
   aprendendo e revisões (até o que sobra do limite). */

import { ESTADOS } from "../dados/modelo.js";
import { feitosHoje } from "../motor/fila.js";

const vazio = () => ({ novos: 0, aprendendo: 0, revisao: 0 });

export function contagensDoDia(estado, agora = new Date()) {
  const { pendentes = [], novosPorTopico = {}, novosPorTag = {}, topicos = [], config, dia, fimDoDia } = estado;
  const feitos = feitosHoje(dia);
  const sobraNovos = Math.max(0, config.novosPorDia - feitos.novos);
  const sobraRevisoes = Math.max(0, config.revisoesPorDia - feitos.revisoes);
  const porTopico = {};
  const porMateria = {};
  const porTag = {};
  const total = vazio();
  const somar = (alvo, chave, campo) => { if (!alvo[chave]) alvo[chave] = vazio(); alvo[chave][campo] += 1; };

  for (const c of pendentes || []) {
    if (c.suspenso || (c.enterradoAte && new Date(c.enterradoAte) > agora)) continue;
    const estadoCartao = c.fsrs.state;
    let campo = null;
    if (estadoCartao === ESTADOS.aprendendo || estadoCartao === ESTADOS.reaprendendo) campo = "aprendendo";
    else if (estadoCartao === ESTADOS.revisao && (!fimDoDia || new Date(c.fsrs.due) < fimDoDia)) campo = "revisao";
    if (!campo) continue;
    total[campo] += 1;
    somar(porTopico, c.topicoId, campo);
    somar(porMateria, c.materiaId, campo);
    for (const t of c.tags || []) somar(porTag, t, campo);
  }
  for (const t of topicos || []) {
    const n = novosPorTopico[t.id] || 0;
    if (!porTopico[t.id]) porTopico[t.id] = vazio();
    porTopico[t.id].novos = n;
    if (!porMateria[t.materiaId]) porMateria[t.materiaId] = vazio();
    porMateria[t.materiaId].novos += n;
    total.novos += n;
  }
  for (const [tag, n] of Object.entries(novosPorTag)) {
    if (!porTag[tag]) porTag[tag] = vazio();
    porTag[tag].novos = n;
  }
  // os limites do dia valem para cada recorte e para o total
  const limitar = (c) => ({ ...c, novos: Math.min(c.novos, sobraNovos), revisao: Math.min(c.revisao, sobraRevisoes) });
  const mapa = (m) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, limitar(v)]));
  return { total: limitar(total), porTopico: mapa(porTopico), porMateria: mapa(porMateria), porTag: mapa(porTag), feitos, sobraNovos, sobraRevisoes };
}

export const somaDe = (c) => (c ? c.novos + c.aprendendo + c.revisao : 0);
