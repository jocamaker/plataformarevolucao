/* Plano de estudos: modelo (plano geral) → plano individual → itens.

   Modelo (plano geral, do moderador) e plano individual têm a mesma forma:
     materias: [{ materiaId, minutosSemanais, maxSessao, prioridade, ritmo,
                  topicos: [{ topicoId, cargaMin?, subtopicos: [{ subtopicoId, cargaMin? }] }] }]
   A ordem dos arrays é a sequência recomendada. O plano individual é uma
   CÓPIA editável do modelo (com modeloId/modeloVersao para rastrear a origem):
   mudar o plano de um aluno não mexe no modelo nem nos outros alunos.

   Item = unidade de estudo do plano: o TÓPICO. Os subtópicos são orientação
   de estudo dentro dele (ordem e seleção ficam no plano, mas não viram metas
   separadas). Duração efetiva = carga ÷ (ritmo do plano × ritmo da matéria).
   Matéria com ativa: false fica no plano (com o histórico) mas não aparece
   nas metas nem no cronograma. O progresso fica fora do plano (por item), e o
   histórico de estudo fica nas sessões: alterar o plano nunca apaga o que já
   foi feito. */

import { DIAS, DISP_PADRAO, dataParaDiaSemana } from "./nucleo.js";
import { diasEntre, somarDias } from "./datas.js";

export const RITMOS = [
  { id: "lenta", nome: "Lenta", multiplicador: 0.8 },
  { id: "normal", nome: "Normal", multiplicador: 1 },
  { id: "acelerada", nome: "Acelerada", multiplicador: 1.25 },
  { id: "expressa", nome: "Expressa", multiplicador: 1.5 },
];
export const nomeRitmo = (mult = 1) => RITMOS.find((r) => Math.abs(r.multiplicador - mult) < 0.001)?.nome || `${String(mult).replace(".", ",")}×`;

export const PRIORIDADES = [{ id: 1, nome: "Alta" }, { id: 2, nome: "Média" }, { id: 3, nome: "Baixa" }];

export const PERMISSOES_ALUNO = [
  { id: "concluirItens", nome: "Marcar conteúdos como concluídos e reabrir" },
  { id: "reordenar", nome: "Mudar a ordem dos tópicos dentro de cada matéria" },
  { id: "disponibilidade", nome: "Ajustar as horas livres de cada dia" },
  { id: "ritmo", nome: "Mudar o ritmo do plano" },
  { id: "recalcular", nome: "Recalcular o plano" },
];
// autonomia por padrão; o moderador restringe o que quiser
export const PERMISSOES_PADRAO = Object.fromEntries(PERMISSOES_ALUNO.map((p) => [p.id, true]));

export const MODALIDADES = [
  { id: "extensivo", nome: "Extensivo" },
  { id: "semiextensivo", nome: "Semiextensivo" },
  { id: "intensivo", nome: "Intensivo" },
  { id: "revisao", nome: "Revisão final" },
];

export const REVISAO_PADRAO = { intervalos: [7, 15, 30], duracaoMin: 20 };
export const CARGA_PADRAO = 60;

export const STATUS_ITEM = {
  nao_iniciado: "Não iniciado",
  em_andamento: "Em andamento",
  concluido: "Concluído",
  atrasado: "Atrasado",
};

export const idItem = (topicoId, subtopicoId) => subtopicoId || `t:${topicoId}`;
const arred5 = (n) => Math.ceil(n / 5) * 5;

/* ---------- Leitura ---------- */

/* Ordem dos tópicos de uma matéria. No edital do aluno, a ordem fica à parte
   (ordemTopicos: só ids), para o aluno poder mudá-la sem poder mexer no resto
   do edital (incidência, matérias visíveis), que é do moderador. Tópico fora
   da lista vem depois, na ordem do edital. */
