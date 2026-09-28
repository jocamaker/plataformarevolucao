/* ============================================================================
   NÚCLEO DA PLATAFORMA DE VESTIBULAR — tudo que NÃO é visual
   ----------------------------------------------------------------------------
   Extraído do protótipo (src/App.jsx). Sem React, sem estilos: pode ser usado
   com qualquer layout/arte. Aqui ficam só regras e catálogos; os dados reais
   vêm dos serviços (src/services) e do banco (src/data).

   Conteúdo:
   · Usuários e papéis (aluno / moderador)
   · Taxonomia: áreas → matérias → tópicos → subtópicos
   · Vestibulares e templates de ciclo de estudo por vestibular
   · Motor de metas: distribui minutos semanais por matéria nos dias,
     respeitando a disponibilidade diária; integra revisões espaçadas;
     replaneja metas atrasadas; recálculo inteligente do plano
   · Cursos em vídeo (categorias) e devolutivas de redação (competências ENEM)

   Correções aplicadas nesta versão (marcadas com "CORREÇÃO" no código).
   Todas são compatíveis com as chamadas antigas:
   1. Alocações com id de ÁREA (ex.: "matematica" nos CICLO_TEMPLATES) são
      divididas entre as matérias da área, proporcionalmente à carga horária.
   2. O tópico de cada meta segue o progresso do aluno (opcoes.progresso),
      em vez de ser sempre o primeiro tópico da matéria.
   3. recalcularPlanoInteligente aceita opcoes.hoje e não aloca metas em
      dias que já passaram.
   4. hojeISO e semanaKey usam a data local, não UTC (no Brasil, depois das
      21h o toISOString já devolvia o dia seguinte).
   5. No recálculo, pendências de matérias que não estão no ciclo voltam para
      a fila em vez de serem descartadas.
   6. No recálculo, as pendências são distribuídas ANTES de qualquer outra
      sessão (a prioridade estava só no comentário).
   7. Matéria sem pendência só recebe o que falta da sua cota semanal, e não
      mais uma "sessão típica" extra quando a semana dela já foi cumprida.
   8. Pendência que não cabe na semana volta em resumo.naoCouberam em vez de
      sumir em silêncio.
   9. opcoes.conteudoDaVez(materiaId): o plano individual informa tópico e
      subtópico de cada sessão (a taxonomia deixa de ser fixa no código).
  10. opcoes.semana: revisões entram pela data dentro da semana, não pelos
      "próximos 7 dias" (que caíam no dia da semana errado).
  11. As sessões semanais de cada matéria saem equilibradas (105 min com
      máximo de 90 → 55 + 50), em vez de uma sessão cheia e uma sobra de 15.
  12. Alocação com ehMateria: true não é expandida como área (o id da
      matéria pode coincidir com o de uma área do protótipo).
============================================================================ */

// Estrutura universal de matérias — 🔥 FIREBASE: /studyPlan (global)

const AREAS = [
  {
    id: "humanas", nome: "Humanas", cor: "#C9793A",
    materias: [
      { id: "historia", nome: "História", topicos: [
        { id: "h1", nome: "Brasil Colônia", carga: 360, subs: ["Pré-colonial", "Capitanias hereditárias", "Ciclo da cana-de-açúcar", "Insurreição Pernambucana", "Ciclo do ouro", "Inconfidências"] },
        { id: "h2", nome: "Era Vargas", carga: 240, subs: ["Estado Novo", "Populismo"] },
      ]},
      { id: "geografia", nome: "Geografia", topicos: [
        { id: "g1", nome: "Geopolítica", carga: 300, subs: ["Guerra Fria", "Globalização", "Blocos econômicos"] },
      ]},
      { id: "filosofia", nome: "Filosofia", topicos: [
        { id: "f1", nome: "Filosofia Antiga", carga: 180, subs: ["Sócrates", "Platão", "Aristóteles"] },
      ]},
      { id: "sociologia", nome: "Sociologia", topicos: [
        { id: "s1", nome: "Sociologia Clássica", carga: 180, subs: ["Durkheim", "Weber", "Marx"] },
      ]},
    ],
  },
  {
    id: "linguagens", nome: "Linguagens", cor: "#4B8FC4",
    materias: [
      { id: "portugues", nome: "Português", topicos: [
        { id: "p1", nome: "Sintaxe", carga: 300, subs: ["Período composto", "Regência", "Concordância"] },
      ]},
      { id: "literatura", nome: "Literatura", topicos: [
        { id: "l1", nome: "Modernismo", carga: 240, subs: ["1ª fase", "2ª fase", "Geração de 45"] },
      ]},
      { id: "redacao", nome: "Redação", topicos: [
        { id: "r1", nome: "Dissertativo-argumentativo", carga: 360, subs: ["Tese", "Argumentação", "Proposta"] },
      ]},
      { id: "ingles", nome: "Inglês", topicos: [
        { id: "i1", nome: "Reading", carga: 180, subs: ["Skimming", "Scanning", "Cognatos"] },
      ]},
    ],
  },
  {
    id: "matematica", nome: "Matemática", cor: "#CC5A8A",
    materias: [
      { id: "algebra", nome: "Álgebra", topicos: [
        { id: "a1", nome: "Funções", carga: 420, subs: ["Função afim", "Função quadrática", "Exponencial", "Logaritmo"] },
      ]},
      { id: "geometria", nome: "Geometria", topicos: [
        { id: "ge1", nome: "Geometria Plana", carga: 300, subs: ["Triângulos", "Círculo", "Áreas"] },
      ]},
      { id: "trigonometria", nome: "Trigonometria", topicos: [
        { id: "t1", nome: "Ciclo Trigonométrico", carga: 240, subs: ["Seno e cosseno", "Identidades", "Equações"] },
      ]},
      { id: "estatistica", nome: "Estatística", topicos: [
        { id: "e1", nome: "Análise de Dados", carga: 180, subs: ["Média/Moda/Mediana", "Probabilidade"] },
      ]},
    ],
  },
  {
    id: "naturais", nome: "Naturais", cor: "#5AA555",
    materias: [
      { id: "fisica", nome: "Física", topicos: [
        { id: "fi1", nome: "Mecânica", carga: 420, subs: ["Cinemática", "Dinâmica", "Energia"] },
      ]},
      { id: "quimica", nome: "Química", topicos: [
        { id: "qu1", nome: "Físico-Química", carga: 360, subs: ["Termoquímica", "Cinética", "Equilíbrio"] },
      ]},
      { id: "biologia", nome: "Biologia", topicos: [
        { id: "bi1", nome: "Citologia", carga: 240, subs: ["Membrana", "Organelas", "Divisão celular"] },
      ]},
    ],
  },
];

