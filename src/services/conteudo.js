/* Conteúdo mantido pelo moderador: cursos em vídeo (playlists), redação
   (devolutivas), textos personalizados e página de boas-vindas; e o
   histórico de alterações (logs). */

import { carimbo, ErroDados, novoId } from "../data/contrato.js";
import { PAPEIS } from "../core/permissoes.js";
import { ErroValidacao, opsDeLog, recentesPrimeiro } from "./base.js";
import { mediaDoTema, normalizarTema } from "../redacao.js";
import { playlistVisivelPara } from "../midia.js";
import { validarPdf } from "../core/validacao.js";

export { playlistVisivelPara };

const semId = ({ id: _i, ...resto }) => resto;

/* ---------- Cursos em vídeo ---------- */

export function servicoPlaylists(ctx) {
  const { repo } = ctx;
  return {
    observar(cb) {
      const filtros = ctx.usuario?.role === PAPEIS.MODERADOR ? [] : [["publicada", "==", true]];
      return repo.observar("playlists", filtros, (l) => cb([...l].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0) || String(a.titulo).localeCompare(String(b.titulo), "pt-BR"))));
    },

    // grava a playlist inteira (os vídeos ficam dentro dela)
    async salvar(playlist) {
      ctx.exigir("gerenciar:playlists");
      if (!String(playlist.titulo || "").trim()) throw new ErroValidacao({ titulo: "Dê um título à playlist." });
      const id = playlist.id || novoId();
      const doc = {
        ...semId(playlist), titulo: playlist.titulo.trim(), videos: playlist.videos || [],
        programaIds: playlist.programaIds || [], // jornadas; vazio = todos
        materiaId: playlist.materiaId || null, topicoId: playlist.topicoId || null,
        publicada: !!playlist.publicada, atualizadaEm: carimbo(),
      };
      await repo.definir("playlists", id, doc);
      return id;
    },

    async remover(id) {
      ctx.exigir("gerenciar:playlists");
      const pl = await repo.obter("playlists", id);
      if (!pl) return;
      await repo.lote([
        { tipo: "remover", colecao: "playlists", id },
        ...opsDeLog(ctx, { entidade: "playlist", entidadeId: id }, [{ tipo: "remover", descricao: `Apagou a playlist ${pl.titulo}`, antes: `${(pl.videos || []).length} vídeos` }]),
      ]);
      const refs = [pl.capa, ...(pl.videos || []).map((v) => v.arquivo)].filter((r) => r && !/^https?:/.test(r));
      await Promise.all(refs.map((r) => repo.removerArquivo(r).catch(() => {})));
    },

    // arquivo de vídeo ou capa → referência no armazenamento
    async enviarArquivo(playlistId, blob, { aoProgredir, tipo = "video" } = {}) {
      ctx.exigir("gerenciar:playlists");
      const r = await repo.enviarArquivo(`playlists/${playlistId}/${tipo}-${novoId()}`, blob, { aoProgredir });
      return r.ref;
    },
    removerArquivo: (ref) => (ref && !/^https?:/.test(ref) ? repo.removerArquivo(ref).catch(() => {}) : null),
    url: (ref) => repo.urlArquivo(ref),

    observarAssistidos(alunoId, cb) {
      ctx.exigir("ver:aluno", { alunoId });
      return repo.observarDoc("progressoVideos", alunoId, (d) => cb(d?.videos || {}));
    },
    async marcarAssistido(alunoId, videoId, assistido) {
      ctx.exigir("registrar:estudo", { alunoId });
      await repo.mesclar("progressoVideos", alunoId, { alunoId, videos: { [videoId]: !!assistido } });
    },
  };
}

/* ---------- Redação ---------- */

