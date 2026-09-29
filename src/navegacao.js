import {
  FileQuestion, FileText, House, Layers, Library, ListChecks, Map as Mapa, Megaphone, Network, PenLine, PlayCircle, TrendingUp, Type, Users,
} from "lucide-react";

/* Menus por papel: `topo` vira pílulas no cabeçalho; `extra` é o menu
   suspenso. No celular, tudo vai para o menu em tela cheia. */

export const MENU_ALUNO = {
  topo: [
    { k: "inicio", label: "Dashboard", icone: House },
    { k: "edital", label: "Edital", icone: ListChecks },
    { k: "flashcards", label: "Flashcards", icone: Layers },
    { k: "cursos", label: "Meus cursos", icone: PlayCircle },
    { k: "redacao", label: "Redação", icone: PenLine },
    { k: "desempenho", label: "Desempenho", icone: TrendingUp },
  ],
  extra: {
    label: "Extra",
    itens: [
      { k: "questoes", label: "Questões", icone: FileQuestion },
      { k: "simulados", label: "Simulados", icone: FileText },
      { k: "materiais", label: "Materiais", icone: Library },
    ],
  },
};

export const MENU_MODERADOR = {
  topo: [
    { k: "alunos", label: "Alunos", icone: Users },
    { k: "jornadas", label: "Jornadas", icone: Mapa },
    { k: "materiais", label: "Materiais", icone: Library },
    { k: "simulados", label: "Simulados", icone: FileText },
    { k: "cursos", label: "Aulas em vídeo", icone: PlayCircle },
  ],
  extra: {
    label: "Mais",
    itens: [
      { k: "avisos", label: "Avisos", icone: Megaphone },
      { k: "textos", label: "Textos e boas-vindas", icone: Type },
      { k: "estrutura", label: "Matérias e vestibulares", icone: Network },
    ],
  },
};

export const todosDoMenu = (menu) => [...menu.topo, ...menu.extra.itens];
export const baseDoPapel = (role) => (role === "moderador" ? "/moderador" : "/aluno");