export function topicosEmOrdem(plano, m) {
  const lista = m?.topicos || [];
  const ordem = plano?.ordemTopicos?.[m?.materiaId];
  if (!Array.isArray(ordem) || !ordem.length) return lista;
  const pos = new Map(ordem.map((id, i) => [id, i]));
  return lista
    .map((t, i) => ({ t, k: pos.has(t.topicoId) ? pos.get(t.topicoId) : ordem.length + i }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.t);
}

export function itensDoPlano(plano, ind) {
  const itens = [];
  (plano?.materias || []).forEach((m, posMateria) => {
    if (!ind.materia(m.materiaId) || m.ativa === false) return;
    const fator = (plano.ritmo || 1) * (m.ritmo || 1);
    topicosEmOrdem(plano, m).forEach((t, posTopico) => {
      const topico = ind.topico(t.topicoId);
      if (!topico) return;
      const carga = t.cargaMin ?? topico.cargaMin ?? CARGA_PADRAO;
      itens.push({
        materiaId: m.materiaId, topicoId: t.topicoId, subtopicoId: null, itemId: idItem(t.topicoId),
        prioridade: m.prioridade ?? 2, posMateria, posTopico, posSub: 0, carga, duracao: Math.max(5, Math.round(carga / fator)),
        subtopicos: (t.subtopicos || []).map((x) => x.subtopicoId).filter((id) => ind.subtopico(id)),
      });
    });
  });
  return itens;
}

// progresso: { [itemId]: { minutos, concluido: true | false | undefined, concluidoEm } }
// concluido undefined = automático (tempo cumprido); false = reaberto; true = marcado
export function estadoItem(item, progresso = {}) {
  const p = progresso[item.itemId] || {};
  const minutos = p.minutos || 0;
  const concluido = p.concluido === true || (p.concluido !== false && minutos >= item.duracao);
  return { minutos, concluido, restante: concluido ? 0 : Math.max(0, item.duracao - minutos), concluidoEm: concluido ? p.concluidoEm || null : null };
}

export function statusItem(item, progresso, cronograma, hojeIso) {
  const e = estadoItem(item, progresso);
  if (e.concluido) return "concluido";
  const fim = cronograma?.[item.itemId]?.fim;
  if (fim && fim < hojeIso) return "atrasado";
  return e.minutos > 0 ? "em_andamento" : "nao_iniciado";
}

// Próximo conteúdo de uma matéria (para as metas da semana).
export function conteudoDaVez(itens, progresso, materiaId, ind) {
  const it = itens.find((x) => x.materiaId === materiaId && !estadoItem(x, progresso).concluido);
  if (!it) return null;
  return {
    itemId: it.itemId, topicoId: it.topicoId, topico: ind.nomeTopico(it.topicoId),
    subtopicoId: it.subtopicoId, subtopico: it.subtopicoId ? ind.nomeSubtopico(it.subtopicoId) : "",
  };
}

// Distribui os minutos de uma sessão pelos itens pendentes da matéria, em ordem.
export function distribuirMinutos(itens, progresso, materiaId, minutos) {
  const partes = [];
  let resta = minutos;
  const pendentes = itens.filter((x) => x.materiaId === materiaId && !estadoItem(x, progresso).concluido);
  for (const it of pendentes) {
    if (resta <= 0) break;
    const usa = Math.min(resta, estadoItem(it, progresso).restante || resta);
    partes.push({ itemId: it.itemId, minutos: usa });
    resta -= usa;
  }
  if (resta > 0 && partes.length) partes[partes.length - 1].minutos += resta;
  return partes;
}

export const capacidadeSemanal = (disp) => DIAS.reduce((s, d) => s + (Number(disp?.[d.k]) || 0), 0);

/* ---------- Alocação semanal e cronograma ---------- */

/* Minutos por semana de cada matéria. Com data-alvo, cada matéria recebe ao
   menos o necessário para terminar a tempo; se não couber na disponibilidade,
   a prioridade decide: as de prioridade alta são atendidas primeiro. */
export function calcularAlocacao(plano, itens, progresso, hojeIso) {
  const capacidade = capacidadeSemanal(plano.disponibilidade);
  const restante = {};
  itens.forEach((it) => { restante[it.materiaId] = (restante[it.materiaId] || 0) + estadoItem(it, progresso).restante; });
  const semanasRestantes = plano.dataAlvo ? Math.max(1, diasEntre(hojeIso, plano.dataAlvo) / 7) : null;

  const pedidos = (plano.materias || []).filter((m) => m.ativa !== false).map((m, i) => {
    const falta = restante[m.materiaId] || 0;
    const necessario = semanasRestantes && falta ? arred5(falta / semanasRestantes) : 0;
    return { m, i, falta, necessario, quer: falta > 0 ? Math.max(m.minutosSemanais || 0, necessario) : 0 };
  });

  const alocacao = {};
  let livre = capacidade;
  [1, 2, 3].forEach((prio) => {
    const grupo = pedidos.filter((p) => (p.m.prioridade ?? 2) === prio);
    const soma = grupo.reduce((s, p) => s + p.quer, 0);
    const escala = soma > livre ? livre / soma : 1;
    grupo.forEach((p) => { alocacao[p.m.materiaId] = Math.floor((p.quer * escala) / 5) * 5; });
    livre -= grupo.reduce((s, p) => s + alocacao[p.m.materiaId], 0);
  });

  const necessarioTotal = pedidos.reduce((s, p) => s + p.necessario, 0);
  return {
    alocacao,
    capacidade,
    semanasRestantes,
    necessarioTotal,
    faltaSemanal: semanasRestantes ? Math.max(0, necessarioTotal - capacidade) : 0,
    emRisco: pedidos.filter((p) => semanasRestantes && alocacao[p.m.materiaId] < p.necessario).map((p) => p.m.materiaId),
  };
}

/* Datas previstas de cada item pendente, dia a dia a partir de hoje: cada
   matéria recebe por dia a sua fatia da alocação semanal, proporcional às
   horas livres daquele dia. */
export function projetarCronograma(plano, itens, progresso, alocacao, hojeIso, limiteDias = 1100) {
  const disp = plano.disponibilidade || DISP_PADRAO;
  const capacidade = capacidadeSemanal(disp);
  const datas = {};
  if (!capacidade) return { datas, fimPrevisto: null, semCapacidade: true };

  const filas = {};
  itens.forEach((it) => {
    const e = estadoItem(it, progresso);
    if (!e.concluido) (filas[it.materiaId] ||= []).push({ it, resto: e.restante });
  });
  let fimPrevisto = null;
  let dia = hojeIso;
  for (let i = 0; i < limiteDias && Object.values(filas).some((f) => f.length); i++, dia = somarDias(dia, 1)) {
    const capDia = Number(disp[dataParaDiaSemana(dia)]) || 0;
    if (!capDia) continue;
    Object.entries(filas).forEach(([materiaId, fila]) => {
      let cota = ((alocacao[materiaId] || 0) * capDia) / capacidade;
      while (cota > 1e-6 && fila.length) {
        const x = fila[0];
        datas[x.it.itemId] ||= { inicio: dia };
        const usa = Math.min(cota, x.resto);
        x.resto -= usa;
        cota -= usa;
        if (x.resto <= 1e-6) {
          datas[x.it.itemId].fim = dia;
          if (!fimPrevisto || dia > fimPrevisto) fimPrevisto = dia;
          fila.shift();
        }
      }
    });
  }
  const semPrevisao = Object.values(filas).reduce((s, f) => s + f.length, 0);
  return { datas, fimPrevisto: semPrevisao ? null : fimPrevisto, semCapacidade: false, semPrevisao };
}

/* Recalcula alocação e cronograma a partir de hoje. Itens concluídos mantêm
   o histórico; só o que falta ganha novas datas. */
export function recalcularPlano(plano, ind, progresso, hojeIso) {
  const itens = itensDoPlano(plano, ind);
  const aloc = calcularAlocacao(plano, itens, progresso, hojeIso);
  const proj = projetarCronograma(plano, itens, progresso, aloc.alocacao, hojeIso);
  const cronograma = {};
  let remarcados = 0;
  itens.forEach((it) => {
    if (estadoItem(it, progresso).concluido) {
      if (plano.cronograma?.[it.itemId]) cronograma[it.itemId] = plano.cronograma[it.itemId];
      return;
    }
    const novo = proj.datas[it.itemId];
    if (novo) cronograma[it.itemId] = novo;
    if (plano.cronograma?.[it.itemId]?.fim !== novo?.fim) remarcados++;
  });
  const atrasadosAntes = itens.filter((it) => statusItem(it, progresso, plano.cronograma, hojeIso) === "atrasado").length;
  return {
    plano: { ...plano, alocacaoSemanal: aloc.alocacao, cronograma, fimPrevisto: proj.fimPrevisto, recalculadoEm: hojeIso },
    resumo: {
      ...aloc,
      fimPrevisto: proj.fimPrevisto,
      semPrevisao: proj.semPrevisao || 0,
      cabe: !plano.dataAlvo || (!!proj.fimPrevisto && proj.fimPrevisto <= plano.dataAlvo),
      remarcados,
      atrasadosAntes,
    },
  };
}

/* ---------- Indicadores ---------- */

export function calcularProgressoPlano(itens, progresso, cronograma, hojeIso) {
  const cont = { nao_iniciado: 0, em_andamento: 0, concluido: 0, atrasado: 0 };
  let feito = 0, total = 0;
  const porMateria = {};
  itens.forEach((it) => {
    const st = statusItem(it, progresso, cronograma, hojeIso);
    const e = estadoItem(it, progresso);
    cont[st]++;
    total += it.duracao;
    const parte = e.concluido ? it.duracao : Math.min(e.minutos, it.duracao);
    feito += parte;
    const pm = (porMateria[it.materiaId] ||= { materiaId: it.materiaId, total: 0, feito: 0, itens: 0, concluidos: 0, atrasados: 0 });
    pm.total += it.duracao; pm.feito += parte; pm.itens++;
    if (st === "concluido") pm.concluidos++;
    if (st === "atrasado") pm.atrasados++;
  });
  const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);
  const proximos = itens
    .filter((it) => !estadoItem(it, progresso).concluido)
    .sort((a, b) => (cronograma?.[a.itemId]?.inicio || "9999").localeCompare(cronograma?.[b.itemId]?.inicio || "9999") || a.posMateria - b.posMateria)
    .slice(0, 6);
  return {
    total: itens.length,
    concluidos: cont.concluido,
    emAndamento: cont.em_andamento,
    atrasados: cont.atrasado,
    naoIniciados: cont.nao_iniciado,
    pct: pct(feito, total),
    minutosTotais: total,
    minutosFeitos: Math.round(feito),
    porMateria: Object.values(porMateria).map((m) => ({ ...m, pct: pct(m.feito, m.total) })),
    proximos,
  };
}

