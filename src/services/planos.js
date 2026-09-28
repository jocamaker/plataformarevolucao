/* studyPlanService: jornadas (planos gerais, "modelos"), plano individual, progresso e revisões.

   planos/{alunoId}      cópia editável do modelo (materias, ritmo, datas, cronograma)
   progresso/{alunoId}   { itens: { [itemId]: { minutos, concluido, concluidoEm } } }
   revisoes/{id}         revisões espaçadas de um item concluído
   planosAnteriores/{id} plano substituído, guardado inteiro
   logs/{id}             quem mudou o quê, quando, antes e depois

   Toda alteração do plano recalcula só o que falta (recalcularPlano preserva
   o cronograma dos itens concluídos) e nunca mexe nas sessões de estudo. */

import { apagarCampo, carimbo, ErroDados, novoId } from "../data/contrato.js";
import {
  alterarPlano, estadoItem, idItem, impactoAlteracao, itensDoPlano, modeloVazio, planoDoModelo,
  recalcularPlano, revisoesDoItem, sugerirModelo,
} from "../core/plano.js";
import { DISP_PADRAO } from "../core/nucleo.js";
import { ErroValidacao, opsDeLog, porNome } from "./base.js";

/* Qual permissão do aluno cada alteração exige (null = só o moderador). */
export function permissaoDaOperacao(op) {
  if (op.tipo === "moverTopico") return "reordenar"; // grava só ordemTopicos
  if (op.tipo === "definirPlano") {
    const campos = Object.keys(op.campos || {});
    if (campos.length && campos.every((c) => c === "disponibilidade")) return "disponibilidade";
    if (campos.length && campos.every((c) => c === "ritmo")) return "ritmo";
  }
  return null;
}

/* Revisões de um item recém-concluído: uma sessão por intervalo do plano. */
export function opRevisoesDoItem(plano, item, alunoId, dataConclusao, origem) {
  const sessoes = revisoesDoItem(dataConclusao, plano?.revisao).map((r) => ({ dia: r.dataPrevista, status: "agendada" }));
  if (!sessoes.length) return null;
  const id = novoId();
  return {
    tipo: "criar", colecao: "revisoes", id,
    dados: {
      alunoId, itemId: item.itemId, materiaId: item.materiaId, topicoId: item.topicoId, subtopicoId: item.subtopicoId || null,
      concluidoEm: dataConclusao, duracaoMin: plano?.revisao?.duracaoMin || 20, sessoes, origem, criadoEm: carimbo(),
    },
  };
}

/* Tira as revisões que ainda não aconteceram (agendadas) de um item reaberto.
   Sessões feitas ou ignoradas ficam: são histórico. */
export function opsCancelarRevisoes(revisoes, itemId, { soIds } = {}) {
  const ops = [];
  revisoes
    .filter((r) => r.itemId === itemId && (!soIds || soIds.includes(r.id)))
    .forEach((r) => {
      const restantes = (r.sessoes || []).filter((s) => s.status !== "agendada");
      if (restantes.length === (r.sessoes || []).length) return;
      ops.push(restantes.length
        ? { tipo: "atualizar", colecao: "revisoes", id: r.id, dados: { sessoes: restantes } }
        : { tipo: "remover", colecao: "revisoes", id: r.id });
    });
  return ops;
}