// índice rápido matéria→área e topico→info

const MATERIAS_FLAT = AREAS.flatMap((a) =>
  a.materias.map((m) => ({ ...m, areaId: a.id, areaNome: a.nome, areaCor: a.cor }))
);

const TOPICOS_FLAT = MATERIAS_FLAT.flatMap((m) =>
  m.topicos.map((t) => ({ ...t, materiaId: m.id, materiaNome: m.nome, areaNome: m.areaNome, areaCor: m.areaCor }))
);

// retorna os tópicos de uma matéria (por id) — usado no seletor em cascata

const topicosDaMateria = (materiaId) => {
  const m = MATERIAS_FLAT.find((x) => x.id === materiaId);
  return m ? m.topicos : [];
};

// Vestibulares disponíveis — 🔥 FIREBASE: poderia virar coleção /vestibulares
// Cada um tem uma cor de acento para a etiqueta visual minimalista.

const VESTIBULARES = [
  { id: "fuvest", nome: "FUVEST", cor: "#D0555F" },
  { id: "unicamp", nome: "UNICAMP", cor: "#4B8FC4" },
  { id: "unesp", nome: "UNESP", cor: "#C9A13A" },
  { id: "enem_med", nome: "ENEM MED", cor: "#CC5A8A" },
  { id: "bahiana", nome: "BAHIANA", cor: "#3FA99B" },
  { id: "fgv_insper", nome: "FGV/INSPER", cor: "#8A8FD6" },
  { id: "enem", nome: "ENEM", cor: "#C9793A" },
];

const vestInfo = (id) => VESTIBULARES.find((v) => v.id === id) || VESTIBULARES[0];

// Ciclos por vestibular: base dos planos gerais criados na instalação de demonstração

