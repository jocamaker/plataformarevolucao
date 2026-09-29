/* Estudo do aluno: semana de metas, sessões de estudo e revisões.

   semanas/{alunoId}          semana atual (metas por dia + pendências)
   resumosSemana/{aluno_sem}  fechamento de cada semana (metas cumpridas e não cumpridas)
   sessoesEstudo/{id}         cada estudo feito: data, minutos, conteúdo, origem
   progresso/{alunoId}        minutos por item (somados na mesma gravação da sessão)
   revisoes/{id}              agendadas quando um item é concluído

   A sessão é o registro histórico; o progresso é o acumulado dela, gravado no
   mesmo lote (atômico). Desfazer uma meta apaga a sessão e desconta o
   progresso: o aluno só pode nas primeiras 24 h, e fica no histórico. */

import { apagarCampo, carimbo, ErroDados, incrementar, novoId } from "../data/contrato.js";
import { DISP_PADRAO, DIAS } from "../core/nucleo.js";
import { BLOCO_MIN, TEMPO_EXTRA, arredBloco, arredMeta } from "../core/blocos.js";
import {
  conteudoDaVez, distribuirMinutos, duracaoRevisao, estadoItem, itensDoPlano, materiasDoMotor, pesoDaMateria,
} from "../core/plano.js";
import { MOTOR_VERSAO, planoParaMotor } from "../core/migracao.js";
import {
  acharMeta, adicionarTempoExtra, aplicarReplanejamento, lerIdRevisaoAvulsa, marcarMeta, moverMeta,
  previaReplanejamento, reordenarNoDia, reorganizarSemana, revisoesAtrasadas, semanaVigente, sincronizarRevisoes,
} from "../core/semana.js";
import { ErroValidacao, idLogRemocao, opsDeLog, recentesPrimeiro } from "./base.js";
import { opRevisoesDoItem, opsCancelarRevisoes } from "./planos.js";

