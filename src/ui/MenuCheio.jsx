import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Marca } from "./ui.jsx";

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
