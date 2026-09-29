/* Provas para simulado (provas/{id}): o moderador anexa o PDF da prova (por
   exemplo "ENEM 2018 · Dia 2 · Prova verde") e uma capa, que é um recorte do
   alto da primeira página. O aluno escolhe a prova, abre o PDF e depois
   registra o resultado como simulado, ligado à prova (simulado.provaId).
   No banco, só os dados; PDF e capa ficam no armazenamento de arquivos. */

import { carimbo, ErroDados, novoId } from "../data/contrato.js";
import { validarPdf } from "../core/validacao.js";
import { ErroValidacao, opsDeLog } from "./base.js";

const CAPA_MAX_MB = 5;

// mais recentes primeiro; no mesmo ano, pela ordem do título (Dia 1 antes do Dia 2)
const ordemDasProvas = (a, b) => (b.ano || 0) - (a.ano || 0) || String(a.titulo).localeCompare(String(b.titulo), "pt-BR", { numeric: true });

export function servicoProvas(ctx) {
  const { repo } = ctx;

  async function normalizar(d) {
    const ind = await ctx.indice();
    const erros = {};
    const r = {
      titulo: String(d.titulo || "").trim().slice(0, 120),
      vestibularId: d.vestibularId || null,
      ano: d.ano === "" || d.ano == null ? null : Number(d.ano),
      descricao: String(d.descricao || "").trim().slice(0, 500),
      programaIds: [...new Set((d.programaIds || []).filter((x) => typeof x === "string" && x))], // jornadas; vazio = todos
      publicado: d.publicado !== false,
    };
    if (!r.titulo) erros.titulo = "Dê um nome à prova, como “ENEM 2018 · Dia 2 · Prova verde”.";
    if (r.vestibularId && !ind.vestibular(r.vestibularId)) erros.vestibularId = "Vestibular inválido.";
    if (r.ano != null && (!Number.isInteger(r.ano) || r.ano < 1990 || r.ano > 2100)) erros.ano = "Ano inválido.";
    if (Object.keys(erros).length) throw new ErroValidacao(erros);
    return r;
  }

  function validarCapa(capa) {
    if (!/^image\/(jpeg|png|webp)$/.test(capa?.type || "")) throw new ErroValidacao({ capa: "A capa precisa ser uma imagem JPG, PNG ou WebP." });
    if (capa.size > CAPA_MAX_MB * 1024 * 1024) throw new ErroValidacao({ capa: `A capa passa de ${CAPA_MAX_MB} MB.` });
  }

  return {
    // aluno vê só as publicadas; o moderador vê todas
    observar(cb) {
      const filtros = ctx.usuario?.role === "moderador" ? [] : [["publicado", "==", true]];
      return repo.observar("provas", filtros, (l) => cb([...l].sort(ordemDasProvas)));
    },

    /* Cria (PDF obrigatório) ou edita (PDF e capa opcionais: trocam os atuais).
       capa: imagem (Blob) com o recorte da primeira página. */
    async salvar(dados, { arquivo, capa, aoEstado } = {}) {
      ctx.exigir("gerenciar:materiais");
      const avisar = (e, p) => aoEstado?.(e, p);
      avisar("validando");
      const r = await normalizar(dados);
      const atual = dados.id ? await repo.obter("provas", dados.id) : null;
      if (dados.id && !atual) throw new ErroDados("Prova não encontrada.", "nao-encontrado");
      if (!atual && !arquivo) throw new ErroValidacao({ arquivo: "Escolha o PDF da prova." });
      if (arquivo) {
        const ok = await validarPdf(arquivo);
        if (!ok.ok) throw new ErroValidacao({ arquivo: ok.erro });
      }
      if (capa) validarCapa(capa);

      const id = dados.id || novoId();
      const marca = Date.now();
      const enviados = [];
      try {
        let pdf = null;
        let imagem = null;
        if (arquivo) {
          avisar("enviando", 0);
          pdf = { ...(await repo.enviarArquivo(`provas/${id}/${marca}-prova.pdf`, arquivo, { aoProgredir: (p) => avisar("enviando", p * 0.9) })), nome: arquivo.name || "prova.pdf", tipo: "application/pdf" };
          enviados.push(pdf.ref);
        }
        if (capa) {
          imagem = await repo.enviarArquivo(`provas/${id}/${marca}-capa.jpg`, capa);
          enviados.push(imagem.ref);
        }
        avisar("salvando");
        await repo.lote([
          {
            tipo: atual ? "atualizar" : "criar", colecao: "provas", id,
            dados: {
              ...r, ...(pdf ? { arquivo: pdf } : {}), ...(imagem ? { capa: { ref: imagem.ref } } : !atual ? { capa: null } : {}),
              atualizadoEm: carimbo(), ...(atual ? {} : { criadoEm: carimbo(), autorId: ctx.usuario.uid }),
            },
          },
          ...opsDeLog(ctx, { entidade: "prova", entidadeId: id }, [{
            tipo: atual ? "editar" : "criar", descricao: `${atual ? "Editou" : "Publicou"} a prova ${r.titulo}`,
            antes: atual?.arquivo?.nome || null, depois: pdf?.nome || atual?.arquivo?.nome || null,
          }]),
        ]);
      } catch (e) {
        await Promise.all(enviados.map((ref) => repo.removerArquivo(ref).catch(() => {})));
        throw e;
      }
      // o que foi trocado sai do armazenamento
      if (arquivo && atual?.arquivo?.ref) await repo.removerArquivo(atual.arquivo.ref).catch(() => {});
      if (capa && atual?.capa?.ref) await repo.removerArquivo(atual.capa.ref).catch(() => {});
      avisar("pronto");
      return id;
    },

    async remover(id) {
      ctx.exigir("gerenciar:materiais");
      const atual = await repo.obter("provas", id);
      if (!atual) return false;
      await repo.lote([
        { tipo: "remover", colecao: "provas", id },
        ...opsDeLog(ctx, { entidade: "prova", entidadeId: id }, [{ tipo: "remover", descricao: `Apagou a prova ${atual.titulo}`, antes: atual.arquivo?.nome || null }]),
      ]);
      await Promise.all([atual.arquivo?.ref, atual.capa?.ref].filter(Boolean).map((ref) => repo.removerArquivo(ref).catch(() => {})));
      return true;
    },

    url: (ref) => repo.urlArquivo(ref),
  };
}
