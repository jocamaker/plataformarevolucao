/* Estado do módulo, fora da árvore do React (a plataforma remonta a tela a
   cada troca de endereço; o estado e as assinaturas continuam vivos aqui).
   Uma loja por aluno. Em tempo real: configurações, matérias, tópicos, os
   cartões que vencem até a virada do dia e o resumo do dia. As contagens de
   novos por tópico/tag vêm de consultas de contagem (recontar()). */

import { abrirRepositorio } from "../dados/index.js";
import { chaveDia, proximaVirada } from "../dados/datas.js";
import { FILTRO_NOVOS, normalizarConfig } from "../dados/modelo.js";
import { criarAgendador } from "../motor/agendador.js";
import { desenterrarVencidos } from "../servicos/agenda.js";

function configSegura(doc) {
  try { return normalizarConfig(doc || {}); } catch { return normalizarConfig({}); }
}

function criarLoja(uid) {
  let estado = {
    status: "carregando", uid, modo: null, erro: null,
    config: normalizarConfig({}), tagsConhecidas: [],
    materias: null, topicos: null, pendentes: null, dia: null, chaveDia: null, fimDoDia: null,
    novosPorTopico: {}, novosPorTag: {}, avisoTardio: null,
  };
  const ouvintes = new Set();
  const definir = (patch) => {
    estado = { ...estado, ...patch };
    if (estado.status === "carregando" && estado.materias && estado.topicos && estado.pendentes) estado = { ...estado, status: "pronto" };
    ouvintes.forEach((f) => f());
  };

  let repo = null;
  let agendador = criarAgendador(estado.config);
  const paradas = [];
  let pararDia = () => {};
  let viradaAtual = null;
  let relogio = null;
  let recontagem = null;
  let encerrada = false;

  // cartões pendentes e resumo do dia dependem do "dia de estudo": reassina na virada
  function assinarDia() {
    if (!repo || encerrada) return;
    pararDia();
    const agora = new Date();
    const virada = estado.config.viradaDoDia;
    viradaAtual = virada;
    const fim = proximaVirada(agora, virada);
    const chave = chaveDia(agora, virada);
    const p1 = repo.observar("cartoes", { onde: [["fila", "<=", fim]], ordem: ["fila", "asc"] }, (pendentes) => definir({ pendentes }), (e) => definir({ erro: e }));
    const p2 = repo.observarDoc("dias", chave, (dia) => definir({ dia }), (e) => definir({ erro: e }));
    pararDia = () => { p1(); p2(); };
    definir({ fimDoDia: fim, chaveDia: chave });
    clearTimeout(relogio);
    relogio = setTimeout(() => {
      desenterrarVencidos(repo).catch(() => {});
      assinarDia();
      recontar();
    }, Math.min(fim.getTime() - agora.getTime() + 1000, 2 ** 31 - 1));
  }

  // quantos novos há em cada tópico e em cada tag conhecida
  function recontar() {
    clearTimeout(recontagem);
    recontagem = setTimeout(async () => {
      if (!repo || !estado.topicos) return;
      try {
        const porTopico = {};
        await Promise.all(estado.topicos.map(async (t) => {
          porTopico[t.id] = await repo.contar("cartoes", { onde: [["topicoId", "==", t.id], FILTRO_NOVOS] });
        }));
        const porTag = {};
        await Promise.all(estado.tagsConhecidas.slice(0, 40).map(async (tag) => {
          porTag[tag] = await repo.contar("cartoes", { onde: [["tags", "array-contains", tag], FILTRO_NOVOS] });
        }));
        definir({ novosPorTopico: porTopico, novosPorTag: porTag });
      } catch (e) {
        definir({ erro: e });
      }
    }, 250);
  }

  async function iniciar() {
    try {
      repo = await abrirRepositorio({ uid, aoErroTardio: (e) => definir({ avisoTardio: e.message }) });
      if (encerrada) return;
      definir({ modo: repo.modo });
      desenterrarVencidos(repo).then((r) => { if (r.length) recontar(); }).catch(() => {});
      paradas.push(repo.observarDoc("config", "config", (doc) => {
        const config = configSegura(doc);
        agendador = criarAgendador(config);
        const tags = doc?.tagsConhecidas || [];
        const mudouTags = tags.join("\u0000") !== estado.tagsConhecidas.join("\u0000");
        definir({ config, tagsConhecidas: tags });
        if (config.viradaDoDia !== viradaAtual) assinarDia();
        if (mudouTags) recontar();
      }, (e) => definir({ erro: e })));
      paradas.push(repo.observar("materias", { ordem: ["ordem", "asc"] }, (materias) => definir({ materias }), (e) => definir({ erro: e })));
      paradas.push(repo.observar("topicos", { ordem: ["ordem", "asc"] }, (topicos) => { definir({ topicos }); recontar(); }, (e) => definir({ erro: e })));
      assinarDia();
    } catch (e) {
      definir({ status: "erro", erro: e });
    }
  }

  return {
    obter: () => estado,
    assinar(f) { ouvintes.add(f); return () => ouvintes.delete(f); },
    get repo() { return repo; },
    get agendador() { return agendador; },
    recontar,
    limparAviso: () => definir({ avisoTardio: null, erro: null }),
    iniciar,
    encerrar() {
      encerrada = true;
      paradas.forEach((p) => p());
      pararDia();
      clearTimeout(relogio);
      clearTimeout(recontagem);
      ouvintes.clear();
    },
  };
}

let atual = null;
export function lojaDo(uid) {
  if (atual?.uid === uid) return atual.loja;
  atual?.loja.encerrar();
  const loja = criarLoja(uid);
  atual = { uid, loja };
  loja.iniciar();
  return loja;
}