const CICLO_TEMPLATES = {
  enem: {
    nome: "ENEM",
    cor: "#C9793A",
    desc: "Distribuição equilibrada entre as 4 áreas + Redação.",
    alocacoes: [
      { materiaId: "matematica",  materiaNome: "Matemática",  minutosSemanais: 300, maxSessao: 90 },
      { materiaId: "portugues",   materiaNome: "Português",   minutosSemanais: 240, maxSessao: 80 },
      { materiaId: "historia",    materiaNome: "História",    minutosSemanais: 180, maxSessao: 60 },
      { materiaId: "geografia",   materiaNome: "Geografia",   minutosSemanais: 180, maxSessao: 60 },
      { materiaId: "biologia",    materiaNome: "Biologia",    minutosSemanais: 240, maxSessao: 80 },
      { materiaId: "quimica",     materiaNome: "Química",     minutosSemanais: 180, maxSessao: 60 },
      { materiaId: "fisica",      materiaNome: "Física",      minutosSemanais: 180, maxSessao: 60 },
      { materiaId: "redacao",     materiaNome: "Redação",     minutosSemanais: 240, maxSessao: 80 },
      { materiaId: "ingles",      materiaNome: "Inglês",      minutosSemanais: 120, maxSessao: 60 },
    ],
  },
  enem_med: {
    nome: "ENEM Medicina",
    cor: "#CC5A8A",
    desc: "Foco em Ciências da Natureza. Biologia e Química com peso alto.",
    alocacoes: [
      { materiaId: "biologia",    materiaNome: "Biologia",    minutosSemanais: 480, maxSessao: 90 },
      { materiaId: "quimica",     materiaNome: "Química",     minutosSemanais: 360, maxSessao: 90 },
      { materiaId: "fisica",      materiaNome: "Física",      minutosSemanais: 300, maxSessao: 90 },
      { materiaId: "matematica",  materiaNome: "Matemática",  minutosSemanais: 240, maxSessao: 80 },
      { materiaId: "portugues",   materiaNome: "Português",   minutosSemanais: 180, maxSessao: 60 },
      { materiaId: "redacao",     materiaNome: "Redação",     minutosSemanais: 180, maxSessao: 60 },
    ],
  },
  fuvest: {
    nome: "FUVEST",
    cor: "#D0555F",
    desc: "Vestibular abrangente. Matemática e Ciências com peso alto.",
    alocacoes: [
      { materiaId: "matematica",  materiaNome: "Matemática",  minutosSemanais: 360, maxSessao: 90 },
      { materiaId: "fisica",      materiaNome: "Física",      minutosSemanais: 300, maxSessao: 90 },
      { materiaId: "quimica",     materiaNome: "Química",     minutosSemanais: 240, maxSessao: 80 },
      { materiaId: "biologia",    materiaNome: "Biologia",    minutosSemanais: 240, maxSessao: 80 },
      { materiaId: "portugues",   materiaNome: "Português",   minutosSemanais: 300, maxSessao: 90 },
      { materiaId: "literatura",  materiaNome: "Literatura",  minutosSemanais: 180, maxSessao: 60 },
      { materiaId: "historia",    materiaNome: "História",    minutosSemanais: 180, maxSessao: 60 },
      { materiaId: "geografia",   materiaNome: "Geografia",   minutosSemanais: 120, maxSessao: 60 },
      { materiaId: "ingles",      materiaNome: "Inglês",      minutosSemanais: 120, maxSessao: 60 },
    ],
  },
  unicamp: {
    nome: "UNICAMP",
    cor: "#4B8FC4",
    desc: "Forte ênfase em Redação e Linguagens. Interdisciplinar.",
    alocacoes: [
      { materiaId: "redacao",     materiaNome: "Redação",     minutosSemanais: 360, maxSessao: 90 },
      { materiaId: "portugues",   materiaNome: "Português",   minutosSemanais: 300, maxSessao: 90 },
      { materiaId: "literatura",  materiaNome: "Literatura",  minutosSemanais: 180, maxSessao: 60 },
      { materiaId: "matematica",  materiaNome: "Matemática",  minutosSemanais: 300, maxSessao: 90 },
      { materiaId: "historia",    materiaNome: "História",    minutosSemanais: 240, maxSessao: 80 },
      { materiaId: "geografia",   materiaNome: "Geografia",   minutosSemanais: 180, maxSessao: 60 },
      { materiaId: "fisica",      materiaNome: "Física",      minutosSemanais: 180, maxSessao: 60 },
      { materiaId: "quimica",     materiaNome: "Química",     minutosSemanais: 180, maxSessao: 60 },
      { materiaId: "biologia",    materiaNome: "Biologia",    minutosSemanais: 180, maxSessao: 60 },
    ],
  },
  unesp: {
    nome: "UNESP",
    cor: "#C9A13A",
    desc: "Equilibrado. Peso ligeiramente maior em Exatas e Humanas.",
    alocacoes: [
      { materiaId: "matematica",  materiaNome: "Matemática",  minutosSemanais: 300, maxSessao: 90 },
      { materiaId: "portugues",   materiaNome: "Português",   minutosSemanais: 300, maxSessao: 90 },
      { materiaId: "fisica",      materiaNome: "Física",      minutosSemanais: 240, maxSessao: 80 },
      { materiaId: "quimica",     materiaNome: "Química",     minutosSemanais: 240, maxSessao: 80 },
      { materiaId: "biologia",    materiaNome: "Biologia",    minutosSemanais: 180, maxSessao: 60 },
      { materiaId: "historia",    materiaNome: "História",    minutosSemanais: 180, maxSessao: 60 },
      { materiaId: "geografia",   materiaNome: "Geografia",   minutosSemanais: 180, maxSessao: 60 },
      { materiaId: "redacao",     materiaNome: "Redação",     minutosSemanais: 180, maxSessao: 60 },
    ],
  },
  bahiana: {
    nome: "BAHIANA",
    cor: "#3FA99B",
    desc: "Saúde: Biologia e Química com muito peso. Foco biomédico.",
    alocacoes: [
      { materiaId: "biologia",    materiaNome: "Biologia",    minutosSemanais: 480, maxSessao: 90 },
      { materiaId: "quimica",     materiaNome: "Química",     minutosSemanais: 360, maxSessao: 90 },
      { materiaId: "fisica",      materiaNome: "Física",      minutosSemanais: 240, maxSessao: 80 },
      { materiaId: "matematica",  materiaNome: "Matemática",  minutosSemanais: 180, maxSessao: 60 },
      { materiaId: "portugues",   materiaNome: "Português",   minutosSemanais: 180, maxSessao: 60 },
    ],
  },
  fgv_insper: {
    nome: "FGV/INSPER",
    cor: "#8A8FD6",
    desc: "Exatas e Inglês com peso alto. Foco em raciocínio lógico.",
    alocacoes: [
      { materiaId: "matematica",  materiaNome: "Matemática",  minutosSemanais: 480, maxSessao: 90 },
      { materiaId: "ingles",      materiaNome: "Inglês",      minutosSemanais: 240, maxSessao: 80 },
      { materiaId: "portugues",   materiaNome: "Português",   minutosSemanais: 240, maxSessao: 80 },
      { materiaId: "redacao",     materiaNome: "Redação",     minutosSemanais: 240, maxSessao: 80 },
      { materiaId: "historia",    materiaNome: "História",    minutosSemanais: 180, maxSessao: 60 },
    ],
  },
};

