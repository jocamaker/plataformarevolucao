/* Estrutura acadêmica: MATÉRIA → TÓPICO → SUBTÓPICO, cada um com id (a área
   ficou opcional: o curso trabalha direto com as 9 matérias).
   As coleções vêm do banco (o moderador cadastra); aqui só há leitura e a
   estrutura inicial opcional, que o moderador importa se quiser. */

import { AREAS, VESTIBULARES } from "./nucleo.js";

const porOrdem = (a, b) => (a.ordem ?? 0) - (b.ordem ?? 0) || String(a.nome).localeCompare(String(b.nome), "pt-BR");

/* Índice de consulta rápida sobre as coleções normalizadas.
   Itens arquivados (arquivado: true) continuam com nome e cor, para o
   histórico, mas saem das listas de escolha. */
export function indiceEstrutura({ areas = [], materias = [], topicos = [], subtopicos = [], vestibulares = [], cursos = [] } = {}) {
  const mapa = (lista) => new Map(lista.map((x) => [x.id, x]));
  const A = mapa(areas), M = mapa(materias), T = mapa(topicos), S = mapa(subtopicos);
  const V = mapa(vestibulares), C = mapa(cursos);
  const ativos = (lista) => lista.filter((x) => !x.arquivado);
  const agrupar = (lista, campo) => {
    const g = new Map();
    ativos(lista).forEach((x) => { if (!g.has(x[campo])) g.set(x[campo], []); g.get(x[campo]).push(x); });
    g.forEach((l) => l.sort(porOrdem));
    return g;
  };
  const materiasPorArea = agrupar(materias, "areaId");
  const topicosPorMateria = agrupar(topicos, "materiaId");
  const subtopicosPorTopico = agrupar(subtopicos, "topicoId");

  return {
    areas: ativos(areas).sort(porOrdem),
    materias: ativos(materias).sort(porOrdem),
    vestibulares: ativos(vestibulares).sort(porOrdem),
    cursos: ativos(cursos).sort(porOrdem),
    vazio: !materias.length,
    arquivados: { areas: areas.filter((x) => x.arquivado), materias: materias.filter((x) => x.arquivado), topicos: topicos.filter((x) => x.arquivado), subtopicos: subtopicos.filter((x) => x.arquivado), vestibulares: vestibulares.filter((x) => x.arquivado), cursos: cursos.filter((x) => x.arquivado) },
    area: (id) => A.get(id),
    materia: (id) => M.get(id),
    topico: (id) => T.get(id),
    subtopico: (id) => S.get(id),
    vestibular: (id) => V.get(id),
    curso: (id) => C.get(id),
    materiasDaArea: (id) => materiasPorArea.get(id) || [],
    topicosDaMateria: (id) => topicosPorMateria.get(id) || [],
    subtopicosDoTopico: (id) => subtopicosPorTopico.get(id) || [],
    corDaMateria: (id) => M.get(id)?.cor || A.get(M.get(id)?.areaId)?.cor,
    nomeMateria: (id) => M.get(id)?.nome || "Matéria removida",
    nomeTopico: (id) => T.get(id)?.nome || "Tópico removido",
    nomeSubtopico: (id) => S.get(id)?.nome || "",
    nomeVestibular: (id) => V.get(id)?.nome || "",
    nomeCurso: (id) => C.get(id)?.nome || "",
  };
}

const slug = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

/* As matérias do curso, na ordem da grade (Obras literárias é o bloco das
   leituras obrigatórias, à parte de Linguagens). As cores só identificam a
   matéria (bolinha e bloco); o moderador pode trocar. */
export const MATERIAS_DO_CURSO = [
  { id: "biologia", nome: "Biologia", cor: "#5AA555" },
  { id: "fisica", nome: "Física", cor: "#4B8FC4" },
  { id: "quimica", nome: "Química", cor: "#3FA99B" },
  { id: "matematica", nome: "Matemática", cor: "#CC5A8A" },
  { id: "linguagens", nome: "Linguagens", cor: "#8A8FD6" },
  { id: "obras-literarias", nome: "Obras literárias", cor: "#9A7432", vestibulares: ["fuvest", "unicamp"] },
  { id: "filosofia", nome: "Filosofia", cor: "#C9A13A" },
  { id: "sociologia", nome: "Sociologia", cor: "#C9793A" },
  { id: "geografia", nome: "Geografia", cor: "#7FA36B" },
  { id: "historia", nome: "História", cor: "#D0555F" },
];

// matérias do protótipo que viraram uma das 9 (os tópicos vão junto)
const DESTINO = { portugues: "linguagens", literatura: "linguagens", redacao: "linguagens", ingles: "linguagens", algebra: "matematica", geometria: "matematica", trigonometria: "matematica", estatistica: "matematica" };
export const materiaDoCurso = (id) => DESTINO[id] || id;

/* Estrutura inicial: as 9 matérias com tópicos de exemplo (os do protótipo,
   mais "Geografia agrária"), que o moderador edita, arquiva ou completa.
   Subtópico é orientação de estudo dentro do tópico. */
export function estruturaInicial() {
  const materias = MATERIAS_DO_CURSO.map((m, i) => ({ ...m, areaId: null, ordem: i }));
  const topicos = [], subtopicos = [];
  const ordemNa = {};
  const addTopico = (materiaId, id, nome, cargaMin, subs) => {
    const ordem = (ordemNa[materiaId] = (ordemNa[materiaId] ?? -1) + 1);
    topicos.push({ id, materiaId, nome, ordem, cargaMin });
    subs.forEach((sub, is) => subtopicos.push({ id: `${id}-${slug(sub)}`, topicoId: id, nome: sub, ordem: is, cargaMin: null }));
  };
  AREAS.forEach((a) => a.materias.forEach((m) => m.topicos.forEach((t) => addTopico(materiaDoCurso(m.id), t.id, t.nome, t.carga, t.subs))));
  addTopico("geografia", "g2", "Geografia agrária", 180, ["Técnicas e cultivo", "Estrutura fundiária", "Agronegócio e agricultura familiar"]);
  // a lista oficial de leituras muda a cada edição: o moderador cadastra as obras
  addTopico("obras-literarias", "ol1", "Obra 1 (exemplo)", 180, []);
  addTopico("obras-literarias", "ol2", "Obra 2 (exemplo)", 180, []);
  const vestibulares = VESTIBULARES.map((v, i) => ({ id: v.id, nome: v.nome, cor: v.cor, ordem: i }));
  const cursos = [
    { id: "medicina", nome: "Medicina", ordem: 0 },
    { id: "direito", nome: "Direito", ordem: 1 },
    { id: "engenharia", nome: "Engenharia", ordem: 2 },
    { id: "economia", nome: "Economia", ordem: 3 },
  ];
  return { areas: [], materias, topicos, subtopicos, vestibulares, cursos };
}
