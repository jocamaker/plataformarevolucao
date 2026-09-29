import { Suspense, useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Bell, ChevronDown, GraduationCap, LogOut, Moon, RotateCcw, Sun } from "lucide-react";
import { useApp } from "../state/AppContext.jsx";
import { useNotificacoes, useMigracaoMotor } from "../state/hooks.js";
import { useTema } from "../state/tema.js";
import { baseDoPapel, todosDoMenu } from "../navegacao.js";
import { MenuCheio } from "../ui/MenuCheio.jsx";
import { Botao, Carregando, Marca } from "../ui/ui.jsx";
import { LimiteDeErro } from "../ui/Falha.jsx";

// sino com os avisos não lidos (só aluno)
function Sino({ alunoId, rota }) {
  const avisos = useNotificacoes(alunoId) || [];
  const novos = avisos.filter((n) => !n.lidaEm).length;
  return (
    <NavLink to={rota} className="icone-btn sino" aria-label={novos ? `${novos} ${novos === 1 ? "aviso novo" : "avisos novos"}` : "Avisos"} title="Avisos">
      <Bell />{novos > 0 && <span className="sino-contador num" aria-hidden="true">{novos > 9 ? "9+" : novos}</span>}
    </NavLink>
  );
}

/* Moldura das telas internas: cabeçalho com os itens principais (ícone e
   nome) e um menu suspenso (Extra/Mais), tema, conta; no celular, menu em
   tela cheia. */
export default function Shell({ menu }) {
  const { usuario, sair, recomecarDemonstracao, modo } = useApp();
  useMigracaoMotor(usuario?.role === "moderador"); // jornadas antigas → motor de blocos e pesos
  const [tema, alternarTema] = useTema();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const base = baseDoPapel(usuario.role);
  const [rolou, setRolou] = useState(false);
  const [aberto, setAberto] = useState(null); // "mais" | "conta" | null
  const [menuCel, setMenuCel] = useState(false);

  useEffect(() => {
    const f = () => setRolou(window.scrollY > 8);
    f();
    window.addEventListener("scroll", f, { passive: true });
    return () => window.removeEventListener("scroll", f);
  }, []);
  useEffect(() => { window.scrollTo(0, 0); setAberto(null); }, [pathname]);
  useEffect(() => {
    if (!aberto) return undefined;
    const esc = (e) => { if (e.key === "Escape") setAberto(null); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [aberto]);

  const rota = (item) => `${base}/${item.k}`;
  const principais = menu.topo;
  const extras = menu.extra.itens;
  const extraAtivo = extras.some((i) => pathname.startsWith(rota(i)));
  const alternar = (qual) => setAberto((a) => (a === qual ? null : qual));
  const primeiro = (usuario.nome || "").split(" ")[0];
  const IconeTema = tema === "light" ? Moon : Sun;

  const recomecar = async () => {
    setAberto(null);
    if (!window.confirm("Apagar todos os dados deste navegador e recomeçar a demonstração?")) return;
    await recomecarDemonstracao();
    navigate("/entrar");
  };

  return (
    <div className="app">
      <header className={`app-topo${rolou ? " rolou" : ""}`}>
        <NavLink to={base} aria-label="Início"><Marca /></NavLink>

        <nav className="app-nav" aria-label="Principal">
          {principais.map((item) => (
            <NavLink key={item.k} to={rota(item)} className="app-nav-item"><item.icone aria-hidden="true" />{item.label}</NavLink>
          ))}
          {extras.length > 0 && (
            <div style={{ position: "relative" }}>
              <button type="button" className="app-nav-item" aria-expanded={aberto === "mais"} data-ativo={extraAtivo} onClick={() => alternar("mais")}>
                {menu.extra.label}<ChevronDown aria-hidden="true" className="app-nav-seta" />
              </button>
              {aberto === "mais" && (
                <div className="painel" style={{ right: "auto", left: 0 }}>
                  {extras.map((item) => (
                    <NavLink key={item.k} to={rota(item)}><item.icone aria-hidden="true" />{item.label}</NavLink>
                  ))}
                </div>
              )}
            </div>
          )}
        </nav>

        <div className="app-acoes">
          {usuario.role === "aluno" && <Sino alunoId={usuario.uid} rota={`${base}/avisos`} />}
          <button type="button" className="icone-btn opcional" onClick={alternarTema}
            aria-label={tema === "light" ? "Usar tema escuro" : "Usar tema claro"} title="Alternar tema">
            <IconeTema />
          </button>
          <div className="opcional" style={{ position: "relative" }}>
            <Botao variante="solido" tamanho="sm" aria-expanded={aberto === "conta"} onClick={() => alternar("conta")}>
              <span className="conta-inicial" aria-hidden="true">{(usuario.nome || "?").charAt(0)}</span>{primeiro}
            </Botao>
            {aberto === "conta" && (
              <div className="painel">
                <div className="painel-cabeca">
                  <strong>{usuario.nome}</strong>
                  <span>{usuario.email}</span>
                  <span>{usuario.role === "moderador" ? "Moderador" : "Aluno"}</span>
                </div>
                <hr />
                {usuario.role === "aluno" && <button type="button" onClick={() => navigate(`${base}/boas-vindas`)}><GraduationCap />Sobre o curso</button>}
                {modo === "local" && <>
                  <hr />
                  <p className="painel-nota">Demonstração: os dados ficam só neste navegador.</p>
                  <button type="button" onClick={recomecar}><RotateCcw />Recomeçar a demonstração</button>
                </>}
                <button type="button" onClick={sair}><LogOut />Sair</button>
              </div>
            )}
          </div>
          <button type="button" className="burger" aria-expanded={menuCel} aria-controls="menu-app"
            aria-label="Abrir menu" onClick={() => setMenuCel(true)}>
            <span /><span /><span />
          </button>
        </div>
      </header>
      {aberto && <div style={{ position: "fixed", inset: 0, zIndex: 30 }} onClick={() => setAberto(null)} aria-hidden="true" />}

      <MenuCheio aberto={menuCel} aoFechar={() => setMenuCel(false)} id="menu-app" className="menu-cheio--app"
        rodape={<>
          <Botao variante="vidro" icone={IconeTema} onClick={alternarTema}>{tema === "light" ? "Tema escuro" : "Tema claro"}</Botao>
          <Botao variante="vidro" icone={LogOut} onClick={sair}>Sair</Botao>
        </>}>
        <div className="menu-cheio-lista">
          {todosDoMenu(menu).map((item) => (
            <NavLink key={item.k} to={rota(item)} className="metal" onClick={() => setMenuCel(false)}>
              <item.icone aria-hidden="true" />{item.label}
            </NavLink>
          ))}
        </div>
      </MenuCheio>

      <main className="app-main" key={pathname}>
        {/* um erro numa tela fica nela; a troca de aba remonta tudo aqui */}
        <LimiteDeErro>
          <Suspense fallback={<Carregando />}>
            <Outlet />
          </Suspense>
        </LimiteDeErro>
      </main>
    </div>
  );
}
