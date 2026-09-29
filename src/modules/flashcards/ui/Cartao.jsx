/* Um cartão como ele aparece na revisão (também nas pré-visualizações do
   editor e na tela Navegar). Frente e verso de cada tipo. */

import { useEffect, useLayoutEffect, useRef } from "react";
import { useLoja } from "../estado/hooks.js";
import { htmlCloze, idDaForma, limparHtml, numeroDaLacuna } from "./html.js";

// endereços das imagens, resolvidos uma vez por referência
const enderecos = new Map();
function enderecoDe(repo, ref) {
  if (!enderecos.has(ref)) enderecos.set(ref, repo.urlImagem(ref).catch(() => null));
  return enderecos.get(ref);
}
export const guardarEndereco = (ref, url) => enderecos.set(ref, Promise.resolve(url));

// preenche o src de toda <img data-fc-img> dentro de um elemento
export function useImagensDe(ref, deps) {
  const { repo } = useLoja();
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    let vivo = true;
    el.querySelectorAll("img[data-fc-img]").forEach((img) => {
      const r = img.getAttribute("data-fc-img");
      enderecoDe(repo, r).then((url) => { if (vivo && url) img.src = url; else if (vivo) img.classList.add("fc-img-falta"); });
    });
    return () => { vivo = false; };
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
}

function Html({ html, className = "" }) {
  const ref = useRef(null);
  const limpo = limparHtml(html);
  useImagensDe(ref, [limpo]);
  return <div ref={ref} className={`fc-html ${className}`} dangerouslySetInnerHTML={{ __html: limpo }} />;
}

function Forma({ f, className }) {
  if (f.tipo === "elipse") return <ellipse className={className} cx={f.x + f.w / 2} cy={f.y + f.h / 2} rx={f.w / 2} ry={f.h / 2} />;
  return <rect className={className} x={f.x} y={f.y} width={f.w} height={f.h} rx="0.006" />;
}

export function Oclusao({ campos, alvo, lado, todas = false, children }) {
  const { repo } = useLoja();
  const img = useRef(null);
  useEffect(() => {
    let vivo = true;
    if (campos.imagem?.ref) enderecoDe(repo, campos.imagem.ref).then((url) => { if (vivo && img.current && url) img.current.src = url; });
    return () => { vivo = false; };
  }, [repo, campos.imagem?.ref]);
  const proporcao = campos.imagem?.largura && campos.imagem?.altura ? `${campos.imagem.largura} / ${campos.imagem.altura}` : undefined;
  return (
    <div className="fc-oclusao" style={{ aspectRatio: proporcao }}>
      <img ref={img} alt="" draggable="false" />
      <svg viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
        {campos.formas.map((f) => {
          if (todas) return <Forma key={f.id} f={f} className="fc-forma-editor" />;
          if (f.id !== alvo) return null;
          return <Forma key={f.id} f={f} className={lado === "frente" ? "fc-forma-oculta" : "fc-forma-revelada"} />;
        })}
      </svg>
      {children}
    </div>
  );
}

/* nota: a nota (campos); ordinal: qual cartão ("1", "c2", "f_abc"); lado: "frente" | "verso" */
export function Cartao({ nota, ordinal, lado }) {
  const { tipo, campos } = nota;
  if (tipo === "basico") {
    return (
      <div className="fc-cartao-conteudo">
        <Html html={campos.frente} />
        {lado === "verso" && <><hr className="fc-divisor" /><Html html={campos.verso} className="fc-resposta" /></>}
      </div>
    );
  }
  if (tipo === "cloze") {
    const n = numeroDaLacuna(ordinal);
    return (
      <div className="fc-cartao-conteudo">
        <Html html={htmlCloze(campos.texto, n, lado)} />
        {lado === "verso" && campos.extra && <><hr className="fc-divisor" /><Html html={campos.extra} className="fc-extra" /></>}
      </div>
    );
  }
  const alvo = idDaForma(ordinal);
  const forma = campos.formas.find((f) => f.id === alvo);
  return (
    <div className="fc-cartao-conteudo fc-cartao-conteudo--imagem">
      <Oclusao campos={campos} alvo={alvo} lado={lado} />
      {lado === "verso" && forma?.rotulo && <p className="fc-rotulo-forma">{forma.rotulo}</p>}
      {lado === "verso" && campos.extra && <><hr className="fc-divisor" /><Html html={campos.extra} className="fc-extra" /></>}
    </div>
  );
}