export function calcularAtrasos(itens, progresso, cronograma, hojeIso) {
  const atrasados = itens
    .filter((it) => statusItem(it, progresso, cronograma, hojeIso) === "atrasado")
    .map((it) => ({ ...it, dias: diasEntre(cronograma[it.itemId].fim, hojeIso), restante: estadoItem(it, progresso).restante }))
    .sort((a, b) => b.dias - a.dias);
  return {
    itens: atrasados,
    quantidade: atrasados.length,
    maxDias: atrasados[0]?.dias || 0,
    cargaMin: atrasados.reduce((s, it) => s + it.restante, 0),
    materias: [...new Set(atrasados.map((it) => it.materiaId))],
  };
}

// Revisões a agendar quando um item é concluído.
export const revisoesDoItem = (dataConclusao, revisao = REVISAO_PADRAO) =>
  (revisao.intervalos || []).map((dias) => ({ dataPrevista: somarDias(dataConclusao, dias), duracaoMin: revisao.duracaoMin || 20 }));

// Ciclo semanal (formato do motor do núcleo) a partir do plano.
export function cicloDoPlano(plano, ind) {
  const alocacoes = (plano?.materias || [])
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => ind.materia(m.materiaId) && m.ativa !== false)
    .sort((a, b) => (a.m.prioridade ?? 2) - (b.m.prioridade ?? 2) || a.i - b.i)
    .map(({ m }) => ({
      materiaId: m.materiaId,
      materiaNome: ind.nomeMateria(m.materiaId),
      minutosSemanais: plano.alocacaoSemanal?.[m.materiaId] ?? m.minutosSemanais ?? 0,
      maxSessao: m.maxSessao || 60,
      ehMateria: true, // o motor não confunde com uma área de mesmo id
    }));
  return { alocacoes };
}

