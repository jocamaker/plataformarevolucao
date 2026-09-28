/* materialService: PDFs no armazenamento de arquivos; no banco, só metadados.
   Estados do envio (para a tela): validando → enviando (progresso) → salvando → pronto | erro. */

import { carimbo, ErroDados, novoId } from "../data/contrato.js";
import { validarPdf } from "../core/validacao.js";
import { ErroValidacao, opsDeLog, recentesPrimeiro } from "./base.js";

export const TIPOS_MATERIAL = [
  { id: "apostila", nome: "Apostila" },
  { id: "resumo", nome: "Resumo" },
  { id: "lista", nome: "Lista de exercícios" },
  { id: "teoria", nome: "Teoria" },
  { id: "revisao", nome: "Revisão" },
  { id: "prova", nome: "Prova anterior" },
  { id: "simulado", nome: "Simulado" },
  { id: "outro", nome: "Outro" },
];
export const nomeTipoMaterial = (id) => TIPOS_MATERIAL.find((t) => t.id === id)?.nome || "Outro";

const nomeArquivoSeguro = (nome = "arquivo.pdf") =>
  nome.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.-]+/g, "-").replace(/-+/g, "-").slice(-80) || "arquivo.pdf";

export function servicoMateriais(ctx) {
  const { repo } = ctx;

  async function normalizar(d) {
    const ind = await ctx.indice();
    const erros = {};
    const r = {
      titulo: String(d.titulo || "").trim(), descricao: String(d.descricao || "").trim().slice(0, 2000),
      materiaId: d.materiaId || null, topicoId: d.topicoId || null, subtopicoId: d.subtopicoId || null,
      programaIds: [...new Set((d.programaIds || []).filter((x) => typeof x === "string" && x))], // jornadas; vazio = todos
      tipo: d.tipo || "outro", data: d.data || ctx.hoje(),
      tags: [...new Set((Array.isArray(d.tags) ? d.tags : String(d.tags || "").split(","))
        .map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 20),
      publicado: d.publicado !== false,
    };
    if (!r.titulo) erros.titulo = "Dê um título ao material.";
    if (!TIPOS_MATERIAL.some((t) => t.id === r.tipo)) erros.tipo = "Tipo inválido.";
    if (r.materiaId && !ind.materia(r.materiaId)) erros.materiaId = "Matéria inválida.";
    if (r.topicoId && ind.topico(r.topicoId)?.materiaId !== r.materiaId) erros.topicoId = "O tópico não é dessa matéria.";
    if (r.subtopicoId && ind.subtopico(r.subtopicoId)?.topicoId !== r.topicoId) erros.subtopicoId = "O subtópico não é desse tópico.";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.data)) erros.data = "Data inválida.";
    if (Object.keys(erros).length) throw new ErroValidacao(erros);
    return r;
  }

  return {
    // aluno vê só os publicados; o moderador vê todos
    observar(cb) {
      const filtros = ctx.usuario?.role === "moderador" ? [] : [["publicado", "==", true]];
      return repo.observar("materiais", filtros, (l) => cb([...l].sort(recentesPrimeiro("data"))));
    },

    /* Cria (arquivo obrigatório) ou edita (arquivo opcional: troca o PDF).
       aoEstado(estado, progresso) acompanha o envio. */
    async salvar(dados, { arquivo, aoEstado } = {}) {
      ctx.exigir("gerenciar:materiais");
      const avisar = (e, p) => aoEstado?.(e, p);
      avisar("validando");
      const r = await normalizar(dados);
      const atual = dados.id ? await repo.obter("materiais", dados.id) : null;
      if (dados.id && !atual) throw new ErroDados("Material não encontrado.", "nao-encontrado");
      if (!atual && !arquivo) throw new ErroValidacao({ arquivo: "Escolha o PDF." });
      if (arquivo) {
        const ok = await validarPdf(arquivo);
        if (!ok.ok) throw new ErroValidacao({ arquivo: ok.erro });
      }
      const id = dados.id || novoId();
      let enviado = null;
      if (arquivo) {
        avisar("enviando", 0);
        enviado = await repo.enviarArquivo(`materiais/${id}/${Date.now()}-${nomeArquivoSeguro(arquivo.name)}`, arquivo, { aoProgredir: (p) => avisar("enviando", p) });
        enviado = { ...enviado, tipo: "application/pdf" };
      }
      avisar("salvando");
      try {
        await repo.lote([
          {
            tipo: atual ? "atualizar" : "criar", colecao: "materiais", id,
            dados: { ...r, ...(enviado ? { arquivo: enviado } : {}), atualizadoEm: carimbo(), ...(atual ? {} : { criadoEm: carimbo(), autorId: ctx.usuario.uid }) },
          },
          ...opsDeLog(ctx, { entidade: "material", entidadeId: id }, [{
            tipo: atual ? "editar" : "criar", descricao: `${atual ? "Editou" : "Publicou"} o material ${r.titulo}`,
            antes: atual?.arquivo?.nome || null, depois: enviado?.nome || atual?.arquivo?.nome || null,
          }]),
        ]);
      } catch (e) {
        if (enviado) await repo.removerArquivo(enviado.ref).catch(() => {});
        throw e;
      }
      if (enviado && atual?.arquivo?.ref) await repo.removerArquivo(atual.arquivo.ref).catch(() => {});
      avisar("pronto");
      return id;
    },

    async remover(id) {
      ctx.exigir("gerenciar:materiais");
      const atual = await repo.obter("materiais", id);
      if (!atual) return false;
      await repo.lote([
        { tipo: "remover", colecao: "materiais", id },
        ...opsDeLog(ctx, { entidade: "material", entidadeId: id }, [{ tipo: "remover", descricao: `Apagou o material ${atual.titulo}`, antes: atual.arquivo?.nome || null }]),
      ]);
      if (atual.arquivo?.ref) await repo.removerArquivo(atual.arquivo.ref).catch(() => {});
      return true;
    },

    url: (ref) => repo.urlArquivo(ref),
  };
}
