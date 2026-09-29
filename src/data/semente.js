/* Instalação de demonstração (só no modo local, com o banco vazio).
   Cria contas de teste, a estrutura acadêmica, planos gerais por vestibular e
   o plano de cada aluno de teste. NÃO cria histórico: questões, simulados,
   sessões, redações e notificações começam vazios e só existem se alguém
   registrar de verdade. */

import { CICLO_TEMPLATES, DISP_PADRAO, INSTRUCOES_REDACAO_INICIAL, isoLocal } from "../core/nucleo.js";
import { estruturaInicial, indiceEstrutura, materiaDoCurso } from "../core/estrutura.js";
import { modeloVazio, planoDoModelo, recalcularPlano } from "../core/plano.js";
import { MAX_SESSAO_PADRAO, arredMaxSessao } from "../core/blocos.js";
import { pesoPelaIncidencia } from "../core/migracao.js";
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

/* Jornadas (planos gerais) a partir dos ciclos do núcleo, nas matérias do
   curso: Português, Literatura, Redação e Inglês entram em Linguagens. O peso
   de cada matéria sai da incidência do ciclo pela regra da migração (r =
   minutos da matéria ÷ minutos da maior: ≥ 0,75 → 3; ≥ 0,45 → 2; senão 1);
   matéria que o ciclo não previa entra com peso 1. Obras literárias: ativa
   com peso 2 só na FUVEST; nas outras jornadas fica inativa (o moderador
   liga na página de pesos). */
export function modelosIniciais(ind) {
  return Object.entries(CICLO_TEMPLATES).map(([vestibularId, t], i) => {
    const porMateria = new Map();
    t.alocacoes.forEach((a) => {
      const id = materiaDoCurso(a.materiaId);
      const atual = porMateria.get(id) || { minutos: 0, maxSessao: 0 };
      // matéria que junta várias do ciclo (Linguagens): vale a de maior incidência,
      // não a soma (a soma de 4 disciplinas a punha acima de tudo e apagava o foco do ciclo)
      porMateria.set(id, { minutos: Math.max(atual.minutos, a.minutosSemanais), maxSessao: Math.max(atual.maxSessao, a.maxSessao || 60) });
    });
    const maior = Math.max(...[...porMateria.values()].map((v) => v.minutos));
    const materia = (m) => {
      const obras = m.id === "obras-literarias";
      const ciclo = porMateria.get(m.id);
      return {
        materiaId: m.id,
        peso: obras ? 2 : ciclo ? pesoPelaIncidencia(ciclo.minutos, maior) : 1,
        maxSessao: ciclo ? arredMaxSessao(ciclo.maxSessao) : MAX_SESSAO_PADRAO,
        ritmo: 1,
        ...(obras && vestibularId !== "fuvest" ? { ativa: false } : {}),
        topicos: ind.topicosDaMateria(m.id).map((tp) => ({ topicoId: tp.id, subtopicos: ind.subtopicosDoTopico(tp.id).map((x) => ({ subtopicoId: x.id })) })),
      };
    };
    return {
      ...modeloVazio(),
      id: `modelo-${vestibularId}`,
      nome: `${t.nome} · Extensivo`,
      descricao: t.desc || "",
      vestibularId, cursoId: "", modalidade: "extensivo", periodo: "", versao: 1, dataAlvo: null, ritmo: 1, ordem: i,
      cargaReferencia: 1200,
      materias: ind.materias.map(materia),
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