/* Versão de uma alteração da jornada para o plano de um aluno (null = não levar). */
const PADRAO_MATERIA = { prioridade: 2, ritmo: 1, ativa: true };
const valorMateria = (m, k) => (k === "ativa" ? m?.ativa !== false : m?.[k] ?? PADRAO_MATERIA[k] ?? null);
export function opParaAluno(op, modeloAntes, plano) {
  if (["moverMateria", "moverTopico", "moverSubtopico"].includes(op.tipo)) return null;
  const igual = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  if (op.tipo === "definirMateria") {
    const naJornada = modeloAntes.materias?.find((m) => m.materiaId === op.materiaId);
    const noAluno = plano.materias?.find((m) => m.materiaId === op.materiaId);
    if (!noAluno) return null;
    const campos = Object.fromEntries(Object.entries(op.campos || {}).filter(([k]) => igual(valorMateria(noAluno, k), valorMateria(naJornada, k))));
    return Object.keys(campos).length ? { ...op, campos } : null;
  }
  if (op.tipo === "definirPlano") {
    const soDaJornada = ["nome", "descricao", "versao", "periodo"];
    const campos = Object.fromEntries(Object.entries(op.campos || {}).filter(([k]) => !soDaJornada.includes(k) && igual(plano[k], modeloAntes[k])));
    return Object.keys(campos).length ? { ...op, campos } : null;
  }
  if (op.tipo === "definirCarga") {
    const alvo = (p) => {
      const t = p.materias?.find((m) => m.materiaId === op.materiaId)?.topicos?.find((x) => x.topicoId === op.topicoId);
      return op.subtopicoId ? t?.subtopicos?.find((x) => x.subtopicoId === op.subtopicoId) : t;
    };
    return igual(alvo(plano)?.cargaMin, alvo(modeloAntes)?.cargaMin) ? op : null;
  }
  return op;
}