/* ---------- Criação a partir do modelo ---------- */

export function modeloVazio() {
  return {
    nome: "", descricao: "", vestibularId: "", cursoId: "", modalidade: "extensivo", periodo: "", versao: 1, dataAlvo: null,
    ritmo: 1, revisao: { ...REVISAO_PADRAO }, permissoesAluno: { ...PERMISSOES_PADRAO }, materias: [],
  };
}

export function planoDoModelo(modelo, aluno, { hojeIso, disponibilidade } = {}) {
  return {
    id: aluno.id,
    alunoId: aluno.id,
    modeloId: modelo.id || null,
    modeloVersao: modelo.versao || 1,
    nome: modelo.nome,
    vestibularId: modelo.vestibularId || "",
    cursoId: modelo.cursoId || "",
    modalidade: modelo.modalidade || "",
    periodo: modelo.periodo || "",
    ritmo: modelo.ritmo || 1,
    dataAlvo: modelo.dataAlvo || null,
    inicio: hojeIso,
    disponibilidade: { ...(disponibilidade || DISP_PADRAO) },
    revisao: structuredClone(modelo.revisao || REVISAO_PADRAO),
    permissoesAluno: { ...PERMISSOES_PADRAO, ...(modelo.permissoesAluno || {}) },
    materias: structuredClone(modelo.materias || []),
    alocacaoSemanal: {},
    cronograma: {},
    fimPrevisto: null,
    recalculadoEm: null,
  };
}