export function servicoEstudo(ctx) {
  const { repo } = ctx;

  async function contexto(alunoId) {
    const [bruto, progDoc, revisoes, doc, ind] = await Promise.all([
      repo.obter("planos", alunoId), repo.obter("progresso", alunoId),
      repo.listar("revisoes", [["alunoId", "==", alunoId]]), repo.obter("semanas", alunoId), ctx.indice(),
    ]);
    const prog = progDoc?.itens || {};
    const plano = planoParaMotor(bruto, ind, prog);
    const itens = plano ? itensDoPlano(plano, ind) : [];
    return {
      plano, prog, ind, itens, revisoes, doc,
      motor: {
        materias: plano ? materiasDoMotor(plano, ind, itens, prog) : [],
        disp: plano?.disponibilidade || DISP_PADRAO,
        inicio: plano?.inicio || null,
        revisoes,
        ordemMaterias: plano?.ordemMaterias || [],
        duracaoRevisao: (materiaId) => duracaoRevisao(pesoDaMateria(plano, materiaId)),
        conteudoDaVez: (materiaId) => conteudoDaVez(itens, prog, materiaId, ind),
      },
    };
  }

  const semId = (doc) => { if (!doc) return null; const { id: _i, alunoId: _a, atualizadaEm: _t, ...est } = doc; return est; };

  /* Semana gravada por um motor anterior (motorVersao diferente da atual): as metas
     abertas vão para durações válidas (estudo de 60 a 180 min, revisão de
     30 em 30), inclusive as de dias que já passaram e as pendências, e os
     dias de hoje em diante são refeitos uma vez (reorganizarSemana). Metas
     feitas e sessões ficam como estão: são histórico. */
  function semanaNoMotorAtual(est, c, hoje) {
    if (!est || est.motorVersao === MOTOR_VERSAO) return est;
    const valida = (m) => (m.done ? m : { ...m, minutos: m.tipo === "revisao" ? Math.max(BLOCO_MIN, arredBloco(m.minutos)) : arredMeta(m.minutos) });
    const metas = Object.fromEntries(DIAS.map((d) => [d.k, (est.metas?.[d.k] || []).map(valida)]));
    return reorganizarSemana({ ...est, metas, pendentes: (est.pendentes || []).map(valida), motorVersao: MOTOR_VERSAO }, c.motor, hoje);
  }

  // semana válida hoje (+ revisões em dia) e as operações para gravá-la
  function vigente(c, alunoId) {
    const hoje = ctx.hoje();
    const antiga = semId(c.doc);
    const convertida = semanaNoMotorAtual(antiga, c, hoje);
    const { est, mudou, resumo } = semanaVigente(convertida, c.motor, hoje);
    const sinc = sincronizarRevisoes(est, c.revisoes, hoje, c.motor.duracaoRevisao);
    const ops = [];
    if (mudou || sinc !== est || convertida !== antiga) ops.push(opSemana(alunoId, sinc));
    if (resumo) ops.push({ tipo: "definir", colecao: "resumosSemana", id: `${alunoId}_${resumo.semana}`, dados: { ...resumo, alunoId, criadoEm: carimbo() } });
    return { est: sinc, ops };
  }

  /* A tela mostra a semana gravada; o serviço, a semana válida agora. Se a
     meta pedida não está na válida (a gravada ficou para trás: virada de
     semana, motor novo, outra aba), grava a válida para a tela se atualizar
     e pede para repetir, em vez de só recusar. */
  async function semanaDesatualizada(alunoId, est, ops) {
    await repo.lote([...ops.filter((o) => o.colecao !== "semanas"), opSemana(alunoId, est)]);
    throw new ErroDados("A sua semana foi atualizada agora. Tente de novo.", "semana-atualizada");
  }

  const opSemana = (alunoId, est) => ({ tipo: "definir", colecao: "semanas", id: alunoId, dados: { ...est, alunoId, atualizadaEm: carimbo() } });

  /* Minutos numa sessão → partes por item, com as conclusões que ela provoca
     (progresso e revisões no mesmo lote). */
  function efeitosNoProgresso(c, alunoId, partes, hoje, sessaoId) {
    const itensPatch = {};
    const revisoesOps = [];
    const concluidos = [];
    const partesFinais = partes.map((p) => {
      const item = c.itens.find((it) => it.itemId === p.itemId);
      const antes = item ? estadoItem(item, c.prog) : null;
      const reaberto = c.prog[p.itemId]?.concluido === false;
      const concluiu = !!item && !antes.concluido && !reaberto && antes.minutos + p.minutos >= item.duracao;
      itensPatch[p.itemId] = { minutos: incrementar(p.minutos), ...(concluiu ? { concluidoEm: hoje } : {}) };
      if (concluiu) {
        concluidos.push(p.itemId);
        const op = opRevisoesDoItem(c.plano, item, alunoId, hoje, "sessao");
        if (op) revisoesOps.push(op);
      }
      return { itemId: p.itemId, minutos: p.minutos, concluiu };
    });
    const ops = partes.length ? [{ tipo: "mesclar", colecao: "progresso", id: alunoId, dados: { alunoId, ultimaOperacao: { tipo: "sessao", id: sessaoId }, itens: itensPatch } }, ...revisoesOps] : [];
    return { ops, partes: partesFinais, concluidos, revisoesCriadas: revisoesOps.map((o) => o.id), novasRevisoes: revisoesOps.map((o) => ({ id: o.id, ...o.dados })) };
  }

  // desfaz o efeito de uma sessão no progresso e nas revisões que ela criou
  function desfazerProgresso(c, alunoId, sessao) {
    const itensPatch = {};
    const ops = [];
    (sessao.partes || []).forEach((p) => {
      itensPatch[p.itemId] = { minutos: incrementar(-p.minutos) };
      if (p.concluiu && c.prog[p.itemId]?.concluido !== true) {
        itensPatch[p.itemId].concluidoEm = apagarCampo();
        ops.push(...opsCancelarRevisoes(c.revisoes, p.itemId, { soIds: sessao.revisoesCriadas || [] }));
      }
    });
    if (Object.keys(itensPatch).length) ops.unshift({ tipo: "mesclar", colecao: "progresso", id: alunoId, dados: { alunoId, ultimaOperacao: { tipo: "remocao", id: sessao.id }, itens: itensPatch } });
    return ops;
  }

  function opStatusRevisao(c, revisaoId, dia, status, extra = {}) {
    const r = c.revisoes.find((x) => x.id === revisaoId);
    if (!r) return null;
    const sessoes = r.sessoes.map((s) => {
      if (s.dia !== dia) return s;
      const { realizadaEm: _r, sessaoId: _s, ignoradaEm: _i, ...base } = s;
      return { ...base, status, ...extra };
    });
    r.sessoes = sessoes; // a cópia local acompanha, para sincronizar a semana
    return { tipo: "atualizar", colecao: "revisoes", id: revisaoId, dados: { sessoes } };
  }

  const docSessao = (alunoId, dados) => ({
    alunoId, data: ctx.hoje(), criadoEm: carimbo(), criadoPor: ctx.usuario.uid, revisoesCriadas: [], ...dados,
  });

  async function concluirMeta(alunoId, c, est, meta, ops) {
    const hoje = ctx.hoje();
    const sessaoId = novoId();
    let efeitos = { ops: [], partes: [], concluidos: [], revisoesCriadas: [], novasRevisoes: [] };
    let conteudo;
    if (meta.tipo === "revisao") {
      conteudo = { topicoId: meta.topicoId, subtopicoId: meta.subtopicoId, itemId: meta.itemId };
      const op = opStatusRevisao(c, meta.revisaoId, meta.dia, "realizada", { realizadaEm: hoje, sessaoId });
      if (op) ops.push(op);
    } else {
      const partes = distribuirMinutos(c.itens, c.prog, meta.materiaId, meta.minutos);
      efeitos = efeitosNoProgresso(c, alunoId, partes, hoje, sessaoId);
      const primeiro = c.itens.find((it) => it.itemId === partes[0]?.itemId);
      conteudo = primeiro ? { topicoId: primeiro.topicoId, subtopicoId: primeiro.subtopicoId, itemId: primeiro.itemId } : {};
    }
    ops.push({
      tipo: "criar", colecao: "sessoesEstudo", id: sessaoId,
      dados: docSessao(alunoId, {
        minutos: meta.minutos, materiaId: meta.materiaId, topicoId: conteudo.topicoId || null, subtopicoId: conteudo.subtopicoId || null,
        itemId: conteudo.itemId || null, partes: efeitos.partes, revisoesCriadas: efeitos.revisoesCriadas,
        origem: meta.tipo === "revisao" ? "revisao" : meta.extra ? "extra" : "meta", metaId: meta.id, semana: est.chave,
        ...(meta.revisaoId ? { revisaoId: meta.revisaoId, revisaoDia: meta.dia } : {}),
      }),
    }, ...efeitos.ops);
    if (!meta.avulsa) marcarMeta(est, meta.id, { done: true, hojeIso: hoje, sessaoId, conteudo });
    const final = sincronizarRevisoes(est, [...c.revisoes, ...efeitos.novasRevisoes], hoje, c.motor.duracaoRevisao);
    ops.push(opSemana(alunoId, final));
    await repo.lote(ops);
    return { feita: true, sessaoId, concluidos: efeitos.concluidos, revisoesCriadas: efeitos.revisoesCriadas.length };
  }

  async function desfazerMeta(alunoId, c, est, meta, ops) {
    const sessao = meta.sessaoId ? await repo.obter("sessoesEstudo", meta.sessaoId) : null;
    if (sessao) {
      ctx.exigir("corrigir:registro", { registro: sessao });
      ops.push({ tipo: "remover", colecao: "sessoesEstudo", id: sessao.id }, ...desfazerProgresso(c, alunoId, sessao));
    }
    if (meta.tipo === "revisao") {
      const op = opStatusRevisao(c, meta.revisaoId, meta.dia, "agendada");
      if (op) ops.push(op);
    }
    if (!meta.avulsa) marcarMeta(est, meta.id, { done: false });
    const revisoesDepois = c.revisoes.filter((r) => !ops.some((o) => o.tipo === "remover" && o.colecao === "revisoes" && o.id === r.id));
    ops.push(opSemana(alunoId, sincronizarRevisoes(est, revisoesDepois, ctx.hoje(), c.motor.duracaoRevisao)));
    ops.push(...opsDeLog(ctx, { alunoId, entidade: "estudo", entidadeId: sessao?.id || meta.id, ...(sessao ? { logId: idLogRemocao(sessao.id) } : {}) }, [{
      tipo: "desfazerMeta", descricao: `Desmarcou uma meta de ${c.ind.nomeMateria(meta.materiaId)} (${meta.minutos} min)`, antes: "feita", depois: "aberta",
    }]));
    await repo.lote(ops);
    return { feita: false };
  }

  return {
    observarSemana(alunoId, cb) {
      ctx.exigir("ver:aluno", { alunoId });
      return repo.observarDoc("semanas", alunoId, cb);
    },
    observarSessoes(alunoId, cb) {
      ctx.exigir("ver:aluno", { alunoId });
      return repo.observar("sessoesEstudo", [["alunoId", "==", alunoId]], (l) => cb([...l].sort(recentesPrimeiro("data"))));
    },
    observarRevisoes(alunoId, cb) {
      ctx.exigir("ver:aluno", { alunoId });
      return repo.observar("revisoes", [["alunoId", "==", alunoId]], cb);
    },
    observarResumosSemana(alunoId, cb) {
      ctx.exigir("ver:aluno", { alunoId });
      return repo.observar("resumosSemana", [["alunoId", "==", alunoId]], (l) => cb([...l].sort(recentesPrimeiro("semana"))));
    },
    // moderador: sessões de todos a partir de uma data (painel da turma)
    observarSessoesDesde(inicio, cb) {
      ctx.exigir("gerenciar:alunos");
      return repo.observar("sessoesEstudo", [["data", ">=", inicio]], cb);
    },

    /* Semana válida hoje, gravando a virada se preciso. Só grava quem pode
       registrar estudo desse aluno; o moderador também pode. */
    async garantirSemana(alunoId) {
      ctx.exigir("registrar:estudo", { alunoId });
      const c = await contexto(alunoId);
      if (!c.plano) return null;
      const { est, ops } = vigente(c, alunoId);
      if (ops.length) await repo.lote(ops);
      return est;
    },

    async alternarMeta(alunoId, metaId) {
      ctx.exigir("registrar:estudo", { alunoId });
      const c = await contexto(alunoId);
      if (!c.plano) throw new ErroDados("Sem plano de estudos.", "sem-plano");
      const { est: vig, ops } = vigente(c, alunoId);
      const est = structuredClone(vig);
      const avulsa = lerIdRevisaoAvulsa(metaId);
      const meta = avulsa
        ? revisoesAtrasadas(c.revisoes, ctx.hoje(), est, c.motor.duracaoRevisao).find((m) => m.id === metaId)
        : acharMeta(est, metaId)?.meta;
      if (!meta) return semanaDesatualizada(alunoId, est, ops);
      return meta.done ? desfazerMeta(alunoId, c, est, meta, ops) : concluirMeta(alunoId, c, est, meta, ops);
    },

    /* Estudo fora das metas: soma no conteúdo informado (subtópico, tópico ou
       o da vez na matéria). */
    async registrarEstudoFora(alunoId, { materiaId, topicoId, subtopicoId, minutos, data }) {
      ctx.exigir("registrar:estudo", { alunoId });
      const c = await contexto(alunoId);
      const hoje = ctx.hoje();
      const erros = {};
      const min = Number(minutos);
      if (!materiaId || !c.ind.materia(materiaId)) erros.materiaId = "Escolha a matéria.";
      if (topicoId && c.ind.topico(topicoId)?.materiaId !== materiaId) erros.topicoId = "Tópico não é dessa matéria.";
      if (subtopicoId && c.ind.subtopico(subtopicoId)?.topicoId !== topicoId) erros.subtopicoId = "Subtópico não é desse tópico.";
      if (!Number.isInteger(min) || min < 5 || min > 720) erros.minutos = "Minutos: inteiro entre 5 e 720.";
      const dia = data || hoje;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dia) || dia > hoje) erros.data = "A data não pode ser no futuro.";
      if (Object.keys(erros).length) throw new ErroValidacao(erros);

      const alvo = c.itens.filter((it) => it.materiaId === materiaId && (!topicoId || it.topicoId === topicoId) && (!subtopicoId || it.subtopicoId === subtopicoId));
      const partes = subtopicoId || topicoId
        ? distribuirMinutos(alvo.map((it) => ({ ...it, materiaId: "_" })), c.prog, "_", min)
        : distribuirMinutos(c.itens, c.prog, materiaId, min);
      const sessaoId = novoId();
      const efeitos = efeitosNoProgresso(c, alunoId, partes, dia, sessaoId);
      const primeiro = c.itens.find((it) => it.itemId === partes[0]?.itemId);
      const ops = [{
        tipo: "criar", colecao: "sessoesEstudo", id: sessaoId,
        dados: docSessao(alunoId, {
          data: dia, minutos: min, materiaId, topicoId: topicoId || primeiro?.topicoId || null, subtopicoId: subtopicoId || primeiro?.subtopicoId || null,
          itemId: primeiro?.itemId || null, partes: efeitos.partes, revisoesCriadas: efeitos.revisoesCriadas, origem: "fora",
        }),
      }, ...efeitos.ops];
      if (c.doc && efeitos.novasRevisoes.length) {
        const est = semId(c.doc);
        const sinc = sincronizarRevisoes(est, [...c.revisoes, ...efeitos.novasRevisoes], hoje, c.motor.duracaoRevisao);
        if (sinc !== est) ops.push(opSemana(alunoId, sinc));
      }
      await repo.lote(ops);
      return { sessaoId, concluidos: efeitos.concluidos };
    },

    // Apaga uma sessão (a de uma meta da semana desmarca a meta). Aluno: 24 h.
    async removerSessao(sessaoId, { motivo = "" } = {}) {
      const sessao = await repo.obter("sessoesEstudo", sessaoId);
      if (!sessao) return false;
      ctx.exigir("corrigir:registro", { registro: sessao });
      const c = await contexto(sessao.alunoId);
      const est = c.doc ? structuredClone(semId(c.doc)) : null;
      const naSemana = est && sessao.metaId ? acharMeta(est, sessao.metaId)?.meta : null;
      if (naSemana?.done && naSemana.sessaoId === sessaoId) return desfazerMeta(sessao.alunoId, c, est, naSemana, []);
      const avulsa = lerIdRevisaoAvulsa(sessao.metaId);
      if (avulsa && est) {
        return desfazerMeta(sessao.alunoId, c, est, {
          id: sessao.metaId, tipo: "revisao", avulsa: true, done: true, sessaoId, revisaoId: avulsa.revisaoId, dia: avulsa.dia,
          materiaId: sessao.materiaId, minutos: sessao.minutos,
        }, []);
      }
      const ops = [{ tipo: "remover", colecao: "sessoesEstudo", id: sessaoId }, ...desfazerProgresso(c, sessao.alunoId, sessao)];
      if (sessao.revisaoId) {
        const op = opStatusRevisao(c, sessao.revisaoId, sessao.revisaoDia, "agendada");
        if (op) ops.push(op);
      }
      ops.push(...opsDeLog(ctx, { alunoId: sessao.alunoId, entidade: "estudo", entidadeId: sessaoId, motivo, logId: idLogRemocao(sessaoId) }, [{
        tipo: "removerSessao", descricao: `Apagou um estudo de ${c.ind.nomeMateria(sessao.materiaId)} (${sessao.minutos} min, ${sessao.data})`, antes: `${sessao.minutos} min`, depois: null,
      }]));
      await repo.lote(ops);
      return true;
    },

    /* "Preciso de mais tempo": 60, 90 ou 120 min no próximo dia com folga. */
    async tempoExtra(alunoId, { materiaId, topicoId, subtopicoId, itemId, minutos }) {
      ctx.exigir("registrar:estudo", { alunoId });
      const min = Number(minutos);
      if (!TEMPO_EXTRA.includes(min)) throw new ErroValidacao({ minutos: "Escolha 60, 90 ou 120 min." });
      const c = await contexto(alunoId);
      const { est: vig } = vigente(c, alunoId);
      const est = structuredClone(vig);
      const destino = adicionarTempoExtra(est, c.motor, { materiaId, topicoId, subtopicoId, itemId, minutos: min }, ctx.hoje(), novoId().slice(0, 8));
      await repo.lote([opSemana(alunoId, est)]);
      return destino;
    },

    /* Leva uma meta aberta para qualquer dia da semana atual, de hoje em
       diante (permissão moverMetas). Revisão: o dia da sessão muda no mesmo
       lote, para a sincronização não devolvê-la ao dia original. Sem log e
       sem aviso ao moderador. */
    async moverMeta(alunoId, metaId, para) {
      ctx.exigir("registrar:estudo", { alunoId });
      const c = await contexto(alunoId);
      if (!c.plano) throw new ErroDados("Sem plano de estudos.", "sem-plano");
      ctx.exigir("alterar:plano", { alunoId, plano: c.plano, permissao: "moverMetas" });
      const { est: vig, ops: opsVigente } = vigente(c, alunoId);
      if (!acharMeta(vig, metaId)) return semanaDesatualizada(alunoId, vig, opsVigente);
      const est = structuredClone(vig);
      const r = moverMeta(est, metaId, para, ctx.hoje());
      if (!r.ok) throw new ErroValidacao({ dia: r.motivo });
      const ops = [...opsVigente.filter((o) => o.colecao !== "semanas"), opSemana(alunoId, est)];
      if (r.revisao) {
        const rev = c.revisoes.find((x) => x.id === r.revisao.revisaoId);
        if (rev) {
          const sessoes = rev.sessoes.map((x) => (x.dia === r.revisao.de && x.status === "agendada" ? { ...x, dia: r.revisao.para } : x));
          ops.push({ tipo: "atualizar", colecao: "revisoes", id: rev.id, dados: { sessoes } });
        }
      }
      await repo.lote(ops);
      return true;
    },

    /* Muda a posição de uma meta dentro do dia (permissão ordemMaterias). */
    async reordenarMeta(alunoId, dia, metaId, passo) {
      ctx.exigir("registrar:estudo", { alunoId });
      const c = await contexto(alunoId);
      if (!c.plano) throw new ErroDados("Sem plano de estudos.", "sem-plano");
      ctx.exigir("alterar:plano", { alunoId, plano: c.plano, permissao: "ordemMaterias" });
      const { est: vig, ops: opsVigente } = vigente(c, alunoId);
      if (!acharMeta(vig, metaId)) return semanaDesatualizada(alunoId, vig, opsVigente);
      const est = structuredClone(vig);
      if (!DIAS.some((d) => d.k === dia) || !reordenarNoDia(est, dia, metaId, passo)) return false;
      await repo.lote([opSemana(alunoId, est)]);
      return true;
    },

    // "Voltar à distribuição automática": refaz de hoje em diante
    async reorganizar(alunoId) {
      ctx.exigir("registrar:estudo", { alunoId });
      const c = await contexto(alunoId);
      if (!c.plano) return null;
      const { est: vig } = vigente(c, alunoId);
      const est = sincronizarRevisoes(reorganizarSemana(vig, c.motor, ctx.hoje()), c.revisoes, ctx.hoje(), c.motor.duracaoRevisao);
      await repo.lote([opSemana(alunoId, est)]);
      return est;
    },

    async previaReplanejamento(alunoId) {
      ctx.exigir("registrar:estudo", { alunoId });
      const c = await contexto(alunoId);
      if (!c.plano) throw new ErroDados("Sem plano de estudos.", "sem-plano");
      const { est } = vigente(c, alunoId);
      return { chave: est.chave, ...previaReplanejamento(est, c.motor, ctx.hoje()) };
    },

    async aplicarReplanejamento(alunoId, previa) {
      ctx.exigir("registrar:estudo", { alunoId });
      const c = await contexto(alunoId);
      const { est: vig } = vigente(c, alunoId);
      if (vig.chave !== previa.chave) throw new ErroDados("A semana virou desde a prévia. Gere de novo.", "semana-mudou");
      const est = sincronizarRevisoes(aplicarReplanejamento(vig, previa, ctx.hoje()), c.revisoes, ctx.hoje(), c.motor.duracaoRevisao);
      const { naoCouberam = [], totalRealocado = 0 } = previa.resumo;
      await repo.lote([
        opSemana(alunoId, est),
        ...opsDeLog(ctx, { alunoId, entidade: "semana", entidadeId: est.chave }, [{
          tipo: "replanejar",
          descricao: `Replanejou a semana: ${totalRealocado} min redistribuídos${naoCouberam.length ? `, ${naoCouberam.reduce((s, x) => s + x.minutos, 0)} min sem espaço` : ""}`,
          antes: null, depois: { totalRealocado, semEspaco: naoCouberam.reduce((s, x) => s + x.minutos, 0) },
        }]),
      ]);
      return est;
    },

    // revisão: realizada à parte (sem meta) ou ignorada
    async marcarRevisao(alunoId, revisaoId, dia, status) {
      ctx.exigir("registrar:estudo", { alunoId });
      if (!["agendada", "ignorada"].includes(status)) throw new Error("Status de revisão inválido.");
      const c = await contexto(alunoId);
      const op = opStatusRevisao(c, revisaoId, dia, status, status === "ignorada" ? { ignoradaEm: ctx.hoje() } : {});
      if (!op) return false;
      const ops = [op];
      if (c.doc) {
        const est = semId(c.doc);
        const sinc = sincronizarRevisoes(est, c.revisoes, ctx.hoje(), c.motor.duracaoRevisao);
        if (sinc !== est) ops.push(opSemana(alunoId, sinc));
      }
      await repo.lote(ops);
      return true;
    },

    // chamados pelo serviço de planos
    async aposMudarPlano(alunoId) {
      const c = await contexto(alunoId);
      if (!c.plano || !c.doc) return;
      const { est: vig, ops } = vigente(c, alunoId);
      const est = sincronizarRevisoes(reorganizarSemana(vig, c.motor, ctx.hoje()), c.revisoes, ctx.hoje(), c.motor.duracaoRevisao);
      await repo.lote([...ops.filter((o) => o.colecao !== "semanas"), opSemana(alunoId, est)]);
    },
    async sincronizarRevisoes(alunoId) {
      const c = await contexto(alunoId);
      if (!c.doc) return;
      const est = semId(c.doc);
      const sinc = sincronizarRevisoes(est, c.revisoes, ctx.hoje(), c.motor.duracaoRevisao);
      if (sinc !== est) await repo.lote([opSemana(alunoId, sinc)]);
    },
  };
}
