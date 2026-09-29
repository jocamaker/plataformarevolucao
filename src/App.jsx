import { lazy, Suspense } from "react";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppProvider, rotaInicial, useApp } from "./state/AppContext.jsx";
import { MENU_ALUNO, MENU_MODERADOR } from "./navegacao.js";
import { Carregando } from "./ui/ui.jsx";
import { LimiteDeErro } from "./ui/Falha.jsx";
import Login from "./screens/Login.jsx";
import Shell from "./screens/Shell.jsx";
import { AcessoBloqueado, Instalacao } from "./screens/Acesso.jsx";
import { BoasVindasPagina } from "./screens/Paginas.jsx";
import Inicio from "./screens/aluno/Inicio.jsx";
import EditalAluno from "./screens/aluno/Edital.jsx";
import QuestoesAluno from "./screens/aluno/Questoes.jsx";
import SimuladosAluno from "./screens/aluno/Simulados.jsx";
import DesempenhoAluno from "./screens/aluno/Desempenho.jsx";
import MateriaisAluno, { AreaMateriaisAluno } from "./screens/aluno/Materiais.jsx";
import AvisosAluno from "./screens/aluno/Avisos.jsx";
import { CursosAluno, PlaylistAluno } from "./screens/aluno/Cursos.jsx";
import { RedacaoAluno, RedacoesAluno } from "./screens/aluno/Redacao.jsx";
// telas do moderador: baixadas só por quem é moderador
const sob = (carregar, nome = "default") => lazy(() => carregar().then((m) => ({ default: m[nome] })));
const Alunos = sob(() => import("./screens/moderador/Alunos.jsx"));
const AlunoPainel = sob(() => import("./screens/moderador/AlunoPainel.jsx"));
const Jornadas = sob(() => import("./screens/moderador/Jornadas.jsx"), "Jornadas");
const Jornada = sob(() => import("./screens/moderador/Jornadas.jsx"), "Jornada");
const Pesos = sob(() => import("./screens/moderador/Pesos.jsx"));
const Estrutura = sob(() => import("./screens/moderador/Estrutura.jsx"));
const MateriaisModerador = sob(() => import("./screens/moderador/Materiais.jsx"));
const AreaMateriaisModerador = sob(() => import("./screens/moderador/Materiais.jsx"), "AreaMateriaisModerador");
const AvisosModerador = sob(() => import("./screens/moderador/Avisos.jsx"));
const ProvasModerador = sob(() => import("./screens/moderador/Provas.jsx"));
const Textos = sob(() => import("./screens/moderador/Textos.jsx"));
const CursosModerador = sob(() => import("./screens/moderador/Cursos.jsx"), "CursosModerador");
const PlaylistModerador = sob(() => import("./screens/moderador/Cursos.jsx"), "PlaylistModerador");
const RedacaoModerador = sob(() => import("./screens/moderador/Redacao.jsx"), "RedacaoModerador");
// módulo isolado de flashcards (src/modules/flashcards): baixado só quando o aluno abre
const Flashcards = lazy(() => import("./modules/flashcards/index.jsx"));

function Tela({ children }) {
  const { usuario, erro, s } = useApp();
  if (erro) return <div className="tela-centro"><p className="aviso aviso--erro">Não foi possível iniciar: {erro.message}</p></div>;
  if (!s || usuario === undefined) return <div className="tela-centro"><Carregando /></div>;
  return <Suspense fallback={<div className="tela-centro"><Carregando /></div>}>{children}</Suspense>;
}

function Protegida({ papel, children }) {
  const { usuario } = useApp();
  if (!usuario) return <Navigate to="/entrar" replace />;
  if (usuario.semPerfil || usuario.bloqueado) return <AcessoBloqueado />;
  if (papel && usuario.role !== papel) return <Navigate to={rotaInicial(usuario)} replace />;
  return children;
}

function Raiz() {
  const { usuario } = useApp();
  return <Navigate to={usuario?.role ? rotaInicial(usuario) : "/entrar"} replace />;
}

// Logou (ou já estava logado): vai direto para a primeira tela do papel.
function Entrada() {
  const { usuario } = useApp();
  if (usuario?.semPerfil || usuario?.bloqueado) return <AcessoBloqueado />;
  return usuario ? <Navigate to={rotaInicial(usuario)} replace /> : <Login />;
}

export default function App() {
  return (
    <LimiteDeErro telaInteira>
      <AppProvider>
        <HashRouter>
          <Tela>
            <Routes>
              <Route path="/" element={<Raiz />} />
              <Route path="/entrar" element={<Entrada />} />
              <Route path="/instalar" element={<Instalacao />} />
              <Route path="/boas-vindas" element={<Raiz />} />
              <Route path="/aluno" element={<Protegida papel="aluno"><Shell menu={MENU_ALUNO} /></Protegida>}>
                <Route index element={<Navigate to="inicio" replace />} />
                <Route path="inicio" element={<Inicio />} />
                <Route path="semana" element={<Navigate to="/aluno/inicio?ver=semana" replace />} />
                <Route path="edital" element={<EditalAluno />} />
                <Route path="plano" element={<Navigate to="/aluno/edital" replace />} />
                <Route path="questoes" element={<QuestoesAluno />} />
                <Route path="simulados" element={<SimuladosAluno />} />
                <Route path="desempenho" element={<DesempenhoAluno />} />
                <Route path="materiais" element={<MateriaisAluno />} />
                <Route path="materiais/:areaId" element={<AreaMateriaisAluno />} />
                <Route path="avisos" element={<AvisosAluno />} />
                <Route path="cursos" element={<CursosAluno />} />
                <Route path="cursos/:id" element={<PlaylistAluno />} />
                <Route path="redacao" element={<RedacoesAluno />} />
                <Route path="redacao/:id" element={<RedacaoAluno />} />
                <Route path="boas-vindas" element={<BoasVindasPagina />} />
                <Route path="flashcards/*" element={<Flashcards />} />
                <Route path="*" element={<Navigate to="inicio" replace />} />
              </Route>
              <Route path="/moderador" element={<Protegida papel="moderador"><Shell menu={MENU_MODERADOR} /></Protegida>}>
                <Route index element={<Navigate to="alunos" replace />} />
                <Route path="alunos" element={<Alunos />} />
                <Route path="alunos/:id" element={<AlunoPainel />} />
                <Route path="alunos/:id/redacao/:did" element={<RedacaoModerador />} />
                <Route path="jornadas" element={<Jornadas />} />
                <Route path="jornadas/:id" element={<Jornada />} />
                <Route path="pesos" element={<Pesos />} />
                <Route path="planos/*" element={<Navigate to="/moderador/jornadas" replace />} />
                <Route path="estrutura" element={<Estrutura />} />
                <Route path="materiais" element={<MateriaisModerador />} />
                <Route path="materiais/:areaId" element={<AreaMateriaisModerador />} />
                <Route path="simulados" element={<ProvasModerador />} />
                <Route path="avisos" element={<AvisosModerador />} />
                <Route path="textos" element={<Textos />} />
                <Route path="cursos" element={<CursosModerador />} />
                <Route path="cursos/:id" element={<PlaylistModerador />} />
                <Route path="redacao/*" element={<Navigate to="/moderador/alunos" replace />} />
                <Route path="*" element={<Navigate to="alunos" replace />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Tela>
        </HashRouter>
      </AppProvider>
    </LimiteDeErro>
  );
}