const DISP_PADRAO = { seg: 240, ter: 240, qua: 210, qui: 240, sex: 180, sab: 360, dom: 120 };

const DIAS = [
  { k: "seg", nome: "Segunda" }, { k: "ter", nome: "Terça" }, { k: "qua", nome: "Quarta" },
  { k: "qui", nome: "Quinta" }, { k: "sex", nome: "Sexta" }, { k: "sab", nome: "Sábado" }, { k: "dom", nome: "Domingo" },
];

// formata minutos → "4h30" / "45min" / "0min"

const fmtMin = (min) => {
  if (!min) return "0min";
  const h = Math.floor(min / 60), m = min % 60;
  if (h && m) return `${h}h${String(m).padStart(2, "0")}`;
  if (h) return `${h}h`;
  return `${m}min`;
};


// Helper: dado uma data ISO (YYYY-MM-DD), retorna a chave do dia da semana.

const dataParaDiaSemana = (iso) => {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  return ["dom", "seg", "ter", "qua", "qui", "sex", "sab"][dow];
};

// Agrupa revisões agendadas nos próximos 7 dias por dia-da-semana.

// CORREÇÃO 10: com `semana` (a segunda-feira, "YYYY-MM-DD"), entram as sessões
// com data dentro daquela semana. Sem ela, vale o comportamento antigo (hoje
// + 7 dias), que misturava a semana atual com a próxima pelo dia da semana.
function revisoesPorDiaSemana(revisoes, semana) {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const fim = new Date(hoje); fim.setDate(fim.getDate() + 7);
  const fimSemana = semana ? (() => { const [y, m, d] = semana.split("-").map(Number); return isoLocal(new Date(y, m - 1, d + 6)); })() : null;
  const out = { seg: [], ter: [], qua: [], qui: [], sex: [], sab: [], dom: [] };
  (revisoes || []).forEach((r) => {
    (r.sessoes || []).forEach((s) => {
      if (s.status !== "agendada") return;
      const [y, m, d] = s.dia.split("-").map(Number);
      const dt = new Date(y, m - 1, d); dt.setHours(0, 0, 0, 0);
      const dentro = semana ? s.dia >= semana && s.dia <= fimSemana : dt >= hoje && dt <= fim;
      if (dentro) {
        const k = dataParaDiaSemana(s.dia);
        if (k && out[k]) out[k].push({
          revisaoId: r.id, materiaId: r.materiaId || "", materia: r.materia,
          topicoId: r.topicoId, topico: r.topico, subtopicoId: r.subtopicoId || null, subtopico: r.subtopico || "",
          itemId: r.itemId || null, duracaoMin: r.duracaoMin, dia: s.dia,
        });
      }
    });
  });
  return out;
}

