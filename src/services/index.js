/* Fábrica dos serviços. A interface usa só isto (nunca o banco direto):

   const s = criarServicos(repositorio);
   s.auth, s.alunos, s.estrutura, s.planos, s.estudo, s.questoes, s.simulados,
   s.materiais, s.provas, s.notificacoes, s.playlists, s.redacao, s.textos, s.logs

   Os nomes pedidos na especificação são apelidos: authService,
   studentService, studyPlanService, questionService, mockExamService,
   materialService, notificationService; performanceService é o módulo
   services/desempenho.js (funções puras). */

import { criarContexto } from "./base.js";
import { servicoAuth } from "./auth.js";
import { servicoAlunos } from "./alunos.js";
import { servicoEstrutura } from "./estrutura.js";
import { servicoPlanos } from "./planos.js";
import { servicoEstudo } from "./estudo.js";
import { servicoQuestoes, servicoSimulados } from "./registros.js";
import { servicoMateriais } from "./materiais.js";
import { servicoProvas } from "./provas.js";
import { servicoNotificacoes } from "./notificacoes.js";
import { servicoLogs, servicoPlaylists, servicoRedacao, servicoTextos } from "./conteudo.js";

export function criarServicos(repo, opcoes = {}) {
  const ctx = criarContexto(repo, opcoes);
  const s = { ctx, repo, modo: repo.modo };
  s.auth = servicoAuth(ctx);
  s.alunos = servicoAlunos(ctx);
  s.estrutura = servicoEstrutura(ctx);
  s.estudo = servicoEstudo(ctx);
  s.planos = servicoPlanos(ctx, s);
  s.questoes = servicoQuestoes(ctx);
  s.simulados = servicoSimulados(ctx);
  s.materiais = servicoMateriais(ctx);
  s.provas = servicoProvas(ctx);
  s.notificacoes = servicoNotificacoes(ctx);
  s.playlists = servicoPlaylists(ctx);
  s.redacao = servicoRedacao(ctx);
  s.textos = servicoTextos(ctx);
  s.logs = servicoLogs(ctx);

  Object.assign(s, {
    authService: s.auth,
    studentService: s.alunos,
    studyPlanService: s.planos,
    questionService: s.questoes,
    mockExamService: s.simulados,
    materialService: s.materiais,
    notificationService: s.notificacoes,
  });
  return s;
}
