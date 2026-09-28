/* questionService e mockExamService: registros de questões e de simulados.
   Registro é histórico: o aluno corrige ou apaga os próprios só nas primeiras
   24 h; depois, só o moderador. Toda correção e exclusão vai para o log com o
   antes e o depois. */

import { carimbo, ErroDados, novoId } from "../data/contrato.js";
import { validarPdf, validarQuestoes, validarSimulado } from "../core/validacao.js";
import { ErroValidacao, idLogRemocao, opsDeLog, recentesPrimeiro } from "./base.js";

const numero = (v) => (v === "" || v == null ? v : Number(v));
const resumoRegistro = (r) => `${r.acertos}/${r.total} (${r.erros} erros) em ${r.data}`;

function diferencas(antes, depois, campos) {
  const a = {}, d = {};
  campos.forEach((k) => {
    if (depois[k] === undefined || JSON.stringify(antes[k] ?? null) === JSON.stringify(depois[k] ?? null)) return;
    a[k] = antes[k] ?? null;
    d[k] = depois[k] ?? null;
  });
  return Object.keys(d).length ? { antes: a, depois: d } : null;
}

export function servicoQuestoes(ctx) {
  const { repo } = ctx;
  const CAMPOS = ["data", "materiaId", "topicoId", "subtopicoId", "vestibularId", "total", "acertos", "erros", "obs"];

  async function normalizar(d) {
    const ind = await ctx.indice();
    const r = {
      data: d.data, materiaId: d.materiaId || "", topicoId: d.topicoId || "", subtopicoId: d.subtopicoId || null,
      vestibularId: d.vestibularId || null, total: numero(d.total), acertos: numero(d.acertos), erros: numero(d.erros),
      obs: String(d.obs || "").trim().slice(0, 1000),
    };
    const v = validarQuestoes(r, ctx.hoje());
    if (r.materiaId && !v.erros.materiaId && !ind.materia(r.materiaId)) v.erros.materiaId = "Matéria inválida.";
    if (r.topicoId && !v.erros.topicoId && ind.topico(r.topicoId)?.materiaId !== r.materiaId) v.erros.topicoId = "O tópico não é dessa matéria.";
    if (r.subtopicoId && ind.subtopico(r.subtopicoId)?.topicoId !== r.topicoId) v.erros.subtopicoId = "O subtópico não é desse tópico.";
    if (r.vestibularId && !ind.vestibular(r.vestibularId)) v.erros.vestibularId = "Vestibular inválido.";
    if (Object.keys(v.erros).length) throw new ErroValidacao(v.erros);
    return r;
  }

  return {
    observar(alunoId, cb) {
      ctx.exigir("ver:aluno", { alunoId });
      return repo.observar("questoes", [["alunoId", "==", alunoId]], (l) => cb([...l].sort(recentesPrimeiro("data"))));
    },
    observarDesde(inicio, cb) {
      ctx.exigir("gerenciar:alunos");
      return repo.observar("questoes", inicio ? [["data", ">=", inicio]] : [], cb);
    },

    async registrar(alunoId, dados) {
      ctx.exigir("registrar:questoes", { alunoId });
      const r = await normalizar(dados);
      return repo.criar("questoes", { ...r, alunoId, criadoEm: carimbo(), criadoPor: ctx.usuario.uid });
    },

    async corrigir(id, dados, { motivo = "" } = {}) {
      const atual = await repo.obter("questoes", id);
      if (!atual) throw new ErroDados("Registro não encontrado.", "nao-encontrado");
      ctx.exigir("corrigir:registro", { registro: atual });
      const r = await normalizar({ ...atual, ...dados });
      const dif = diferencas(atual, r, CAMPOS);
      if (!dif) return false;
      const logId = novoId();
      await repo.lote([
        ...opsDeLog(ctx, { alunoId: atual.alunoId, entidade: "questoes", entidadeId: id, motivo, logId }, [{ tipo: "corrigir", descricao: "Corrigiu um registro de questões", ...dif }]),
        { tipo: "atualizar", colecao: "questoes", id, dados: { ...r, ultimoLogId: logId, atualizadoEm: carimbo(), atualizadoPor: ctx.usuario.uid } },
      ]);
      return true;
    },

    async remover(id, { motivo = "" } = {}) {
      const atual = await repo.obter("questoes", id);
      if (!atual) return false;
      ctx.exigir("corrigir:registro", { registro: atual });
      await repo.lote([
        { tipo: "remover", colecao: "questoes", id },
        ...opsDeLog(ctx, { alunoId: atual.alunoId, entidade: "questoes", entidadeId: id, motivo, logId: idLogRemocao(id) }, [{
          tipo: "remover", descricao: "Apagou um registro de questões", antes: resumoRegistro(atual), depois: null,
        }]),
      ]);
      return true;
    },
  };
}

