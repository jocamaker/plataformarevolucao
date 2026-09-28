/* Instalação de demonstração (só no modo local, com o banco vazio).
   Cria contas de teste, a estrutura acadêmica, planos gerais por vestibular e
   o plano de cada aluno de teste. NÃO cria histórico: questões, simulados,
   sessões, redações e notificações começam vazios e só existem se alguém
   registrar de verdade. */

import { CICLO_TEMPLATES, DISP_PADRAO, INSTRUCOES_REDACAO_INICIAL, isoLocal } from "../core/nucleo.js";
import { estruturaInicial, indiceEstrutura, materiaDoCurso } from "../core/estrutura.js";
import { REVISAO_PADRAO, PERMISSOES_PADRAO, capacidadeSemanal, planoDoModelo, recalcularPlano } from "../core/plano.js";
import { COR_DESTAQUE_PADRAO } from "../textos.js";
import { carimbo } from "./contrato.js";

export const SENHA_DEMO = "123456";

export const CONTAS_DEMO = [
  { email: "moderador@curso.com", nome: "Prof. Moderador", role: "moderador" },
  { email: "aluno@curso.com", nome: "Ana Beatriz", role: "aluno", vestibularId: "fuvest", cursoId: "medicina", turma: "Extensivo manhã" },
  { email: "carlos@curso.com", nome: "Carlos Eduardo", role: "aluno", vestibularId: "enem_med", cursoId: "medicina", turma: "Extensivo noite" },
  { email: "mariana@curso.com", nome: "Mariana Lopes", role: "aluno", vestibularId: "unicamp", cursoId: "engenharia", turma: "Extensivo manhã" },
];

export const BOAS_VINDAS_PADRAO = {
  hero: { foto: null, nome: "Seu curso", subtitulo: "Edite esta página em Textos, no painel do moderador.", cor: "#C9793A" },
  blocos: [
    { id: "b1", tipo: "titulo", texto: "Como usar a plataforma" },
    { id: "b2", tipo: "texto", texto: "1. No Dashboard, veja as metas do dia e marque cada uma ao terminar.\n2. No Edital, abra cada matéria para ver os tópicos; corte o que já domina.\n3. Em Meus cursos e Redação ficam as aulas em vídeo e as suas devolutivas.\n4. Em Extra: questões, simulados e materiais em PDF.\n5. Acompanhe a sua evolução em Desempenho." },
  ],
};

// jornadas (planos gerais) a partir dos ciclos do núcleo, nas 9 matérias do
// curso: Português, Literatura, Redação e Inglês somam em Linguagens
export function modelosIniciais(ind) {
  return Object.entries(CICLO_TEMPLATES).map(([vestibularId, t], i) => {
    const porMateria = new Map();
    t.alocacoes.forEach((a) => {
      const id = materiaDoCurso(a.materiaId);
      const atual = porMateria.get(id) || { minutos: 0, maxSessao: 0 };
      porMateria.set(id, { minutos: atual.minutos + a.minutosSemanais, maxSessao: Math.max(atual.maxSessao, a.maxSessao || 60) });
    });
    // cabe nas horas livres padrão (com folga): a demonstração não nasce estourada
    const somar = () => ind.materias.reduce((x, m) => x + (porMateria.get(m.id)?.minutos ?? 60), 0);
    const fator = Math.min(1, (capacidadeSemanal(DISP_PADRAO) * 0.9) / somar());
    porMateria.forEach((v, id) => porMateria.set(id, { ...v, minutos: Math.max(45, Math.round((v.minutos * fator) / 15) * 15) }));
    return {
      id: `modelo-${vestibularId}`,
      nome: `${t.nome} · Extensivo`,
      descricao: t.desc || "",
      vestibularId, cursoId: "", modalidade: "extensivo", periodo: "", versao: 1, dataAlvo: null, ritmo: 1,
      revisao: { ...REVISAO_PADRAO }, permissoesAluno: { ...PERMISSOES_PADRAO }, ordem: i,
      // todas as matérias do curso; as que o ciclo não previa entram com 1h por semana
      materias: ind.materias.map((m) => ({
        materiaId: m.id, minutosSemanais: porMateria.get(m.id)?.minutos ?? 60, maxSessao: porMateria.get(m.id)?.maxSessao ?? 60,
        prioridade: porMateria.has(m.id) ? 2 : 3, ritmo: 1,
        topicos: ind.topicosDaMateria(m.id).map((tp) => ({ topicoId: tp.id, subtopicos: ind.subtopicosDoTopico(tp.id).map((x) => ({ subtopicoId: x.id })) })),
      })),
    };
  });
}

export async function semearDemonstracao(repo, { agora = new Date() } = {}) {
  if (!repo.vazio?.()) return false;
  const hojeIso = isoLocal(agora);
  const e = estruturaInicial();
  const ind = indiceEstrutura(e);
  const ops = [];
  Object.entries({ materias: e.materias, topicos: e.topicos, subtopicos: e.subtopicos, vestibulares: e.vestibulares, cursos: e.cursos })
    .forEach(([colecao, lista]) => lista.forEach(({ id, ...dados }) => ops.push({ tipo: "definir", colecao, id, dados: { ...dados, arquivado: false } })));

  const modelos = modelosIniciais(ind);
  modelos.forEach(({ id, ...dados }) => ops.push({ tipo: "definir", colecao: "modelosPlano", id, dados: { ...dados, arquivado: false, criadoEm: carimbo() } }));

  let moderadorId = null;
  for (const c of CONTAS_DEMO) {
    const uid = await repo.criarConta(c.email, SENHA_DEMO);
    const { email, nome, role, ...resto } = c;
    ops.push({ tipo: "definir", colecao: "usuarios", id: uid, dados: { role, nome, email, ativo: true, criadoEm: carimbo(), ...resto, ...(role === "aluno" ? { telefone: "", dataProva: null } : {}) } });
    if (role === "moderador") { moderadorId = uid; continue; }
    const modelo = modelos.find((m) => m.vestibularId === c.vestibularId);
    const plano = planoDoModelo(modelo, { id: uid }, { hojeIso, disponibilidade: DISP_PADRAO });
    const { plano: calculado } = recalcularPlano(plano, ind, {}, hojeIso);
    const { id: _i, ...dadosPlano } = calculado;
    ops.push({ tipo: "definir", colecao: "planos", id: uid, dados: { ...dadosPlano, alunoId: uid, atualizadoEm: carimbo() } });
    ops.push({ tipo: "definir", colecao: "progresso", id: uid, dados: { alunoId: uid, itens: {} } });
  }

  ops.push(
    { tipo: "definir", colecao: "config", id: "instalacao", dados: { moderadorId, em: carimbo(), demonstracao: true } },
    { tipo: "definir", colecao: "config", id: "textos", dados: { geral: {}, porGrupo: {}, corDestaque: COR_DESTAQUE_PADRAO } },
    { tipo: "definir", colecao: "config", id: "boasVindas", dados: structuredClone(BOAS_VINDAS_PADRAO) },
    { tipo: "definir", colecao: "config", id: "redacao", dados: { instrucoes: INSTRUCOES_REDACAO_INICIAL } },
  );
  await repo.lote(ops);
  return true;
}
