/* Oclusão de imagem: envie a imagem (mapa, gráfico, diagrama) e desenhe
   retângulos ou elipses sobre o que quer esconder. Cada forma vira um
   cartão: aquela área coberta, o resto da imagem visível.
   Arraste para desenhar; toque numa forma para selecionar, mover (arraste)
   ou redimensionar (alça no canto); Delete apaga. Mouse ou dedo. */

import { useEffect, useRef, useState } from "react";
import { Circle, ImagePlus, Square, Trash2 } from "lucide-react";
import { useLoja } from "../estado/hooks.js";
import { comprimirImagem } from "./imagens.js";
import { guardarEndereco } from "./Cartao.jsx";
import { Botao, avisar } from "./comum.jsx";

const MIN = 0.012;
const limitar = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const novoIdForma = () => Math.random().toString(36).slice(2, 8);

export function EditorOclusao({ campos, aoMudar, erro }) {
  const { repo } = useLoja();
  const area = useRef(null);
  const img = useRef(null);
  const arquivo = useRef(null);
  const [ferramenta, setFerramenta] = useState("retangulo");
  const [selecionada, setSelecionada] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const arrasto = useRef(null);
  const formas = campos.formas || [];

  // endereço da imagem atual
  useEffect(() => {
    let vivo = true;
    if (campos.imagem?.ref) repo.urlImagem(campos.imagem.ref).then((u) => { if (vivo && u && img.current) img.current.src = u; }).catch(() => {});
    return () => { vivo = false; };
  }, [repo, campos.imagem?.ref]);

  const enviar = async (f) => {
    if (!f) return;
    setEnviando(true);
    try {
      const { blob, largura, altura } = await comprimirImagem(f, { lado: 2000, qualidade: 0.85 });
      const ref = await repo.enviarImagem(blob);
      guardarEndereco(ref, URL.createObjectURL(blob));
      aoMudar({ ...campos, imagem: { ref, largura, altura }, formas: campos.imagem?.ref ? formas : [] });
    } catch (e) {
      avisar(e.message || "Não foi possível enviar a imagem.", { tipo: "erro" });
    } finally { setEnviando(false); }
  };

  const ponto = (e) => {
    const r = area.current.getBoundingClientRect();
    return { x: limitar((e.clientX - r.left) / r.width), y: limitar((e.clientY - r.top) / r.height) };
  };
  const mudarFormas = (novas) => aoMudar({ ...campos, formas: novas });

  const aoApertar = (e) => {
    if (!campos.imagem?.ref || e.button > 0) return;
    const p = ponto(e);
    const alvo = e.target.closest("[data-forma]");
    const alca = e.target.closest("[data-alca]");
    area.current.setPointerCapture(e.pointerId);
    if (alca) {
      const f = formas.find((x) => x.id === alca.dataset.alca);
      arrasto.current = { modo: "redimensionar", id: f.id, origem: p, inicial: f };
    } else if (alvo) {
      const f = formas.find((x) => x.id === alvo.dataset.forma);
      setSelecionada(f.id);
      arrasto.current = { modo: "mover", id: f.id, origem: p, inicial: f };
    } else {
      const f = { id: novoIdForma(), tipo: ferramenta, x: p.x, y: p.y, w: 0, h: 0, rotulo: "" };
      arrasto.current = { modo: "desenhar", id: f.id, origem: p };
      mudarFormas([...formas, f]);
      setSelecionada(f.id);
    }
    e.preventDefault();
  };

  const aoMover = (e) => {
    const a = arrasto.current;
    if (!a) return;
    const p = ponto(e);
    mudarFormas(formas.map((f) => {
      if (f.id !== a.id) return f;
      if (a.modo === "desenhar") {
        return { ...f, x: Math.min(a.origem.x, p.x), y: Math.min(a.origem.y, p.y), w: Math.abs(p.x - a.origem.x), h: Math.abs(p.y - a.origem.y) };
      }
      if (a.modo === "mover") {
        const dx = p.x - a.origem.x;
        const dy = p.y - a.origem.y;
        return { ...f, x: limitar(a.inicial.x + dx, 0, 1 - f.w), y: limitar(a.inicial.y + dy, 0, 1 - f.h) };
      }
      return { ...f, w: limitar(a.inicial.w + (p.x - a.origem.x), MIN, 1 - f.x), h: limitar(a.inicial.h + (p.y - a.origem.y), MIN, 1 - f.y) };
    }));
  };

  const aoSoltar = () => {
    const a = arrasto.current;
    arrasto.current = null;
    if (a?.modo === "desenhar") {
      const f = formas.find((x) => x.id === a.id);
      if (!f || f.w < MIN || f.h < MIN) { mudarFormas(formas.filter((x) => x.id !== a.id)); setSelecionada(null); }
    }
  };

  const apagar = (id) => { mudarFormas(formas.filter((f) => f.id !== id)); setSelecionada(null); };

  useEffect(() => {
    const tecla = (e) => {
      if (!selecionada || e.target.closest?.("input, textarea, [contenteditable='true']")) return;
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); apagar(selecionada); }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const sel = formas.find((f) => f.id === selecionada);
  const proporcao = campos.imagem?.largura ? `${campos.imagem.largura} / ${campos.imagem.altura}` : undefined;

  if (!campos.imagem?.ref) {
    return (
      <div className={`fc-oc-vazio${erro ? " fc-rico--erro" : ""}`}
        onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); enviar([...e.dataTransfer.files].find((f) => f.type.startsWith("image/"))); }}>
        <ImagePlus aria-hidden="true" />
        <strong>{enviando ? "Enviando a imagem…" : "Envie a imagem"}</strong>
        <p>Mapa, gráfico, diagrama, tabela ou fórmula. Arraste aqui ou escolha o arquivo; ela é comprimida antes de salvar.</p>
        <Botao variante="primario" disabled={enviando} onClick={() => arquivo.current?.click()}>Escolher imagem</Botao>
        <input ref={arquivo} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files[0]; e.target.value = ""; enviar(f); }} />
        {erro && <small className="fc-campo-erro" role="alert">{erro}</small>}
      </div>
    );
  }

  return (
    <div className="fc-oc">
      <div className="fc-oc-barra" role="toolbar" aria-label="Formas">
        <div className="fc-escolhas" role="radiogroup" aria-label="Ferramenta">
          <button type="button" role="radio" aria-checked={ferramenta === "retangulo"} className="fc-escolha" onClick={() => setFerramenta("retangulo")}><Square aria-hidden="true" />Retângulo</button>
          <button type="button" role="radio" aria-checked={ferramenta === "elipse"} className="fc-escolha" onClick={() => setFerramenta("elipse")}><Circle aria-hidden="true" />Elipse</button>
        </div>
        <span className="fc-oc-contagem">{formas.length} {formas.length === 1 ? "forma = 1 cartão" : `formas = ${formas.length} cartões`}</span>
        <Botao tamanho="sm" icone={ImagePlus} onClick={() => arquivo.current?.click()}>Trocar imagem</Botao>
        <input ref={arquivo} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files[0]; e.target.value = ""; enviar(f); }} />
      </div>
      <div ref={area} className="fc-oc-area" style={{ aspectRatio: proporcao }}
        onPointerDown={aoApertar} onPointerMove={aoMover} onPointerUp={aoSoltar} onPointerCancel={aoSoltar}>
        <img ref={img} alt="" draggable="false" />
        <svg viewBox="0 0 1 1" preserveAspectRatio="none">
          {formas.map((f, i) => (
            <g key={f.id} data-forma={f.id} className={f.id === selecionada ? "fc-oc-sel" : ""}>
              {f.tipo === "elipse"
                ? <ellipse className="fc-forma-editor" cx={f.x + f.w / 2} cy={f.y + f.h / 2} rx={f.w / 2} ry={f.h / 2} />
                : <rect className="fc-forma-editor" x={f.x} y={f.y} width={f.w} height={f.h} rx="0.006" />}
              <text x={f.x + f.w / 2} y={f.y + f.h / 2} className="fc-oc-numero" textAnchor="middle" dominantBaseline="central">{i + 1}</text>
            </g>
          ))}
        </svg>
        {sel && (
          <span className="fc-oc-alca" data-alca={sel.id} style={{ left: `${(sel.x + sel.w) * 100}%`, top: `${(sel.y + sel.h) * 100}%` }} aria-hidden="true" />
        )}
      </div>
      {sel ? (
        <div className="fc-oc-sel-painel">
          <label className="fc-campo"><span>Rótulo da forma {formas.indexOf(sel) + 1} (opcional, aparece no verso)</span>
            <input className="fc-entrada" value={sel.rotulo || ""} maxLength={80} placeholder="Ex.: Região Nordeste"
              onChange={(e) => mudarFormas(formas.map((f) => (f.id === sel.id ? { ...f, rotulo: e.target.value } : f)))} />
          </label>
          <Botao variante="fantasma" icone={Trash2} onClick={() => apagar(sel.id)}>Apagar forma</Botao>
        </div>
      ) : <p className="fc-dica">Arraste sobre a imagem para esconder uma parte. Toque numa forma para ajustar.</p>}
      {erro && <small className="fc-campo-erro" role="alert">{erro}</small>}
    </div>
  );
}
