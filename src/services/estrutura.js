/* Estrutura acadêmica (ÁREA → MATÉRIA → TÓPICO → SUBTÓPICO), vestibulares e cursos.
   Só o moderador escreve. Nada é apagado: o item sai de uso (arquivado) e
   continua com nome no histórico. */

import { carimbo, novoId } from "../data/contrato.js";
import { estruturaInicial, indiceEstrutura } from "../core/estrutura.js";
import { COLECOES_ESTRUTURA, ErroValidacao, loteEmPartes, opsDeLog } from "./base.js";

const PAI = { materia: "areaId", topico: "materiaId", subtopico: "topicoId" };
const TIPO_PAI = { materia: "area", topico: "materia", subtopico: "topico" };
const NOMES = { area: "área", materia: "matéria", topico: "tópico", subtopico: "subtópico", vestibular: "vestibular", curso: "curso" };
const ARTIGO = { area: "a", materia: "a", topico: "o", subtopico: "o", vestibular: "o", curso: "o" };
const com = (tipo) => `${ARTIGO[tipo]} ${NOMES[tipo]}`; // "a matéria", "o tópico"

export function servicoEstrutura(ctx) {
  const { repo } = ctx;

  const irmaos = (ind, tipo, doc) => {
    if (tipo === "area") return ind.areas;
    if (tipo === "materia") return doc.areaId ? ind.materiasDaArea(doc.areaId) : ind.materias;
    if (tipo === "topico") return ind.topicosDaMateria(doc.materiaId);
    if (tipo === "subtopico") return ind.subtopicosDoTopico(doc.topicoId);
    return tipo === "vestibular" ? ind.vestibulares : ind.cursos;
  };

  return {
    // cb(indice) sempre que qualquer coleção da estrutura mudar
    observar(cb) {
      const listas = {};
      const nomes = Object.values(COLECOES_ESTRUTURA);
      const cancelar = nomes.map((c) => repo.observar(c, [], (lista) => {
        listas[c] = lista;
        if (nomes.every((n) => listas[n])) {
          const ind = indiceEstrutura(listas);
          ctx.definirIndice(ind);
          cb(ind);
        }
      }));
      return () => cancelar.forEach((f) => f());
    },

    async salvar(tipo, dados) {
      ctx.exigir("gerenciar:estrutura");
      const colecao = COLECOES_ESTRUTURA[tipo];
      if (!colecao) throw new Error(`Tipo de estrutura desconhecido: ${tipo}`);
      const ind = await ctx.indice();
      const erros = {};
      const nome = String(dados.nome || "").trim();
      if (!nome) erros.nome = `Dê um nome ${ARTIGO[tipo] === "a" ? "à" : "ao"} ${NOMES[tipo]}.`;
      const campoPai = PAI[tipo];
      const paiOpcional = tipo === "materia"; // a área é opcional: o curso usa as matérias direto
      if (campoPai && !(paiOpcional && !dados[campoPai]) && !ind[TIPO_PAI[tipo]](dados[campoPai])) erros[campoPai] = `Escolha ${com(TIPO_PAI[tipo])}.`;
      if ((tipo === "topico" || tipo === "subtopico") && dados.cargaMin != null && dados.cargaMin !== "") {
        const c = Number(dados.cargaMin);
        if (!Number.isInteger(c) || c < 5 || c > 6000) erros.cargaMin = "Carga em minutos: inteiro entre 5 e 6000.";
      }
      if (Object.keys(erros).length) throw new ErroValidacao(erros);

      const id = dados.id || novoId();
      const atual = dados.id ? ind[tipo](dados.id) : null;
      const doc = {
        nome,
        ordem: atual?.ordem ?? irmaos(ind, tipo, dados).length,
        ...(campoPai ? { [campoPai]: dados[campoPai] || null } : {}),
        ...(tipo === "area" || tipo === "vestibular" || tipo === "materia" ? { cor: dados.cor || atual?.cor || "#8A8A8A" } : {}),
        ...(tipo === "topico" || tipo === "subtopico" ? { cargaMin: dados.cargaMin === "" || dados.cargaMin == null ? null : Number(dados.cargaMin) } : {}),
        ...(dados.descricao !== undefined ? { descricao: String(dados.descricao).trim() } : {}),
        arquivado: atual?.arquivado || false,
        atualizadoEm: carimbo(),
      };
      await repo.lote([
        { tipo: "mesclar", colecao, id, dados: doc },
        ...opsDeLog(ctx, { entidade: "estrutura", entidadeId: id }, [{
          tipo: atual ? "editar" : "criar",
          descricao: `${atual ? "Editou" : "Criou"} ${com(tipo)} ${nome}`,
          antes: atual ? atual.nome : null, depois: nome,
        }]),
      ]);
      ctx.esquecerIndice();
      return id;
    },

    async arquivar(tipo, id, arquivado = true) {
      ctx.exigir("gerenciar:estrutura");
      const ind = await ctx.indice();
      const atual = ind[tipo]?.(id);
      if (!atual) return;
      await repo.lote([
        { tipo: "atualizar", colecao: COLECOES_ESTRUTURA[tipo], id, dados: { arquivado, atualizadoEm: carimbo() } },
        ...opsDeLog(ctx, { entidade: "estrutura", entidadeId: id }, [{ tipo: arquivado ? "arquivar" : "restaurar", descricao: `${arquivado ? "Arquivou" : "Restaurou"} ${com(tipo)} ${atual.nome}` }]),
      ]);
      ctx.esquecerIndice();
    },

    async mover(tipo, id, passo) {
      ctx.exigir("gerenciar:estrutura");
      const ind = await ctx.indice();
      const doc = ind[tipo](id);
      const lista = irmaos(ind, tipo, doc);
      const i = lista.findIndex((x) => x.id === id);
      const j = i + passo;
      if (i < 0 || j < 0 || j >= lista.length) return;
      const nova = [...lista];
      [nova[i], nova[j]] = [nova[j], nova[i]];
      await repo.lote(nova.map((x, ordem) => ({ tipo: "atualizar", colecao: COLECOES_ESTRUTURA[tipo], id: x.id, dados: { ordem } })));
      ctx.esquecerIndice();
    },

    // Importa a estrutura do protótipo (só com a estrutura vazia).
    async importarInicial() {
      ctx.exigir("gerenciar:estrutura");
      const ind = await ctx.indice();
      if (!ind.vazio) return false;
      const e = estruturaInicial();
      const ops = [];
      Object.entries(COLECOES_ESTRUTURA).forEach(([, colecao]) => {
        (e[colecao] || []).forEach(({ id, ...dados }) => ops.push({ tipo: "definir", colecao, id, dados: { ...dados, arquivado: false } }));
      });
      await loteEmPartes(repo, ops);
      ctx.esquecerIndice();
      return true;
    },
  };
}
