/* materialService: PDFs no armazenamento de arquivos; no banco, só metadados.
   Estados do envio (para a tela): validando → enviando (progresso) → salvando → pronto | erro.

   Áreas (areasMateriais/{id}): as "pastas" coloridas que o aluno vê em
   Materiais, por exemplo "Listas de Física". O moderador cria a área e anexa
   materiais nela (material.areaId); cada material continua ligado à matéria,
   ao tópico e ao subtópico. */

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

// ícones (os componentes ficam na interface) e cores das áreas
export const ICONES_AREA = ["calculadora", "atomo", "dna", "frasco", "idiomas", "cerebro", "pessoas", "globo", "coluna", "livro", "caneta", "lista"];
export const CORES_AREA = [
  { nome: "Azul", cor: "#4867F0" }, { nome: "Vermelho", cor: "#EF4444" }, { nome: "Verde", cor: "#22A447" },
  { nome: "Turquesa", cor: "#0EA5A0" }, { nome: "Roxo", cor: "#7C4DEB" }, { nome: "Rosa", cor: "#E0457B" },
  { nome: "Laranja", cor: "#F97316" }, { nome: "Marrom", cor: "#8B5134" }, { nome: "Âmbar", cor: "#F59E0B" },
];
// sugestão de ícone e cor pela matéria (a criação das 9 áreas de uma vez usa isto)
export const AREA_DA_MATERIA = {
  matematica: { icone: "calculadora", cor: "#4867F0" }, fisica: { icone: "atomo", cor: "#EF4444" },
  biologia: { icone: "dna", cor: "#22A447" }, quimica: { icone: "frasco", cor: "#0EA5A0" },
  linguagens: { icone: "idiomas", cor: "#7C4DEB" }, filosofia: { icone: "cerebro", cor: "#E0457B" },
  sociologia: { icone: "pessoas", cor: "#F97316" }, geografia: { icone: "globo", cor: "#8B5134" },
  historia: { icone: "coluna", cor: "#F59E0B" },
};

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
      areaId: d.areaId || null,
      questoes: d.questoes === "" || d.questoes == null ? null : Number(d.questoes),
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
    if (r.questoes != null && (!Number.isInteger(r.questoes) || r.questoes < 1 || r.questoes > 2000)) erros.questoes = "Número de questões: inteiro entre 1 e 2000.";
    if (r.areaId && !(await repo.obter("areasMateriais", r.areaId))) erros.areaId = "Área inválida.";
    if (Object.keys(erros).length) throw new ErroValidacao(erros);
    return r;
  }

  function normalizarArea(d) {
    const erros = {};
    const r = {
      nome: String(d.nome || "").trim().slice(0, 60),
      rotulo: String(d.rotulo ?? "Listas de").trim().slice(0, 40),
      cor: /^#[0-9a-f]{6}$/i.test(d.cor || "") ? d.cor : CORES_AREA[0].cor,
      icone: ICONES_AREA.includes(d.icone) ? d.icone : "livro",
      materiaId: d.materiaId || null,
    };
    if (!r.nome) erros.nome = "Dê um nome à área.";
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

    /* ---------- Áreas ---------- */

    observarAreas(cb) {
      return repo.observar("areasMateriais", [], (l) => cb([...l].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0) || String(a.nome).localeCompare(String(b.nome), "pt-BR"))));
    },

    async salvarArea(dados) {
      ctx.exigir("gerenciar:materiais");
      const r = normalizarArea(dados);
      const atual = dados.id ? await repo.obter("areasMateriais", dados.id) : null;
      if (dados.id && !atual) throw new ErroDados("Área não encontrada.", "nao-encontrado");
      const id = dados.id || novoId();
      const ordem = atual?.ordem ?? (await repo.listar("areasMateriais")).length;
      await repo.lote([
        { tipo: atual ? "atualizar" : "criar", colecao: "areasMateriais", id, dados: { ...r, ordem, atualizadoEm: carimbo(), ...(atual ? {} : { criadoEm: carimbo() }) } },
        ...opsDeLog(ctx, { entidade: "material", entidadeId: id }, [{ tipo: atual ? "editar" : "criar", descricao: `${atual ? "Editou" : "Criou"} a área de materiais ${r.rotulo} ${r.nome}`.replace(/\s+/g, " ") }]),
      ]);
      return id;
    },

    // uma área "Listas de <matéria>" para cada matéria que ainda não tem a sua
    async criarAreasDasMaterias() {
      ctx.exigir("gerenciar:materiais");
      const [ind, areas] = await Promise.all([ctx.indice(), repo.listar("areasMateriais")]);
      const faltam = ind.materias.filter((m) => !areas.some((a) => a.materiaId === m.id));
      if (!faltam.length) return 0;
      const novas = Object.fromEntries(faltam.map((m) => [m.id, novoId()]));
      // os materiais que ainda não têm área entram na área da matéria deles
      const ids = new Set(areas.map((a) => a.id));
      const soltos = (await repo.listar("materiais")).filter((m) => !(m.areaId && ids.has(m.areaId)) && novas[m.materiaId]);
      await repo.lote([
        ...faltam.map((m, i) => ({
          tipo: "criar", colecao: "areasMateriais", id: novas[m.id],
          dados: { nome: m.nome, rotulo: "Listas de", materiaId: m.id, ...(AREA_DA_MATERIA[m.id] || { icone: "livro", cor: CORES_AREA[i % CORES_AREA.length].cor }), ordem: areas.length + i, criadoEm: carimbo(), atualizadoEm: carimbo() },
        })),
        ...soltos.map((m) => ({ tipo: "atualizar", colecao: "materiais", id: m.id, dados: { areaId: novas[m.materiaId], atualizadoEm: carimbo() } })),
        ...opsDeLog(ctx, { entidade: "material", entidadeId: "areas" }, [{
          tipo: "criar",
          descricao: `Criou ${faltam.length} ${faltam.length === 1 ? "área" : "áreas"} de materiais, uma por matéria${soltos.length ? `, e pôs ${soltos.length} ${soltos.length === 1 ? "material" : "materiais"} na área da matéria` : ""}`,
        }]),
      ]);
      return faltam.length;
    },

    // apagar a área não apaga os materiais: eles ficam em "Outros materiais"
    async removerArea(id) {
      ctx.exigir("gerenciar:materiais");
      const atual = await repo.obter("areasMateriais", id);
      if (!atual) return false;
      const dentro = await repo.listar("materiais", [["areaId", "==", id]]);
      await repo.lote([
        { tipo: "remover", colecao: "areasMateriais", id },
        ...dentro.map((m) => ({ tipo: "atualizar", colecao: "materiais", id: m.id, dados: { areaId: null, atualizadoEm: carimbo() } })),
        ...opsDeLog(ctx, { entidade: "material", entidadeId: id }, [{ tipo: "remover", descricao: `Apagou a área de materiais ${atual.nome}`, antes: `${dentro.length} materiais` }]),
      ]);
      return true;
    },
  };
}
