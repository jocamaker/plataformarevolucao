import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, X } from "lucide-react";
import { Marca } from "./ui.jsx";
import { COR_DESTAQUE_PADRAO, linhasDe, partesDe } from "../textos.js";

// Vídeo do herói (endereço passado pelo cliente). 🔥 Ideal: hospedar o arquivo
// junto do site; se este link expirar, o fundo fica preto. VITE_VIDEO_FUNDO
// troca o endereço no build (usado nos testes).
export const VIDEO_FUNDO = import.meta.env.VITE_VIDEO_FUNDO
  || "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260818_072341_50851634-bbc3-4c33-9acc-7647d4db44aa.mp4";

/* O vídeo é a identidade visual: toca sempre, em loop, inclusive com
   "reduzir movimento" ligado no sistema (decisão do cliente). Só pausa com a
   aba escondida, para poupar bateria, e retoma ao voltar. */
function VideoFundo() {
  const ref = useRef(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return undefined;
    // o atributo muted do React nem sempre chega ao DOM, e sem ele o autoplay falha
    v.muted = true;
    v.defaultMuted = true;
    v.playsInline = true;

    const gestos = ["pointerdown", "keydown", "touchstart", "scroll"];
    const aoGesto = () => { gestos.forEach((g) => window.removeEventListener(g, aoGesto)); tocar(); };
    // autoplay bloqueado pelo navegador: tenta de novo na primeira interação
    const esperarGesto = () => gestos.forEach((g) => window.addEventListener(g, aoGesto, { passive: true }));
    function tocar() {
      if (document.hidden || !v.paused) return;
      v.play()?.catch(esperarGesto);
    }
    const aoMudarAba = () => (document.hidden ? v.pause() : tocar());
    // algo pausou com a aba visível (economia de energia, etc.): retoma
    const aoPausar = () => { if (!document.hidden) setTimeout(tocar, 250); };

    v.addEventListener("loadeddata", tocar);
    v.addEventListener("canplay", tocar);
    v.addEventListener("pause", aoPausar);
    document.addEventListener("visibilitychange", aoMudarAba);
    tocar();
    return () => {
      v.removeEventListener("loadeddata", tocar);
      v.removeEventListener("canplay", tocar);
      v.removeEventListener("pause", aoPausar);
      document.removeEventListener("visibilitychange", aoMudarAba);
      gestos.forEach((g) => window.removeEventListener(g, aoGesto));
    };
  }, []);
  return (
    <div className="cine-video" aria-hidden="true">
      <video ref={ref} autoPlay muted loop playsInline preload="auto" disablePictureInPicture disableRemotePlayback tabIndex={-1}>
        <source src={VIDEO_FUNDO} />
      </video>
    </div>
  );
}

