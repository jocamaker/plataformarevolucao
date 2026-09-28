/* notificationService: o moderador envia para todos, um grupo (vestibular
   e/ou curso) ou alunos escolhidos. Cada aluno recebe o seu documento (lidaEm
   é por aluno); envioId junta as cópias de um mesmo envio. Nada é apagado:
   o histórico fica. */

import { carimbo, novoId } from "../data/contrato.js";
import { PAPEIS } from "../core/permissoes.js";
import { ErroValidacao, loteEmPartes, recentesPrimeiro } from "./base.js";

export const PRIORIDADES_NOTIFICACAO = [
  { id: "normal", nome: "Normal" },
  { id: "alta", nome: "Importante" },
  { id: "urgente", nome: "Urgente" },
];

// alunos atingidos por um destino
export function alunosDoDestino(alunos, destino) {
  const ativos = alunos.filter((a) => a.ativo !== false);
  if (destino?.tipo === "todos") return ativos;
  if (destino?.tipo === "grupo") {
    return ativos.filter((a) => (!destino.vestibularId || a.vestibularId === destino.vestibularId) && (!destino.cursoId || a.cursoId === destino.cursoId));
  }
  if (destino?.tipo === "alunos") return ativos.filter((a) => (destino.alunoIds || []).includes(a.id));
  return [];
}

export function servicoNotificacoes(ctx) {
  const { repo } = ctx;

  return {
    observarDoAluno(alunoId, cb) {
      ctx.exigir("ver:aluno", { alunoId });
      return repo.observar("notificacoes", [["alunoId", "==", alunoId]], (l) => cb([...l].sort(recentesPrimeiro("criadaEm"))));
    },

    // moderador: envios agrupados, com quantos leram
    observarEnvios(cb) {
      ctx.exigir("enviar:notificacao");
      return repo.observar("notificacoes", [], (lista) => {
        const envios = new Map();
        lista.forEach((n) => {
          const e = envios.get(n.envioId) || { envioId: n.envioId, titulo: n.titulo, mensagem: n.mensagem, prioridade: n.prioridade, criadaEm: n.criadaEm, autorNome: n.autorNome, destino: n.destino, total: 0, lidas: 0, alunos: [] };
          e.total++;
          if (n.lidaEm) e.lidas++;
          e.alunos.push({ alunoId: n.alunoId, lidaEm: n.lidaEm || null });
          envios.set(n.envioId, e);
        });
        cb([...envios.values()].sort(recentesPrimeiro("criadaEm")));
      });
    },

    async enviar({ titulo, mensagem, prioridade = "normal", destino }) {
      ctx.exigir("enviar:notificacao");
      const erros = {};
      const t = String(titulo || "").trim(), m = String(mensagem || "").trim();
      if (!t) erros.titulo = "Dê um título.";
      if (t.length > 120) erros.titulo = "Título com até 120 caracteres.";
      if (!m) erros.mensagem = "Escreva a mensagem.";
      if (m.length > 4000) erros.mensagem = "Mensagem com até 4000 caracteres.";
      if (!PRIORIDADES_NOTIFICACAO.some((p) => p.id === prioridade)) erros.prioridade = "Prioridade inválida.";
      if (Object.keys(erros).length) throw new ErroValidacao(erros);
      const alunos = await repo.listar("usuarios", [["role", "==", PAPEIS.ALUNO]]);
      const alvo = alunosDoDestino(alunos, destino);
      if (!alvo.length) throw new ErroValidacao({ destino: "Nenhum aluno ativo nesse destino." });
      const envioId = novoId();
      const { autorId, autorNome } = ctx.autor();
      await loteEmPartes(repo, alvo.map((a) => ({
        tipo: "criar", colecao: "notificacoes",
        dados: { alunoId: a.id, envioId, titulo: t, mensagem: m, prioridade, destino, autorId, autorNome, criadaEm: carimbo(), lidaEm: null },
      })));
      return { envioId, destinatarios: alvo.length };
    },

    // só o próprio aluno marca como lida, uma vez
    async marcarLida(id) {
      const n = await repo.obter("notificacoes", id);
      if (!n) return false;
      ctx.exigir("marcarLida:notificacao", { notificacao: n });
      if (n.lidaEm) return false;
      await repo.atualizar("notificacoes", id, { lidaEm: carimbo() });
      return true;
    },
  };
}