// Sugestão de plano geral para o aluno: vestibular + curso, depois só vestibular.
export function sugerirModelo(modelos, aluno) {
  return modelos.find((m) => m.vestibularId === aluno.vestibularId && m.cursoId && m.cursoId === aluno.cursoId)
    || modelos.find((m) => m.vestibularId === aluno.vestibularId && !m.cursoId)
    || null;
}

/* ---------- Alterações (puras) ----------
   alterarPlano(plano, ind, op) → { plano, log: [{ tipo, descricao, antes, depois }] }
   Serve ao plano individual e ao modelo (mesma forma). */

const mover = (lista, i, passo) => {
  const j = i + passo;
  if (i < 0 || j < 0 || j >= lista.length) return false;
  [lista[i], lista[j]] = [lista[j], lista[i]];
  return true;
};
const topicosCompletos = (ind, materiaId) => ind.topicosDaMateria(materiaId).map((t) => ({
  topicoId: t.id, subtopicos: ind.subtopicosDoTopico(t.id).map((s) => ({ subtopicoId: s.id })),
}));

export function alterarPlano(plano, ind, op) {
  const p = structuredClone(plano);
  p.materias ||= [];
  const log = [];
  const registrar = (tipo, descricao, antes = null, depois = null) => log.push({ tipo, descricao, antes, depois });
  const mat = (id) => p.materias.find((m) => m.materiaId === id);
  const top = (m, id) => m?.topicos?.find((t) => t.topicoId === id);
  const nomeM = ind.nomeMateria(op.materiaId);
  const nomeT = ind.nomeTopico(op.topicoId);
  const nomeS = ind.nomeSubtopico(op.subtopicoId);

  switch (op.tipo) {
    case "adicionarMateria": {
      if (mat(op.materiaId) || !ind.materia(op.materiaId)) break;
      p.materias.push({
        materiaId: op.materiaId, minutosSemanais: op.minutosSemanais ?? 120, maxSessao: op.maxSessao ?? 60,
        prioridade: op.prioridade ?? 2, ritmo: 1, topicos: op.vazia ? [] : topicosCompletos(ind, op.materiaId),
      });
      registrar(op.tipo, `Adicionou a matéria ${nomeM}`, null, nomeM);
      break;
    }
    case "removerMateria": {
      if (!mat(op.materiaId)) break;
      p.materias = p.materias.filter((m) => m.materiaId !== op.materiaId);
      registrar(op.tipo, `Removeu a matéria ${nomeM}`, nomeM, null);
      break;
    }
    case "moverMateria": {
      const i = p.materias.findIndex((m) => m.materiaId === op.materiaId);
      if (mover(p.materias, i, op.passo)) registrar(op.tipo, `${op.passo < 0 ? "Antecipou" : "Adiou"} ${nomeM} na sequência`, i + 1, i + 1 + op.passo);
      break;
    }
    case "definirMateria": {
      const m = mat(op.materiaId);
      if (!m) break;
      const rotulos = { minutosSemanais: "horas por semana", maxSessao: "duração de cada meta", prioridade: "prioridade", ritmo: "velocidade", ativa: "aparecimento" };
      const fmt = (k, v) => (k === "ativa" ? (v === false ? "oculta" : "visível") : k === "prioridade" ? PRIORIDADES.find((p) => p.id === v)?.nome ?? v : k === "ritmo" ? nomeRitmo(v) : v);
      Object.entries(op.campos || {}).forEach(([k, v]) => {
        const atual = k === "ativa" ? m.ativa !== false : m[k];
        if (!(k in rotulos) || atual === v) return;
        registrar(op.tipo, `Mudou ${rotulos[k]} de ${nomeM}`, fmt(k, atual ?? null), fmt(k, v));
        m[k] = v;
      });
      break;
    }
    case "adicionarTopico": {
      const m = mat(op.materiaId);
      if (!m || top(m, op.topicoId) || !ind.topico(op.topicoId)) break;
      m.topicos.push({ topicoId: op.topicoId, subtopicos: ind.subtopicosDoTopico(op.topicoId).map((s) => ({ subtopicoId: s.id })) });
      registrar(op.tipo, `Adicionou o tópico ${nomeT} em ${nomeM}`, null, nomeT);
      break;
    }
    case "removerTopico": {
      const m = mat(op.materiaId);
      if (!top(m, op.topicoId)) break;
      m.topicos = m.topicos.filter((t) => t.topicoId !== op.topicoId);
      registrar(op.tipo, `Removeu o tópico ${nomeT} de ${nomeM}`, nomeT, null);
      break;
    }
    case "moverTopico": {
      const m = mat(op.materiaId);
      if (!m) break;
      if (p.alunoId) { // edital do aluno: só a lista de ordem muda
        const ids = topicosEmOrdem(p, m).map((t) => t.topicoId);
        const i = ids.indexOf(op.topicoId);
        if (!mover(ids, i, op.passo)) break;
        p.ordemTopicos = { ...(p.ordemTopicos || {}), [op.materiaId]: ids };
        registrar(op.tipo, `Mudou a ordem de ${nomeT} em ${nomeM}`, i + 1, i + 1 + op.passo);
        break;
      }
      const i = m.topicos.findIndex((t) => t.topicoId === op.topicoId);
      if (mover(m.topicos, i, op.passo)) registrar(op.tipo, `Mudou a ordem de ${nomeT} em ${nomeM}`, i + 1, i + 1 + op.passo);
      break;
    }
    case "adicionarSubtopico": {
      const t = top(mat(op.materiaId), op.topicoId);
      if (!t || t.subtopicos.some((s) => s.subtopicoId === op.subtopicoId) || !ind.subtopico(op.subtopicoId)) break;
      t.subtopicos.push({ subtopicoId: op.subtopicoId });
      registrar(op.tipo, `Adicionou o subtópico ${nomeS} em ${nomeT}`, null, nomeS);
      break;
    }
    case "removerSubtopico": {
      const t = top(mat(op.materiaId), op.topicoId);
      if (!t?.subtopicos.some((s) => s.subtopicoId === op.subtopicoId)) break;
      t.subtopicos = t.subtopicos.filter((s) => s.subtopicoId !== op.subtopicoId);
      registrar(op.tipo, `Removeu o subtópico ${nomeS} de ${nomeT}`, nomeS, null);
      break;
    }
    case "moverSubtopico": {
      const t = top(mat(op.materiaId), op.topicoId);
      const i = t?.subtopicos.findIndex((s) => s.subtopicoId === op.subtopicoId) ?? -1;
      if (t && mover(t.subtopicos, i, op.passo)) registrar(op.tipo, `Mudou a ordem de ${nomeS} em ${nomeT}`, i + 1, i + 1 + op.passo);
      break;
    }
    case "definirCarga": {
      const t = top(mat(op.materiaId), op.topicoId);
      if (!t) break;
      const alvo = op.subtopicoId ? t.subtopicos.find((s) => s.subtopicoId === op.subtopicoId) : t;
      if (!alvo || alvo.cargaMin === op.cargaMin) break;
      registrar(op.tipo, `Mudou a carga de ${op.subtopicoId ? nomeS : nomeT}`, alvo.cargaMin ?? null, op.cargaMin);
      alvo.cargaMin = op.cargaMin;
      break;
    }
    case "definirPlano": {
      const rotulos = { nome: "nome do plano", ritmo: "ritmo", dataAlvo: "data-alvo", disponibilidade: "horas livres por dia", revisao: "revisões", permissoesAluno: "permissões do aluno", vestibularId: "vestibular", cursoId: "curso", modalidade: "modalidade", periodo: "período", versao: "versão", descricao: "descrição" };
      Object.entries(op.campos || {}).forEach(([k, v]) => {
        if (!(k in rotulos) || JSON.stringify(p[k]) === JSON.stringify(v)) return;
        const fmt = (x) => (k === "ritmo" ? nomeRitmo(x) : x);
        registrar(op.tipo, `Mudou ${rotulos[k]}`, fmt(p[k] ?? null), fmt(v));
        p[k] = structuredClone(v);
      });
      break;
    }
    default:
      throw new Error(`Alteração de plano desconhecida: ${op.tipo}`);
  }
  return { plano: p, log };
}