function ItemNav({ item, atraso }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!aberto) return undefined;
    const fora = (e) => { if (!ref.current?.contains(e.target)) setAberto(false); };
    const esc = (e) => { if (e.key === "Escape") setAberto(false); };
    document.addEventListener("pointerdown", fora);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", fora); document.removeEventListener("keydown", esc); };
  }, [aberto]);

  const classe = "metal aparece " + (atraso % 2 ? "aparece--suave" : "aparece--escala");
  const estilo = { "--d": `${0.16 + atraso * 0.12}s` };
  if (!item.submenu) {
    return <button type="button" className={classe} style={estilo} onClick={item.onClick}>{item.label}</button>;
  }
  return (
    <div className="submenu" ref={ref}>
      <button type="button" className={classe} style={estilo} aria-expanded={aberto} aria-haspopup="true" onClick={() => setAberto(!aberto)}>
        {item.label}<ChevronDown aria-hidden="true" />
      </button>
      {aberto && (
        <div className="submenu-painel" role="menu">
          {item.submenu.map((s) => (
            <button key={s.label} type="button" role="menuitem" onClick={() => { setAberto(false); s.onClick(); }}>{s.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

/* Menu em tela cheia do celular. Vai para o <body> num portal para não ficar
   preso ao contexto de empilhamento do cabeçalho. */
export function MenuCheio({ aberto, aoFechar, id, children, rodape, escuro, className = "" }) {
  useEffect(() => {
    if (!aberto) return undefined;
    const esc = (e) => { if (e.key === "Escape") aoFechar(); };
    const largo = window.matchMedia("(min-width: 1101px)");
    const mudou = (e) => { if (e.matches) aoFechar(); };
    document.addEventListener("keydown", esc);
    largo.addEventListener("change", mudou);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", esc);
      largo.removeEventListener("change", mudou);
      document.body.style.overflow = "";
    };
  }, [aberto, aoFechar]);

  if (!aberto) return null;
  return createPortal(
    <div className={`menu-cheio ${className}`} id={id} role="dialog" aria-modal="true" aria-label="Menu" data-theme={escuro ? "dark" : undefined}>
      <div className="menu-cheio-topo">
        <Marca />
        <button type="button" className="icone-btn" onClick={aoFechar} aria-label="Fechar menu" autoFocus><X /></button>
      </div>
      {children}
      {rodape && <div className="menu-cheio-rodape">{rodape}</div>}
    </div>,
    document.body,
  );
}

/* Título grande do cinema: uma linha mascarada por linha do texto, *destaque*
   na cor escolhida pelo moderador. Também serve de prévia no editor. */
export function TituloCinema({ texto, animar = true }) {
  return (
    <h1>
      {linhasDe(texto).map((linha, i) => (
        <span key={i} className="linha-titulo">
          <span className={animar ? "aparece aparece--mascara" : undefined} style={animar ? { "--d": `${0.42 + i * 0.2}s` } : undefined}>
            {partesDe(linha).map((p, j) => (p.destaque ? <em key={j}>{p.texto}</em> : p.texto))}
          </span>
        </span>
      ))}
    </h1>
  );
}

/* Moldura de cinema: a landing original, agora com conteúdo variável.
   `titulo` já vem com as variáveis preenchidas; Enter no texto quebra a linha. */
export function Cinema({ nav = [], acoes, selo, titulo, corDestaque = COR_DESTAQUE_PADRAO, lede, children, stats = [], rodapeMenu }) {
  const [menu, setMenu] = useState(false);
  const itensMenu = nav.flatMap((i) => i.submenu || [i]);

  return (
    <div className="cine" data-theme="dark" style={{ "--destaque": corDestaque }}>
      <VideoFundo />
      <div className="cine-pagina">
        <header className="cine-topo">
          <Marca className="aparece aparece--escala" style={{ "--d": "0.08s" }} />
          <nav className="cine-nav" aria-label="Principal">
            {nav.map((item, i) => <ItemNav key={item.label} item={item} atraso={i} />)}
          </nav>
          <div className="cine-acoes">{acoes}</div>
          <button type="button" className="burger aparece aparece--escala" style={{ "--d": "0.34s" }}
            aria-controls="menu-cinema" aria-expanded={menu} aria-label={menu ? "Fechar menu" : "Abrir menu"}
            onClick={() => setMenu(true)}>
            <span /><span /><span />
          </button>
        </header>

        <main className="cine-hero">
          <div className="cine-copy">
            {selo}
            <TituloCinema texto={titulo} />
            {lede && <div className="cine-lede aparece aparece--suave" style={{ "--d": "0.82s", animationDuration: "1.25s" }}>{lede}</div>}
            <div className="cine-slot aparece aparece--botao" style={{ "--d": "0.96s" }}>{children}</div>
          </div>
        </main>

        {stats.length > 0 && (
          <footer className="cine-stats">
            {stats.map((s, i) => (
              <div key={i} className="cine-stat aparece aparece--stat" style={{ "--d": `${1.12 + i * 0.16}s` }}>
                <span className="ladrilho">{s.icone}</span>
                <span>{s.texto}</span>
              </div>
            ))}
          </footer>
        )}
      </div>

      <MenuCheio aberto={menu} aoFechar={() => setMenu(false)} id="menu-cinema" rodape={rodapeMenu} escuro>
        {itensMenu.map((i) => (
          <button key={i.label} type="button" className="metal" onClick={() => { setMenu(false); i.onClick(); }}>{i.label}</button>
        ))}
      </MenuCheio>
    </div>
  );
}