// CORREÇÃO 4: data local no formato YYYY-MM-DD (toISOString converte para UTC).
const isoLocal = (dt = new Date()) =>
  `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;

function semanaKey(dt = new Date()) {
  const d = new Date(dt); d.setHours(0, 0, 0, 0);
  const dow = d.getDay(); // 0=dom
  const seg = new Date(d); seg.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  return isoLocal(seg);
}

// CORREÇÃO 1: uma alocação cujo materiaId é o id de uma ÁREA vira uma alocação
// por matéria da área. Os minutos são repartidos pela carga horária dos tópicos,
// em múltiplos de 15 min; o que sobrar fica com a matéria de maior carga.
function expandirAlocacoes(alocacoes = []) {
  return alocacoes.flatMap((aloc) => {
    // CORREÇÃO 12: alocação marcada como matéria nunca é tratada como área
    // (a matéria "matematica" do curso tem o mesmo id da área do protótipo)
    const area = !aloc.ehMateria && AREAS.find((a) => a.id === aloc.materiaId);
    if (!area) return [aloc];
    const total = aloc.minutosSemanais || 0;
    const partes = area.materias.map((m) => ({
      m, carga: m.topicos.reduce((s, t) => s + (t.carga || 0), 0) || 1, min: 0,
    }));
    const cargaTotal = partes.reduce((s, x) => s + x.carga, 0);
    partes.forEach((x) => { x.min = Math.floor((total * x.carga) / cargaTotal / 15) * 15; });
    const porCarga = [...partes].sort((a, b) => b.carga - a.carga);
    let resto = total - partes.reduce((s, x) => s + x.min, 0);
    for (let i = 0; resto >= 15; i = (i + 1) % porCarga.length) { porCarga[i].min += 15; resto -= 15; }
    porCarga[0].min += resto;
    return partes.filter((x) => x.min > 0).map((x) => ({
      materiaId: x.m.id, materiaNome: x.m.nome, minutosSemanais: x.min,
      maxSessao: aloc.maxSessao, areaOrigem: area.id,
    }));
  });
}

// CORREÇÃO 2: o tópico da vez é o primeiro (na ordem do plano) que o aluno
// ainda não concluiu. Sem progresso informado, vale o comportamento antigo.
function topicoDaVez(materiaId, progresso) {
  const topicos = MATERIAS_FLAT.find((m) => m.id === materiaId)?.topicos || [];
  if (!progresso) return topicos[0];
  return topicos.find((t) => (progresso[t.id] || 0) < 100) || topicos[0];
}

// EXTENSÃO 9: o plano individual pode informar o conteúdo da vez de cada
// matéria (tópico e subtópico); sem isso, vale o tópico da vez da taxonomia fixa.
function conteudoDaSessao(materiaId, nomeMateria, opcoes) {
  const c = opcoes.conteudoDaVez?.(materiaId);
  if (c) return { topicoId: c.topicoId, topico: c.topico, subtopicoId: c.subtopicoId || null, subtopico: c.subtopico || "", itemId: c.itemId || null };
  const t = topicoDaVez(materiaId, opcoes.progresso);
  return { topicoId: t?.id, topico: t ? t.nome : nomeMateria };
}

// Divide `total` minutos no menor número de sessões de até `max`, o mais
// iguais possível, em múltiplos de 5 quando o total permite.
function dividirSessoes(total, max) {
  const teto = Math.max(1, Math.min(max, total));
  const n = Math.ceil(total / teto);
  const passo = total % 5 === 0 && teto >= 5 ? 5 : 1;
  const unidades = total / passo;
  const base = Math.floor(unidades / n);
  const extra = unidades % n;
  return Array.from({ length: n }, (_, i) => (base + (i < extra ? 1 : 0)) * passo);
}

function distribuirSemana(cicloConfig, disp, revisoes = [], opcoes = {}) {
  // normaliza: aceita tanto { alocacoes } quanto o formato legado { blocos }
  const alocacoes = expandirAlocacoes(cicloConfig?.alocacoes
    || (cicloConfig?.blocos || []).map((b) => ({ ...b, minutosSemanais: b.minutos * 5, maxSessao: b.minutos }))
    || []);

  const resultado = {};
  DIAS.forEach((d) => { resultado[d.k] = []; });

  // capacidade restante por dia (inicia com a disponibilidade total)
  const cap = {};
  DIAS.forEach((d) => { cap[d.k] = Math.max(0, disp[d.k] || 0); });

  // --- ETAPA 1: revisões espaçadas (prioridade) ---
  const revsPorDia = revisoesPorDiaSemana(revisoes, opcoes.semana);
  DIAS.forEach((d) => {
    (revsPorDia[d.k] || []).forEach((rev, idx) => {
      const dur = Math.min(rev.duracaoMin, cap[d.k]);
      if (dur >= 5) {
        resultado[d.k].push({
          id: `rev-${d.k}-${idx}-${rev.dia || ""}`,
          materiaId: rev.materiaId || "", materia: rev.materia,
          topicoId: rev.topicoId, topico: rev.topico, subtopicoId: rev.subtopicoId, subtopico: rev.subtopico, itemId: rev.itemId,
          minutos: dur, done: false, tipo: "revisao", revisaoId: rev.revisaoId,
        });
        cap[d.k] -= dur;
      }
    });
  });

  // --- ETAPA 2: sessões de cada matéria ---
  // Quebra o total semanal de cada matéria em sessões de no máximo maxSessao.
  // CORREÇÃO 11: as sessões saem equilibradas (105 min com máximo de 90 viram
  // 55 + 50, não 90 + 15), sem sobra picada no fim.
  const sessoesPorMateria = {};
  alocacoes.forEach((aloc) => {
    if (!aloc.minutosSemanais || aloc.minutosSemanais <= 0) return;
    const lista = dividirSessoes(aloc.minutosSemanais, aloc.maxSessao || 90)
      .filter((dur) => dur >= 15)
      .map((dur) => ({ ...aloc, minutos: dur }));
    if (lista.length > 0) sessoesPorMateria[aloc.materiaId] = lista;
  });

  // --- ETAPA 3: intercala sessões de diferentes matérias ---
  // [M1s1, M2s1, M3s1, M1s2, M2s2, M3s2, ...]  → variedade diária
  const arrays = Object.values(sessoesPorMateria);
  const interleaved = [];
  const maxLen = arrays.reduce((m, a) => Math.max(m, a.length), 0);
  for (let i = 0; i < maxLen; i++) {
    arrays.forEach((arr) => { if (arr[i]) interleaved.push(arr[i]); });
  }

  // --- ETAPA 4: best-fit greedy — maior capacidade restante que comporte a sessão ---
  interleaved.forEach((sessao, idx) => {
    // ordena dias por capacidade desc, pega o primeiro que cabe
    const dia = DIAS
      .filter((d) => cap[d.k] >= sessao.minutos)
      .sort((a, b) => cap[b.k] - cap[a.k])[0];
    if (!dia) return; // não coube em nenhum dia desta semana
    resultado[dia.k].push({
      id: `${dia.k}-${sessao.materiaId}-${idx}`,
      materiaId: sessao.materiaId, materia: sessao.materiaNome,
      ...conteudoDaSessao(sessao.materiaId, sessao.materiaNome, opcoes),
      minutos: sessao.minutos, done: false, tipo: "ciclo",
    });
    cap[dia.k] -= sessao.minutos;
  });

  return resultado;
}

function gerarSemana(cicloConfig, disp, revisoes = [], opcoes = {}) {
  return distribuirSemana(cicloConfig, disp, revisoes, opcoes);
}

function resumoCicloSemanal(cicloConfig, disp) {
  const totalDisp = Object.values(disp || {}).reduce((s, v) => s + v, 0);
  const alocacoes = cicloConfig?.alocacoes || [];
  const totalAloc = alocacoes.reduce((s, a) => s + (a.minutosSemanais || 0), 0);
  return { totalDisp, totalAloc, overflow: totalAloc > totalDisp };
}

function replanejarAtrasadas(atrasadas, disp, semanaAtual) {
  // capacidade livre de cada dia = disponibilidade(min) − já ocupado
  const ocupado = {};
  DIAS.forEach((d) => {
    const metasDia = (semanaAtual[d.k] || []).filter((m) => !m.done);
    ocupado[d.k] = metasDia.reduce((s, m) => s + m.minutos, 0);
  });
  const capacidade = {};
  DIAS.forEach((d) => { capacidade[d.k] = Math.max(0, (disp[d.k] || 0) - ocupado[d.k]); });

  // ordem dos próximos dias a partir de amanhã (índice 0 = segunda)
  const ordemDias = DIAS.map((d) => d.k);
  const plano = []; // { meta, diaKey, diaNome, minutos }
  let sobra = 0;

  atrasadas.forEach((meta) => {
    let restante = meta.minutos;
    // começa a alocar a partir do dia seguinte (i = 1) para não sobrecarregar hoje
    for (let i = 1; i < ordemDias.length && restante > 0; i++) {
      const dk = ordemDias[i];
      const livre = capacidade[dk];
      if (livre <= 0) continue;
      const aloca = Math.min(livre, restante);
      plano.push({ meta, diaKey: dk, diaNome: DIAS.find((d) => d.k === dk).nome, minutos: aloca });
      capacidade[dk] -= aloca;
      restante -= aloca;
    }
    if (restante > 0) sobra += restante; // não coube na janela desta semana
  });

  return { plano, sobra };
}

function recalcularPlanoInteligente(cicloConfig, disp, semanaAtual, atrasadas, revisoes = [], opcoes = {}) {
  // extrai alocações no novo formato ou converte do antigo
  const alocacoes = expandirAlocacoes(cicloConfig?.alocacoes
    || (cicloConfig?.blocos || []).map((b) => ({ ...b, minutosSemanais: b.minutos * 5, maxSessao: b.minutos }))
    || []);
  // CORREÇÃO 3: dias anteriores a opcoes.hoje não recebem metas novas
  const idxHoje = opcoes.hoje ? DIAS.findIndex((d) => d.k === opcoes.hoje) : 0;
  const jaPassou = (k) => DIAS.findIndex((d) => d.k === k) < idxHoje;
  // 1) tempo pendente por matéria = atrasadas + metas futuras não concluídas
  //    Revisões NÃO viram pendência — elas têm cronograma próprio e são preservadas.
  const pendentePorMat = {};
  const addPend = (mid, nome, min) => {
    if (!pendentePorMat[mid]) pendentePorMat[mid] = { materiaId: mid, materia: nome, minutos: 0 };
    pendentePorMat[mid].minutos += min;
  };
  (atrasadas || []).forEach((m) => addPend(m.materiaId, m.materia, m.minutos));
  DIAS.forEach((d) => (semanaAtual[d.k] || []).forEach((m) => {
    if (!m.done && m.tipo !== "revisao") addPend(m.materiaId, m.materia, m.minutos);
  }));

  // 2) revisões agendadas para esta semana (entram como prioritárias no dia certo)
  const revsPorDia = revisoesPorDiaSemana(revisoes, opcoes.semana);

  // 3) capacidade = disponibilidade − minutos JÁ CONCLUÍDOS no dia
  const capacidade = {};
  DIAS.forEach((d) => {
    const feitoMin = (semanaAtual[d.k] || []).filter((m) => m.done).reduce((s, m) => s + m.minutos, 0);
    capacidade[d.k] = jaPassou(d.k) ? 0 : Math.max(0, (disp[d.k] || 0) - feitoMin);
  });

  // 4) nova semana começa com as metas CONCLUÍDAS preservadas
  const novaSemana = {};
  DIAS.forEach((d) => { novaSemana[d.k] = (semanaAtual[d.k] || []).filter((m) => m.done); });

  // 5) injeta as REVISÕES agendadas como metas prioritárias, descontando capacidade
  let totalRevisoes = 0;
  DIAS.forEach((d) => {
    (revsPorDia[d.k] || []).forEach((rev, idx) => {
      const aloca = Math.min(rev.duracaoMin, capacidade[d.k]);
      if (aloca >= 5) {
        novaSemana[d.k].push({
          id: `rev-${d.k}-${idx}-${rev.dia}`,
          materiaId: rev.materiaId, materia: rev.materia,
          topicoId: rev.topicoId, topico: rev.topico, subtopicoId: rev.subtopicoId, subtopico: rev.subtopico, itemId: rev.itemId,
          minutos: aloca, done: false, tipo: "revisao", revisaoId: rev.revisaoId,
        });
        capacidade[d.k] -= aloca; totalRevisoes += aloca;
      }
    });
  });

  // 6) duas filas, nesta ordem:
  //    a) PENDÊNCIAS de cada matéria (CORREÇÃO 6: antes elas disputavam espaço
  //       com as sessões típicas, na ordem das alocações, e podiam ficar de fora);
  //    b) o que ainda FALTA da cota semanal de matérias sem pendência
  //       (CORREÇÃO 7: antes entrava uma "sessão típica" = semanal/5 para toda
  //       matéria sem pendência, mesmo com a cota da semana já cumprida).
  let totalRealocado = 0, materiasFundidas = 0;
  const feitoPorMat = {};
  DIAS.forEach((d) => (semanaAtual[d.k] || []).forEach((m) => {
    if (m.done && m.tipo !== "revisao") feitoPorMat[m.materiaId] = (feitoPorMat[m.materiaId] || 0) + m.minutos;
  }));
  const filaPendencias = [], filaCota = [];
  alocacoes.forEach((aloc) => {
    const sessaoTipica = Math.min(aloc.maxSessao || 90, Math.round((aloc.minutosSemanais || 0) / 5));
    const pend = pendentePorMat[aloc.materiaId];
    if (pend && pend.minutos > 0) {
      filaPendencias.push({ ...pend, fundida: pend.minutos > sessaoTipica });
      if (pend.minutos > sessaoTipica) materiasFundidas++;
    } else {
      const falta = (aloc.minutosSemanais || 0) - (feitoPorMat[aloc.materiaId] || 0);
      if (falta >= 15) filaCota.push({ materiaId: aloc.materiaId, materia: aloc.materiaNome, minutos: falta, fundida: false });
    }
  });
  // CORREÇÃO 5: pendências de matérias fora do ciclo (ex.: tempo extra pedido
  // pelo aluno) também voltam para a fila, em vez de sumirem no recálculo.
  Object.values(pendentePorMat).forEach((pend) => {
    if (pend.minutos > 0 && !filaPendencias.some((f) => f.materiaId === pend.materiaId)) filaPendencias.push({ ...pend, fundida: false });
  });

  // 7) distribui cada fila pelos dias, em rodadas, respeitando o teto (já
  //    descontadas as revisões). CORREÇÃO 8: pendência que não couber não é
  //    descartada; volta em resumo.naoCouberam para continuar como atrasada.
  const naoCouberam = [];
  let seq = 0;
  const distribuir = (fila, guardarSobra) => {
    let guard = 0, idx = 0;
    while (fila.some((f) => f.minutos > 0) && guard < 200) {
      const item = fila[idx % fila.length];
      if (item.minutos > 0) {
        const dk = DIAS.map((d) => d.k).find((k) => capacidade[k] >= Math.min(15, item.minutos));
        if (dk) {
          const aloca = Math.min(capacidade[dk], item.minutos);
          novaSemana[dk].push({
            id: `r${Date.now()}-${seq++}`, materiaId: item.materiaId, materia: item.materia,
            ...conteudoDaSessao(item.materiaId, item.materia, opcoes),
            minutos: aloca, done: false, replanejada: true, tipo: "ciclo",
          });
          capacidade[dk] -= aloca; item.minutos -= aloca; totalRealocado += aloca;
        } else {
          if (guardarSobra) naoCouberam.push({ materiaId: item.materiaId, materia: item.materia, minutos: item.minutos });
          item.minutos = 0; // sem folga em lugar nenhum
        }
      }
      idx++; guard++;
    }
    if (guardarSobra) fila.filter((f) => f.minutos > 0).forEach((f) => naoCouberam.push({ materiaId: f.materiaId, materia: f.materia, minutos: f.minutos }));
  };
  distribuir(filaPendencias, true);
  distribuir(filaCota, false);

  return {
    semana: novaSemana,
    resumo: {
      totalRealocado, materiasFundidas, qtdPendencias: Object.keys(pendentePorMat).length, totalRevisoes,
      naoCouberam, minutosSemEspaco: naoCouberam.reduce((s, x) => s + x.minutos, 0),
    },
  };
}

const CATEGORIAS_PLAYLIST = [
  { id: "introducao", nome: "Introdução ao curso" },
  { id: "atualidades", nome: "Atualidades" },
  { id: "redacao", nome: "Redação" },
  { id: "outro", nome: "Outros cursos" },
];

const CORES_PLAYLIST = ["#C9793A", "#4B8FC4", "#8FB3FF", "#5AA555", "#FF6B5E", "#3FA99B", "#C9A13A"];

function provedorDoLink(url = "") {
  if (/youtu\.?be/i.test(url)) return "YouTube";
  if (/vimeo\.com/i.test(url)) return "Vimeo";
  if (/pandavideo/i.test(url)) return "Panda Video";
  if (/drive\.google/i.test(url)) return "Google Drive";
  return "Link externo";
}

const COMPETENCIAS_ENEM = [
  { id: "c1", nome: "C1 · Norma-padrão da língua escrita" },
  { id: "c2", nome: "C2 · Compreensão da proposta e repertório" },
  { id: "c3", nome: "C3 · Seleção e organização dos argumentos" },
  { id: "c4", nome: "C4 · Coesão textual" },
  { id: "c5", nome: "C5 · Proposta de intervenção" },
];

const CANAIS_ENVIO = [
  { id: "whatsapp", nome: "WhatsApp" }, { id: "email", nome: "E-mail" },
  { id: "presencial", nome: "Em mãos" }, { id: "outro", nome: "Outro" },
];

const INSTRUCOES_REDACAO_INICIAL = "Envie sua redação (foto nítida ou PDF) pelo WhatsApp da turma, com o tema no começo da mensagem. A devolutiva aparece aqui em até 7 dias.";

// ENEM usa competências; os demais vestibulares começam com nota livre (o moderador pode trocar)

const rubricaPadrao = (vest) => (vest === "enem" || vest === "enem_med" ? "enem" : "livre");

const hojeISO = () => isoLocal(new Date());

const fmtData = (iso) => (iso ? iso.split("-").reverse().join("/") : "");

// Nota total e percentual da nota máxima (permite comparar ENEM com nota livre)

function notaDevolutiva(d) {
  if (d.rubrica === "enem") {
    const total = COMPETENCIAS_ENEM.reduce((s, c) => s + (Number(d.notas?.[c.id]) || 0), 0);
    return { total, max: 1000, pct: total / 10, texto: String(total) };
  }
  const n = Number(d.notaLivre) || 0, m = Number(d.escalaLivre) || 10;
  return { total: n, max: m, pct: m ? (n / m) * 100 : 0, texto: `${n} / ${m}` };
}

export {
  AREAS,
  MATERIAS_FLAT,
  TOPICOS_FLAT,
  topicosDaMateria,
  VESTIBULARES,
  vestInfo,
  CICLO_TEMPLATES,
  DISP_PADRAO,
  DIAS,
  fmtMin,
  dataParaDiaSemana,
  revisoesPorDiaSemana,
  isoLocal,
  semanaKey,
  expandirAlocacoes,
  topicoDaVez,
  distribuirSemana,
  dividirSessoes,
  gerarSemana,
  resumoCicloSemanal,
  replanejarAtrasadas,
  recalcularPlanoInteligente,
  CATEGORIAS_PLAYLIST,
  CORES_PLAYLIST,
  provedorDoLink,
  COMPETENCIAS_ENEM,
  CANAIS_ENVIO,
  INSTRUCOES_REDACAO_INICIAL,
  rubricaPadrao,
  hojeISO,
  fmtData,
  notaDevolutiva,
};