/* Impacto de uma alteração, para a confirmação antes de aplicar. */
export function impactoAlteracao(antes, depois, ind, progresso, hojeIso) {
  const r1 = recalcularPlano(antes, ind, progresso, hojeIso);
  const r2 = recalcularPlano(depois, ind, progresso, hojeIso);
  const itens1 = itensDoPlano(antes, ind);
  const itens2 = itensDoPlano(depois, ind);
  const ids1 = new Set(itens1.map((it) => it.itemId));
  const ids2 = new Set(itens2.map((it) => it.itemId));
  const pendentes = itens2.filter((it) => !estadoItem(it, progresso).concluido && ids1.has(it.itemId));
  const mudaram = pendentes.filter((it) => r1.plano.cronograma[it.itemId]?.fim !== r2.plano.cronograma[it.itemId]?.fim).length;
  return {
    conteudosRemarcados: mudaram,
    conteudosRetirados: itens1.filter((it) => !ids2.has(it.itemId) && !estadoItem(it, progresso).concluido).length,
    conteudosIncluidos: itens2.filter((it) => !ids1.has(it.itemId)).length,
    concluidosPreservados: itens2.filter((it) => estadoItem(it, progresso).concluido).length,
    fimAntes: r1.resumo.fimPrevisto,
    fimDepois: r2.resumo.fimPrevisto,
    cabeDepois: r2.resumo.cabe,
  };
}

/* Nomes pedidos na especificação. */
export { calcularProgressoPlano as calculatePlanProgress, calcularAtrasos as calculateDelayedGoals };