export function servicoPlanos(ctx, servicos) {
  const { repo } = ctx;

  async function carregar(alunoId) {
    const [plano, progresso, ind] = await Promise.all([repo.obter("planos", alunoId), repo.obter("progresso", alunoId), ctx.indice()]);
    return { plano, prog: progresso?.itens || {}, ind };
  }

  function validarModelo(m, ind) {
    const erros = {};
    if (!String(m.nome || "").trim()) erros.nome = "Dê um nome à jornada.";
    if (!m.vestibularId || !ind.vestibular(m.vestibularId)) erros.vestibularId = "Escolha o vestibular.";
    if (m.cursoId && !ind.curso(m.cursoId)) erros.cursoId = "Curso inválido.";
    if (m.dataAlvo && !/^\d{4}-\d{2}-\d{2}$/.test(m.dataAlvo)) erros.dataAlvo = "Data inválida.";
    if (Object.keys(erros).length) throw new ErroValidacao(erros);
  }

  // grava o plano recalculado + histórico; depois ajusta a semana do aluno
  async function gravarPlano(alunoId, plano, prog, ind, entradas, { motivo, extra = [] } = {}) {
    const { plano: calculado, resumo } = recalcularPlano(plano, ind, prog, ctx.hoje());
    const { id: _id, ...dados } = calculado;
    const logId = novoId();
    await repo.lote([
      ...opsDeLog(ctx, { alunoId, entidade: "plano", entidadeId: alunoId, motivo, logId }, entradas),
      { tipo: "definir", colecao: "planos", id: alunoId, dados: { ...dados, alunoId, ultimoLogId: logId, atualizadoEm: carimbo() } },
      ...extra,
    ]);
    await servicos.estudo?.aposMudarPlano(alunoId).catch(() => {});
    return resumo;
  }

  return {
    permissaoDaOperacao,

    /* ---------- Jornadas (planos gerais) ---------- */

    observarModelos(cb) {
      ctx.exigir("gerenciar:modelos");
      return repo.observar("modelosPlano", [], (lista) => cb([...lista].sort(porNome)));
    },

    async salvarModelo(dados) {
      ctx.exigir("gerenciar:modelos");
      const ind = await ctx.indice();
      const base = dados.id ? await repo.obter("modelosPlano", dados.id) : modeloVazio();
      const modelo = { ...base, ...dados };
      validarModelo(modelo, ind);
      const id = dados.id || novoId();
      const { id: _i, ...doc } = modelo;
      await repo.lote([
        { tipo: "definir", colecao: "modelosPlano", id, dados: { ...doc, nome: doc.nome.trim(), arquivado: !!doc.arquivado, atualizadoEm: carimbo(), ...(dados.id ? {} : { criadoEm: carimbo() }) } },
        ...opsDeLog(ctx, { entidade: "modelo", entidadeId: id }, [{ tipo: dados.id ? "editar" : "criar", descricao: `${dados.id ? "Editou" : "Criou"} a jornada ${doc.nome.trim()}` }]),
      ]);
      return id;
    },

    async alterarModelo(id, ops) {
      ctx.exigir("gerenciar:modelos");
      const ind = await ctx.indice();
      let modelo = await repo.obter("modelosPlano", id);
      if (!modelo) throw new ErroDados("Jornada não encontrada.", "nao-encontrado");
      const entradas = [];
      (Array.isArray(ops) ? ops : [ops]).forEach((op) => {
        const r = alterarPlano(modelo, ind, op);
        modelo = r.plano;
        entradas.push(...r.log);
      });
      if (!entradas.length) return false;
      const { id: _i, ...doc } = modelo;
      await repo.lote([
        { tipo: "definir", colecao: "modelosPlano", id, dados: { ...doc, atualizadoEm: carimbo() } },
        ...opsDeLog(ctx, { entidade: "modelo", entidadeId: id }, entradas),
      ]);
      return true;
    },

    async duplicarModelo(id) {
      ctx.exigir("gerenciar:modelos");
      const m = await repo.obter("modelosPlano", id);
      if (!m) throw new ErroDados("Jornada não encontrada.", "nao-encontrado");
      const { id: _i, ...doc } = m;
      return this.salvarModelo({ ...doc, nome: `${m.nome} (cópia)`, versao: 1, arquivado: false });
    },

    async arquivarModelo(id, arquivado = true) {
      ctx.exigir("gerenciar:modelos");
      await repo.atualizar("modelosPlano", id, { arquivado, atualizadoEm: carimbo() });
    },

    sugerir: (modelos, aluno) => sugerirModelo(modelos.filter((m) => !m.arquivado), aluno),

    /* Jornada em um passo: todas as matérias do curso, com todos os tópicos,
       e as horas da semana divididas por igual (depois é só ajustar). */
    async criarJornada({ nome, vestibularId, cursoId = "", dataAlvo = null, modalidade = "extensivo", horasSemanais = 20 }) {
      ctx.exigir("gerenciar:modelos");
      const ind = await ctx.indice();
      const materias = ind.materias;
      const total = Math.max(15, Math.round(horasSemanais * 60));
      const base = Math.floor(total / materias.length / 15) * 15;
      let sobra = total - base * materias.length;
      const nomePadrao = [ind.nomeVestibular(vestibularId), ind.nomeCurso(cursoId)].filter(Boolean).join(" · ");
      return this.salvarModelo({
        ...modeloVazio(),
        nome: String(nome || "").trim() || nomePadrao, vestibularId, cursoId, dataAlvo, modalidade,
        materias: materias.map((m) => {
          const extra = sobra >= 15 ? 15 : 0;
          sobra -= extra;
          return {
            materiaId: m.id, minutosSemanais: base + extra, maxSessao: 60, prioridade: 2, ritmo: 1,
            topicos: ind.topicosDaMateria(m.id).map((t) => ({ topicoId: t.id, subtopicos: ind.subtopicosDoTopico(t.id).map((x) => ({ subtopicoId: x.id })) })),
          };
        }),
      });
    },

    /* Tópico novo criado direto na jornada (ou no plano de um aluno): entra na
       estrutura, na jornada e, com propagar, no plano de cada aluno dela. */
    async novoTopico({ materiaId, nome, cargaMin = 60, modeloId, alunoId, propagar = false, motivo = "" }) {
      ctx.exigir("gerenciar:estrutura");
      const topicoId = await servicos.estrutura.salvar("topico", { materiaId, nome, cargaMin });
      const op = { tipo: "adicionarTopico", materiaId, topicoId };
      await this.aplicarNaJornada({ modeloId, alunoId, op, propagar, motivo });
      return topicoId;
    },

    async novoSubtopico({ materiaId, topicoId, nome, modeloId, alunoId, propagar = false, motivo = "" }) {
      ctx.exigir("gerenciar:estrutura");
      const subtopicoId = await servicos.estrutura.salvar("subtopico", { topicoId, nome });
      const op = { tipo: "adicionarSubtopico", materiaId, topicoId, subtopicoId };
      await this.aplicarNaJornada({ modeloId, alunoId, op, propagar, motivo });
      return subtopicoId;
    },

    /* Alteração na jornada e, com propagar, nos planos dos alunos dela. O
       ajuste individual de cada aluno é mantido: um campo de matéria ou de
       regra só muda no aluno se ainda estiver igual ao da jornada; mudanças
       de ordem não são levadas (cada aluno pode ter a sua). */
    async alterarJornada(modeloId, ops, { propagar = false, motivo = "" } = {}) {
      const lista = Array.isArray(ops) ? ops : [ops];
      const antes = await repo.obter("modelosPlano", modeloId);
      const mudou = await this.alterarModelo(modeloId, lista);
      if (!propagar || !antes) return { mudou, alunos: 0 };
      const planos = await repo.listar("planos", [["modeloId", "==", modeloId]]);
      let alunos = 0;
      for (const p of planos) {
        const doAluno = lista.map((op) => opParaAluno(op, antes, p)).filter(Boolean);
        if (!doAluno.length) continue;
        const r = await this.alterar(p.id, doAluno, { motivo: motivo || "Levado pela jornada" });
        if (r.mudou) alunos++;
      }
      return { mudou, alunos };
    },

    // aplica uma alteração na jornada (com os alunos dela, se pedido) ou no plano de um aluno
    async aplicarNaJornada({ modeloId, alunoId, op, propagar = false, motivo = "" }) {
      if (modeloId) await this.alterarJornada(modeloId, op, { propagar, motivo: motivo || "Incluído pela jornada" });
      if (alunoId) await this.alterar(alunoId, op, { motivo });
    },

    alunosDaJornada: async (modeloId) => (await repo.listar("planos", [["modeloId", "==", modeloId]])).map((p) => p.id),

    /* Subtópicos que o aluno já viu (orientação dentro do tópico). */
    observarVistos(alunoId, cb) {
      ctx.exigir("ver:aluno", { alunoId });
      return repo.observarDoc("vistos", alunoId, (d) => cb(d?.subtopicos || {}));
    },
    async marcarSubtopico(alunoId, subtopicoId, visto) {
      const plano = await repo.obter("planos", alunoId);
      ctx.exigir("alterar:plano", { alunoId, plano, permissao: "concluirItens" });
      await repo.mesclar("vistos", alunoId, { alunoId, subtopicos: { [subtopicoId]: visto ? true : apagarCampo() } });
    },

    /* ---------- Plano individual ---------- */

    observarPlano(alunoId, cb) {
      ctx.exigir("ver:aluno", { alunoId });
      return repo.observarDoc("planos", alunoId, cb);
    },

    observarProgresso(alunoId, cb) {
      ctx.exigir("ver:aluno", { alunoId });
      return repo.observarDoc("progresso", alunoId, (doc) => cb(doc?.itens || {}));
    },

    observarTodosPlanos(cb) {
      ctx.exigir("gerenciar:alunos");
      return repo.observar("planos", [], cb);
    },

    observarTodoProgresso(cb) {
      ctx.exigir("gerenciar:alunos");
      return repo.observar("progresso", [], (lista) => cb(Object.fromEntries(lista.map((p) => [p.id, p.itens || {}]))));
    },

    /* Cria o plano individual a partir de uma jornada. Se o aluno já tem
       plano, só substitui com { substituir: true }; o anterior fica guardado
       em planosAnteriores e o progresso/histórico continuam. */
    async aplicarModelo(alunoId, modeloId, { substituir = false, motivo = "" } = {}) {
      ctx.exigir("gerenciar:alunos");
      const [modelo, aluno, { plano: atual, prog, ind }] = await Promise.all([
        repo.obter("modelosPlano", modeloId), repo.obter("usuarios", alunoId), carregar(alunoId),
      ]);
      if (!modelo) throw new ErroDados("Jornada não encontrada.", "nao-encontrado");
      if (!aluno) throw new ErroDados("Aluno não encontrado.", "nao-encontrado");
      if (atual && !substituir) {
        throw new ErroDados(`${aluno.nome} já tem um plano (${atual.nome}). Confirme para substituir; o progresso e o histórico são mantidos.`, "plano-existente");
      }
      const plano = planoDoModelo({ ...modelo, id: modeloId }, { id: alunoId }, {
        hojeIso: ctx.hoje(), disponibilidade: atual?.disponibilidade || DISP_PADRAO,
      });
      if (!plano.dataAlvo && aluno.dataProva) plano.dataAlvo = aluno.dataProva;
      const extra = [{ tipo: "mesclar", colecao: "progresso", id: alunoId, dados: { alunoId } }];
      if (atual) extra.push({ tipo: "criar", colecao: "planosAnteriores", id: novoId(), dados: { alunoId, plano: atual, substituidoEm: carimbo(), substituidoPor: ctx.usuario.uid } });
      return gravarPlano(alunoId, plano, prog, ind, [{
        tipo: atual ? "substituirPlano" : "aplicarPlano",
        descricao: atual ? `Trocou a jornada pela ${modelo.nome}` : `Aplicou a jornada ${modelo.nome}`,
        antes: atual?.nome || null, depois: modelo.nome,
      }], { motivo, extra });
    },

    /* Prévia para a confirmação: quantos conteúdos futuros mudam de data e
       quantos concluídos ficam preservados. Não grava nada. */
    async previa(alunoId, ops) {
      const { plano, prog, ind } = await carregar(alunoId);
      if (!plano) throw new ErroDados("Este aluno ainda não tem plano.", "sem-plano");
      let novo = plano;
      const log = [];
      (Array.isArray(ops) ? ops : [ops]).forEach((op) => {
        ctx.exigir("alterar:plano", { alunoId, plano, permissao: permissaoDaOperacao(op) });
        const r = alterarPlano(novo, ind, op);
        novo = r.plano;
        log.push(...r.log);
      });
      return { ...impactoAlteracao(plano, novo, ind, prog, ctx.hoje()), alteracoes: log };
    },

    async alterar(alunoId, ops, { motivo = "" } = {}) {
      const { plano, prog, ind } = await carregar(alunoId);
      if (!plano) throw new ErroDados("Este aluno ainda não tem plano.", "sem-plano");
      let novo = plano;
      const entradas = [];
      (Array.isArray(ops) ? ops : [ops]).forEach((op) => {
        ctx.exigir("alterar:plano", { alunoId, plano, permissao: permissaoDaOperacao(op) });
        const r = alterarPlano(novo, ind, op);
        novo = r.plano;
        entradas.push(...r.log);
      });
      if (!entradas.length) return { mudou: false };
      const resumo = await gravarPlano(alunoId, novo, prog, ind, entradas, { motivo });
      return { mudou: true, resumo, alteracoes: entradas };
    },

    async recalcular(alunoId, { motivo = "" } = {}) {
      const { plano, prog, ind } = await carregar(alunoId);
      if (!plano) throw new ErroDados("Este aluno ainda não tem plano.", "sem-plano");
      ctx.exigir("alterar:plano", { alunoId, plano, permissao: "recalcular" });
      const previa = recalcularPlano(plano, ind, prog, ctx.hoje()).resumo;
      // o recálculo remarca as datas: o atraso que havia fica registrado aqui
      const atrasados = previa.atrasadosAntes;
      return gravarPlano(alunoId, plano, prog, ind, [{
        tipo: "recalcular",
        descricao: `Recalculou o plano${atrasados ? ` (${atrasados} ${atrasados === 1 ? "conteúdo estava atrasado" : "conteúdos estavam atrasados"})` : ""}`,
        antes: plano.fimPrevisto || null, depois: previa.fimPrevisto || null,
      }], { motivo });
    },

    /* Concluir / reabrir um conteúdo à mão. Concluir agenda as revisões;
       reabrir tira só as revisões que ainda não aconteceram. */
    async concluirItem(alunoId, itemId, { motivo = "" } = {}) {
      const { plano, prog, ind } = await carregar(alunoId);
      if (!plano) throw new ErroDados("Este aluno ainda não tem plano.", "sem-plano");
      ctx.exigir("alterar:plano", { alunoId, plano, permissao: "concluirItens" });
      const item = itensDoPlano(plano, ind).find((it) => it.itemId === itemId);
      if (!item) throw new ErroDados("Conteúdo não está no plano.", "nao-encontrado");
      if (estadoItem(item, prog).concluido && prog[itemId]?.concluido === true) return false;
      const hoje = ctx.hoje();
      const jaAuto = estadoItem(item, prog).concluido;
      const logId = novoId();
      const ops = [
        ...opsDeLog(ctx, { alunoId, entidade: "plano", entidadeId: alunoId, motivo, logId }, [{
          tipo: "concluirItem", descricao: `Concluiu ${nomeItem(ind, item)}`, antes: "aberto", depois: "concluído",
        }]),
        { tipo: "mesclar", colecao: "progresso", id: alunoId, dados: { alunoId, ultimaOperacao: { tipo: "log", id: logId }, itens: { [itemId]: { concluido: true, concluidoEm: prog[itemId]?.concluidoEm || hoje } } } },
      ];
      if (!jaAuto) {
        const rev = opRevisoesDoItem(plano, item, alunoId, hoje, "conclusao");
        if (rev) ops.push(rev);
      }
      await repo.lote(ops);
      await servicos.estudo?.sincronizarRevisoes(alunoId).catch(() => {});
      return true;
    },

    async reabrirItem(alunoId, itemId, { motivo = "" } = {}) {
      const { plano, prog, ind } = await carregar(alunoId);
      if (!plano) throw new ErroDados("Este aluno ainda não tem plano.", "sem-plano");
      ctx.exigir("alterar:plano", { alunoId, plano, permissao: "concluirItens" });
      const item = itensDoPlano(plano, ind).find((it) => it.itemId === itemId);
      if (!item || !estadoItem(item, prog).concluido) return false;
      const revisoes = await repo.listar("revisoes", [["alunoId", "==", alunoId]]);
      const logId = novoId();
      await repo.lote([
        ...opsDeLog(ctx, { alunoId, entidade: "plano", entidadeId: alunoId, motivo, logId }, [{
          tipo: "reabrirItem", descricao: `Reabriu ${nomeItem(ind, item)}`, antes: "concluído", depois: "aberto",
        }]),
        { tipo: "mesclar", colecao: "progresso", id: alunoId, dados: { alunoId, ultimaOperacao: { tipo: "log", id: logId }, itens: { [itemId]: { concluido: false, concluidoEm: apagarCampo() } } } },
        ...opsCancelarRevisoes(revisoes, itemId),
      ]);
      await servicos.estudo?.sincronizarRevisoes(alunoId).catch(() => {});
      return true;
    },

    observarPlanosAnteriores(alunoId, cb) {
      ctx.exigir("ver:aluno", { alunoId });
      return repo.observar("planosAnteriores", [["alunoId", "==", alunoId]], cb);
    },
  };
}

export const nomeItem = (ind, item) => (item.subtopicoId ? `${ind.nomeTopico(item.topicoId)} · ${ind.nomeSubtopico(item.subtopicoId)}` : ind.nomeTopico(item.topicoId));
export { idItem };
