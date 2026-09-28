/* Frases editáveis pelo moderador.
   Marcação: *palavra* vira destaque; Enter quebra a linha (títulos grandes);
   {nome}, {saudacao} e {vestibular} são trocados pelos dados do aluno.
   Resolução, do mais específico ao geral: texto do aluno → do curso dele →
   do vestibular dele → texto geral → padrão abaixo.
   Dados: config/textos { geral, porGrupo: { "curso:ID" | "vestibular:ID" }, corDestaque }
          textosAluno/{uid} { textos } */

export const COR_DESTAQUE_PADRAO = "#D9B56B";

export const CORES_SUGERIDAS = [
  { nome: "Ouro", cor: "#D9B56B" },
  { nome: "Prata", cor: "#C9CED6" },
  { nome: "Branco", cor: "#FFFFFF" },
  { nome: "Cinza", cor: "#9A9A9A" },
  { nome: "Gelo", cor: "#9DBEFF" },
  { nome: "Rubi", cor: "#E0606A" },
];

export const VARIAVEIS = ["nome", "saudacao", "vestibular"];

export const GRUPOS = [
  { id: "inicial", titulo: "Página inicial", descricao: "Tela de login. É pública, então vale para todos os visitantes.", porAluno: false },
  { id: "boasvindas", titulo: "Boas-vindas do aluno", descricao: "Tela que o aluno vê logo depois de entrar.", porAluno: true },
  { id: "painel", titulo: "Painel do aluno", descricao: "Títulos e mensagens dentro da plataforma.", porAluno: true },
];

// tipo: "cinema" (título grande sobre o vídeo), "titulo" (título de página), "linha", "paragrafo"
export const TEXTOS = {
  "inicial.selo": { grupo: "inicial", tipo: "linha", rotulo: "Selo acima da frase", padrao: "Plataforma de estudos para vestibular" },
  "inicial.titulo": { grupo: "inicial", tipo: "cinema", rotulo: "Frase principal", padrao: "Bem-vindo à *elite*." },
  "inicial.lede": { grupo: "inicial", tipo: "paragrafo", rotulo: "Texto de apoio", padrao: "Ciclos de estudo por vestibular, metas diárias que cabem na sua rotina e revisões no tempo certo, com o professor acompanhando." },

  "boasvindas.selo": { grupo: "boasvindas", tipo: "linha", rotulo: "Selo", padrao: "Foco: {vestibular}" },
  "boasvindas.saudacao": { grupo: "boasvindas", tipo: "cinema", rotulo: "Primeira linha", padrao: "{saudacao}, {nome}." },
  "boasvindas.comMetas": { grupo: "boasvindas", tipo: "cinema", rotulo: "Segunda linha, em dia com metas", padrao: "Suas metas de hoje *já estão prontas*." },
  "boasvindas.semMetas": { grupo: "boasvindas", tipo: "cinema", rotulo: "Segunda linha, em dia livre", padrao: "Hoje é dia *livre*." },

  "painel.dashboard.titulo": { grupo: "painel", tipo: "titulo", rotulo: "Título do Dashboard", padrao: "Seu *dashboard*" },
  "painel.dashboard.vazioTitulo": { grupo: "painel", tipo: "linha", rotulo: "Dia sem metas: título", padrao: "Nenhuma meta para hoje" },
  "painel.dashboard.vazioTexto": { grupo: "painel", tipo: "paragrafo", rotulo: "Dia sem metas: texto", padrao: "Dia livre no seu plano. Use para revisar ou registrar estudo por fora." },
  "painel.semana.texto": { grupo: "painel", tipo: "paragrafo", rotulo: "Instrução da semana (Dashboard)", padrao: "Arraste uma meta para outro dia, ou toque nela e depois no dia. Só vale para esta semana; as próximas continuam automáticas." },
  "painel.boasvindas.titulo": { grupo: "painel", tipo: "titulo", rotulo: "Título da página Boas-Vindas", padrao: "Boas-vindas ao *curso*" },
  "painel.plano.titulo": { grupo: "painel", tipo: "titulo", rotulo: "Título do Edital", padrao: "Seu *edital*" },
  "painel.questoes.titulo": { grupo: "painel", tipo: "titulo", rotulo: "Título de Questões", padrao: "Suas *questões*" },
  "painel.simulados.titulo": { grupo: "painel", tipo: "titulo", rotulo: "Título de Simulados", padrao: "Seus *simulados*" },
  "painel.desempenho.titulo": { grupo: "painel", tipo: "titulo", rotulo: "Título de Desempenho", padrao: "Seu *desempenho*" },
  "painel.materiais.titulo": { grupo: "painel", tipo: "titulo", rotulo: "Título de Materiais", padrao: "Materiais de *estudo*" },
  "painel.cursos.titulo": { grupo: "painel", tipo: "titulo", rotulo: "Título de Meus cursos", padrao: "Meus *cursos*" },
  "painel.redacao.titulo": { grupo: "painel", tipo: "titulo", rotulo: "Título de Redação", padrao: "Suas *redações*" },
};

export const grupoDoCurso = (id) => `curso:${id}`;
export const grupoDoVestibular = (id) => `vestibular:${id}`;

/* Camadas que valem para um aluno, da mais específica à mais geral. */
export function camadasDoAluno(config, { doAluno, vestibularId, cursoId } = {}) {
  return [
    doAluno,
    cursoId && config?.porGrupo?.[grupoDoCurso(cursoId)],
    vestibularId && config?.porGrupo?.[grupoDoVestibular(vestibularId)],
    config?.geral,
  ].filter(Boolean);
}

// Texto efetivo de uma chave. Campo vazio conta como "sem personalização".
export function textoDe(config, chave, contexto = {}) {
  for (const camada of camadasDoAluno(config, contexto)) {
    if (String(camada[chave] ?? "").trim()) return camada[chave];
  }
  return TEXTOS[chave]?.padrao || "";
}

export function preencher(texto, vars = {}) {
  return String(texto ?? "").replace(/\{(\w+)\}/g, (marca, chave) => (vars[chave] != null ? vars[chave] : marca));
}

export const linhasDe = (texto) => String(texto ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

// "Bem-vindo à *elite*." → [{ texto: "Bem-vindo à " }, { texto: "elite", destaque: true }, { texto: "." }]
export function partesDe(linha) {
  const partes = [];
  const re = /\*([^*]+)\*/g;
  let i = 0, m;
  while ((m = re.exec(linha))) {
    if (m.index > i) partes.push({ texto: linha.slice(i, m.index) });
    partes.push({ texto: m[1], destaque: true });
    i = re.lastIndex;
  }
  if (i < linha.length) partes.push({ texto: linha.slice(i) });
  return partes;
}

// "Prof. Moderador" → "Prof" (o ponto final vem da frase, não do nome)
export const primeiroNome = (nome = "") => nome.trim().split(/\s+/)[0].replace(/\.+$/, "");

export function saudacao(agora = new Date()) {
  const h = agora.getHours();
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}
