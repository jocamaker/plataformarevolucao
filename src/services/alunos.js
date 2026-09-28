/* studentService: cadastro e perfil dos alunos (coleção usuarios, role "aluno"). */

import { carimbo } from "../data/contrato.js";
import { PAPEIS } from "../core/permissoes.js";
import { ErroValidacao, escolher, opsDeLog, porNome } from "./base.js";

const CAMPOS_EDITAVEIS = ["nome", "vestibularId", "cursoId", "turma", "telefone", "dataProva", "ativo"];
const ROTULOS = { nome: "nome", vestibularId: "vestibular", cursoId: "curso", turma: "turma", telefone: "telefone", dataProva: "data da prova", ativo: "acesso" };

export function servicoAlunos(ctx) {
  const { repo } = ctx;

  async function validar(d, novo) {
    const erros = {};
    if (!String(d.nome || "").trim()) erros.nome = "Informe o nome.";
    if (novo && !/.+@.+\..+/.test(String(d.email || "").trim())) erros.email = "E-mail inválido.";
    if (novo && String(d.senha || "").length < 6) erros.senha = "A senha precisa ter ao menos 6 caracteres.";
    const ind = await ctx.indice();
    if (!d.vestibularId || !ind.vestibular(d.vestibularId)) erros.vestibularId = "Escolha o vestibular.";
    if (d.cursoId && !ind.curso(d.cursoId)) erros.cursoId = "Curso inválido.";
    if (d.dataProva && !/^\d{4}-\d{2}-\d{2}$/.test(d.dataProva)) erros.dataProva = "Data inválida.";
    if (Object.keys(erros).length) throw new ErroValidacao(erros);
  }

  return {
    observarTodos(cb) {
      ctx.exigir("gerenciar:alunos");
      return repo.observar("usuarios", [["role", "==", PAPEIS.ALUNO]], (lista) => cb([...lista].sort(porNome)));
    },

    observar(alunoId, cb) {
      ctx.exigir("ver:aluno", { alunoId });
      return repo.observarDoc("usuarios", alunoId, (doc) => cb(doc && doc.role === PAPEIS.ALUNO ? doc : null));
    },

    async criar(dados) {
      ctx.exigir("gerenciar:alunos");
      await validar(dados, true);
      const email = dados.email.trim().toLowerCase();
      const uid = await repo.criarConta(email, dados.senha);
      await repo.lote([
        {
          tipo: "definir", colecao: "usuarios", id: uid,
          dados: {
            role: PAPEIS.ALUNO, nome: dados.nome.trim(), email, vestibularId: dados.vestibularId, cursoId: dados.cursoId || "",
            turma: (dados.turma || "").trim(), telefone: (dados.telefone || "").trim(), dataProva: dados.dataProva || null,
            ativo: true, criadoEm: carimbo(), criadoPor: ctx.usuario.uid,
          },
        },
        ...opsDeLog(ctx, { alunoId: uid, entidade: "aluno", entidadeId: uid }, [{ tipo: "cadastro", descricao: "Cadastrou o aluno", depois: dados.nome.trim() }]),
      ]);
      return uid;
    },

    async atualizar(alunoId, campos) {
      ctx.exigir("gerenciar:alunos");
      const atual = await repo.obter("usuarios", alunoId);
      if (!atual || atual.role !== PAPEIS.ALUNO) throw new ErroValidacao({ alunoId: "Aluno não encontrado." });
      const novo = { ...atual, ...escolher(campos, CAMPOS_EDITAVEIS) };
      await validar(novo, false);
      const patch = {};
      const entradas = [];
      CAMPOS_EDITAVEIS.forEach((k) => {
        if (campos[k] === undefined || JSON.stringify(atual[k] ?? null) === JSON.stringify(campos[k] ?? null)) return;
        patch[k] = typeof campos[k] === "string" ? campos[k].trim() : campos[k];
        const fmt = (v) => (k === "ativo" ? (v === false ? "bloqueado" : "liberado") : v ?? null);
        entradas.push({ tipo: "perfil", descricao: `Mudou ${ROTULOS[k]}`, antes: fmt(atual[k]), depois: fmt(campos[k]) });
      });
      if (!entradas.length) return false;
      await repo.lote([
        { tipo: "atualizar", colecao: "usuarios", id: alunoId, dados: { ...patch, atualizadoEm: carimbo() } },
        ...opsDeLog(ctx, { alunoId, entidade: "aluno", entidadeId: alunoId }, entradas),
      ]);
      return true;
    },
  };
}