export function servicoRedacao(ctx) {
  const { repo } = ctx;
  return {
    // aluno: só as enviadas; moderador: todas (ou de um aluno)
    observar(alunoId, cb) {
      if (ctx.usuario?.role === PAPEIS.MODERADOR) {
        return repo.observar("devolutivas", alunoId ? [["alunoId", "==", alunoId]] : [], (l) => cb([...l].sort(recentesPrimeiro("recebidaEm"))));
      }
      ctx.exigir("ver:aluno", { alunoId });
      return repo.observar("devolutivas", [["alunoId", "==", alunoId], ["status", "==", "enviada"]], (l) => cb([...l].sort(recentesPrimeiro("enviadaEm"))));
    },

    async salvar(devolutiva) {
      ctx.exigir("gerenciar:redacao");
      const erros = {};
      if (!devolutiva.alunoId) erros.alunoId = "Escolha o aluno.";
      if (!String(devolutiva.tema || "").trim()) erros.tema = "Informe o tema.";
      if (Object.keys(erros).length) throw new ErroValidacao(erros);
      const id = devolutiva.id || novoId();
      const atual = devolutiva.id ? await repo.obter("devolutivas", id) : null;
      const doc = { ...semId(devolutiva), tema: devolutiva.tema.trim(), atualizadaEm: carimbo() };
      if (doc.status === "enviada" && atual?.status !== "enviada") doc.lida = false;
      // média do tema (só entre devolutivas enviadas): gravada em cada uma,
      // para o aluno ver sem ter acesso às redações dos outros
      const temas = new Set([doc.tema, atual?.tema].filter(Boolean).map(normalizarTema));
      const todas = (await repo.listar("devolutivas")).filter((d) => d.id !== id).concat([{ ...doc, id }]);
      const opsMedia = todas
        .filter((d) => temas.has(normalizarTema(d.tema)) && d.id !== id)
        .map((d) => ({ tipo: "atualizar", colecao: "devolutivas", id: d.id, dados: { mediaTema: d.status === "enviada" ? mediaDoTema(todas, d) : null } }));
      doc.mediaTema = doc.status === "enviada" ? mediaDoTema(todas, { ...doc, id }) : null;
      await repo.lote([
        ...opsMedia,
        { tipo: "definir", colecao: "devolutivas", id, dados: doc },
        ...(doc.status === "enviada" && atual?.status !== "enviada"
          ? opsDeLog(ctx, { alunoId: doc.alunoId, entidade: "redacao", entidadeId: id }, [{ tipo: "enviar", descricao: `Enviou a devolutiva "${doc.tema}"` }])
          : []),
      ]);
      return id;
    },

    async remover(id) {
      ctx.exigir("gerenciar:redacao");
      const d = await repo.obter("devolutivas", id);
      if (!d) return;
      await repo.lote([
        { tipo: "remover", colecao: "devolutivas", id },
        ...opsDeLog(ctx, { alunoId: d.alunoId, entidade: "redacao", entidadeId: id }, [{ tipo: "remover", descricao: `Apagou a devolutiva "${d.tema}"`, antes: d.status }]),
      ]);
      const refs = [d.foto, ...(d.anexos || []).map((a) => a.ref)].filter((r) => r && !/^https?:|^\.|^\//.test(r));
      await Promise.all(refs.map((r) => repo.removerArquivo(r).catch(() => {})));
    },

    async enviarFoto(alunoId, blob) {
      ctx.exigir("gerenciar:redacao");
      const r = await repo.enviarArquivo(`redacoes/${alunoId}/${novoId()}.jpg`, blob);
      return r.ref;
    },
    // texto anexado à devolutiva (PDF ou imagem já comprimida), na pasta do aluno
    async enviarAnexo(alunoId, arquivo, nome = arquivo?.name) {
      ctx.exigir("gerenciar:redacao");
      const ehPdf = arquivo?.type === "application/pdf" || /\.pdf$/i.test(nome || "");
      if (ehPdf) {
        const ok = await validarPdf(arquivo instanceof Blob && !arquivo.name ? Object.assign(arquivo, { name: nome }) : arquivo);
        if (!ok.ok) throw new ErroValidacao({ anexo: ok.erro });
      } else if (!/^image\//.test(arquivo?.type || "")) throw new ErroValidacao({ anexo: "Anexe um PDF ou uma imagem." });
      else if (arquivo.size > 15 * 1024 * 1024) throw new ErroValidacao({ anexo: "A imagem passa de 15 MB." });
      const r = await repo.enviarArquivo(`redacoes/${alunoId}/anexo-${novoId()}${ehPdf ? ".pdf" : ".jpg"}`, arquivo);
      return { ref: r.ref, nome: nome || (ehPdf ? "texto.pdf" : "imagem.jpg"), tipo: ehPdf ? "application/pdf" : arquivo.type, tamanho: arquivo.size };
    },
    removerArquivo: (ref) => (ref ? repo.removerArquivo(ref).catch(() => {}) : null),
    url: (ref) => repo.urlArquivo(ref),

    async marcarLida(id) {
      const d = await repo.obter("devolutivas", id);
      if (!d || d.lida || d.status !== "enviada") return false;
      if (!(ctx.usuario?.role === PAPEIS.ALUNO && ctx.usuario.uid === d.alunoId)) return false;
      await repo.atualizar("devolutivas", id, { lida: true, lidaEm: carimbo() });
      return true;
    },

    observarConfig: (cb) => repo.observarDoc("config", "redacao", (d) => cb(d || {})),
    async salvarInstrucoes(instrucoes) {
      ctx.exigir("gerenciar:redacao");
      await repo.mesclar("config", "redacao", { instrucoes: String(instrucoes || "").trim(), atualizadoEm: carimbo() });
    },
  };
}

/* ---------- Textos e boas-vindas ----------
   config/textos:        { geral: {chave: texto}, porGrupo: { "vestibular:ID" | "curso:ID": {…} }, corDestaque }
   textosAluno/{uid}:    { textos: {chave: texto} }   (privado: só o aluno e o moderador leem)
   config/boasVindas:    { hero, blocos }             (público: aparece no login) */

export function servicoTextos(ctx) {
  const { repo } = ctx;
  const limpar = (obj = {}) => Object.fromEntries(Object.entries(obj).filter(([, v]) => String(v ?? "").trim() !== ""));
  return {
    observar: (cb) => repo.observarDoc("config", "textos", (d) => cb({ geral: {}, porGrupo: {}, ...(d || {}) })),
    observarDoAluno(alunoId, cb) {
      ctx.exigir("ver:aluno", { alunoId });
      return repo.observarDoc("textosAluno", alunoId, (d) => cb(d?.textos || {}));
    },
    observarTodosDosAlunos(cb) {
      ctx.exigir("gerenciar:textos");
      return repo.observar("textosAluno", [], (l) => cb(Object.fromEntries(l.map((d) => [d.id, d.textos || {}]))));
    },

    // salva o conjunto inteiro de um escopo: { tipo: "geral" } | { tipo: "grupo", grupo } | { tipo: "aluno", alunoId }
    async salvar(escopo, textos, extras = {}) {
      ctx.exigir("gerenciar:textos");
      if (escopo.tipo === "aluno") {
        await repo.definir("textosAluno", escopo.alunoId, { alunoId: escopo.alunoId, textos: limpar(textos), atualizadoEm: carimbo() });
        return;
      }
      const atual = (await repo.obter("config", "textos")) || {};
      const novo = { geral: atual.geral || {}, porGrupo: atual.porGrupo || {}, corDestaque: atual.corDestaque || null, ...extras };
      if (escopo.tipo === "geral") novo.geral = limpar(textos);
      else if (escopo.tipo === "grupo") {
        if (!/^(vestibular|curso):/.test(escopo.grupo || "")) throw new ErroDados("Grupo inválido.");
        novo.porGrupo = { ...novo.porGrupo, [escopo.grupo]: limpar(textos) };
        if (!Object.keys(novo.porGrupo[escopo.grupo]).length) delete novo.porGrupo[escopo.grupo];
      }
      await repo.definir("config", "textos", { ...novo, atualizadoEm: carimbo() });
    },

    observarBoasVindas: (cb) => repo.observarDoc("config", "boasVindas", (d) => cb(d || null)),
    async salvarBoasVindas(conteudo) {
      ctx.exigir("gerenciar:textos");
      await repo.definir("config", "boasVindas", { hero: conteudo.hero || {}, blocos: conteudo.blocos || [], atualizadoEm: carimbo() });
    },
    async enviarImagem(blob) {
      ctx.exigir("gerenciar:textos");
      return (await repo.enviarArquivo(`publico/${novoId()}.jpg`, blob)).ref;
    },
    url: (ref) => repo.urlArquivo(ref),
  };
}

/* ---------- Histórico de alterações ---------- */

export function servicoLogs(ctx) {
  const { repo } = ctx;
  return {
    observarDoAluno(alunoId, cb) {
      ctx.exigir("ver:aluno", { alunoId });
      return repo.observar("logs", [["alunoId", "==", alunoId]], (l) => cb([...l].sort(recentesPrimeiro("em"))));
    },
    observarGerais(cb) {
      ctx.exigir("ver:painelModerador");
      return repo.observar("logs", [], (l) => cb([...l].sort(recentesPrimeiro("em"))));
    },
  };
}