export function servicoSimulados(ctx) {
  const { repo } = ctx;
  const CAMPOS = ["vestibularId", "nome", "ano", "cursoId", "data", "total", "acertos", "erros", "obs"];

  async function normalizar(d) {
    const ind = await ctx.indice();
    const r = {
      vestibularId: d.vestibularId || "", nome: String(d.nome || "").trim(), ano: d.ano === "" || d.ano == null ? null : Number(d.ano),
      cursoId: d.cursoId || null, data: d.data, total: numero(d.total), acertos: numero(d.acertos), erros: numero(d.erros),
      obs: String(d.obs || "").trim().slice(0, 1000),
    };
    const v = validarSimulado(r, ctx.hoje());
    if (r.vestibularId && !v.erros.vestibularId && !ind.vestibular(r.vestibularId)) v.erros.vestibularId = "Vestibular inválido.";
    if (r.cursoId && !ind.curso(r.cursoId)) v.erros.cursoId = "Curso inválido.";
    if (Object.keys(v.erros).length) throw new ErroValidacao(v.erros);
    return r;
  }

  async function subirPdf(alunoId, id, arquivo, aoProgredir) {
    const ok = await validarPdf(arquivo);
    if (!ok.ok) throw new ErroValidacao({ arquivo: ok.erro });
    const enviado = await repo.enviarArquivo(`simulados/${alunoId}/${id}.pdf`, arquivo, { aoProgredir });
    return { ...enviado, tipo: "application/pdf" };
  }

  return {
    observar(alunoId, cb) {
      ctx.exigir("ver:aluno", { alunoId });
      return repo.observar("simulados", [["alunoId", "==", alunoId]], (l) => cb([...l].sort(recentesPrimeiro("data"))));
    },
    observarTodos(cb) {
      ctx.exigir("gerenciar:alunos");
      return repo.observar("simulados", [], cb);
    },

    async registrar(alunoId, dados, { arquivo, aoProgredir } = {}) {
      ctx.exigir("registrar:simulado", { alunoId });
      const r = await normalizar(dados);
      const id = novoId();
      const pdf = arquivo ? await subirPdf(alunoId, id, arquivo, aoProgredir) : null;
      try {
        await repo.criar("simulados", { ...r, arquivo: pdf, alunoId, criadoEm: carimbo(), criadoPor: ctx.usuario.uid }, id);
      } catch (e) {
        if (pdf) await repo.removerArquivo(pdf.ref).catch(() => {});
        throw e;
      }
      return id;
    },

    async corrigir(id, dados, { motivo = "", arquivo, removerArquivo = false, aoProgredir } = {}) {
      const atual = await repo.obter("simulados", id);
      if (!atual) throw new ErroDados("Simulado não encontrado.", "nao-encontrado");
      ctx.exigir("corrigir:registro", { registro: atual });
      const r = await normalizar({ ...atual, ...dados });
      const dif = diferencas(atual, r, CAMPOS);
      let novoPdf;
      if (arquivo) novoPdf = await subirPdf(atual.alunoId, `${id}-${Date.now()}`, arquivo, aoProgredir);
      const trocaArquivo = arquivo || (removerArquivo && atual.arquivo);
      if (!dif && !trocaArquivo) return false;
      const entradas = [];
      if (dif) entradas.push({ tipo: "corrigir", descricao: `Corrigiu o simulado ${r.nome}`, ...dif });
      if (trocaArquivo) entradas.push({ tipo: "arquivo", descricao: arquivo ? "Trocou o PDF do simulado" : "Tirou o PDF do simulado", antes: atual.arquivo?.nome || null, depois: novoPdf?.nome || null });
      const logId = novoId();
      await repo.lote([
        ...opsDeLog(ctx, { alunoId: atual.alunoId, entidade: "simulado", entidadeId: id, motivo, logId }, entradas),
        { tipo: "atualizar", colecao: "simulados", id, dados: { ...r, ...(trocaArquivo ? { arquivo: novoPdf || null } : {}), ultimoLogId: logId, atualizadoEm: carimbo(), atualizadoPor: ctx.usuario.uid } },
      ]);
      if (trocaArquivo && atual.arquivo?.ref) await repo.removerArquivo(atual.arquivo.ref).catch(() => {});
      return true;
    },

    async remover(id, { motivo = "" } = {}) {
      const atual = await repo.obter("simulados", id);
      if (!atual) return false;
      ctx.exigir("corrigir:registro", { registro: atual });
      await repo.lote([
        { tipo: "remover", colecao: "simulados", id },
        ...opsDeLog(ctx, { alunoId: atual.alunoId, entidade: "simulado", entidadeId: id, motivo, logId: idLogRemocao(id) }, [{
          tipo: "remover", descricao: `Apagou o simulado ${atual.nome}`, antes: resumoRegistro(atual), depois: null,
        }]),
      ]);
      if (atual.arquivo?.ref) await repo.removerArquivo(atual.arquivo.ref).catch(() => {});
      return true;
    },

    url: (ref) => repo.urlArquivo(ref),
  };
}
