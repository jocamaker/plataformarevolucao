/* Gráfico de colunas do módulo, em SVG próprio (sem biblioteca).
   Regras: marcas finas; 2px de fundo entre segmentos e entre colunas; ponta
   arredondada de 4px, base reta; grade em linha fina; texto sempre nas cores
   de texto (a cor fica só na marca); dica ao passar o mouse, ao tocar ou com
   as setas do teclado. */

import { useLayoutEffect, useRef, useState } from "react";

/* ---------- utilidades ---------- */

export function useLargura() {
  const ref = useRef(null);
  const [largura, setLargura] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const medir = () => setLargura(el.clientWidth);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, largura];
}

// divisões redondas do eixo de contagem (0, 5, 10… / 0, 20, 40…)
export function divisoes(max, alvo = 4) {
  if (!(max > 0)) return [0, 1];
  const bruto = max / alvo;
  const mag = 10 ** Math.floor(Math.log10(bruto));
  const passo = Math.max(1, [1, 2, 5, 10].map((m) => m * mag).find((p) => p >= bruto));
  const topo = Math.ceil(max / passo) * passo;
  const r = [];
  for (let v = 0; v <= topo; v += passo) r.push(v);
  return r;
}

export const numero = (n) => Number(n || 0).toLocaleString("pt-BR");
export const pct = (x, casas = 0) => `${(x * 100).toLocaleString("pt-BR", { maximumFractionDigits: casas, minimumFractionDigits: casas })}%`;

// coluna com a ponta de cima arredondada e a base reta
function caminhoColuna(x, y, w, h, r = 4) {
  const rr = Math.max(0, Math.min(r, w / 2, h));
  return `M${x},${y + h}V${y + rr}A${rr},${rr} 0 0 1 ${x + rr},${y}H${x + w - rr}A${rr},${rr} 0 0 1 ${x + w},${y + rr}V${y + h}Z`;
}

/* ---------- dica (tooltip) ---------- */

// linhas: [{ cor, rotulo, valor }]; o valor vem em destaque, o rótulo depois
export function Dica({ x, y, largura, titulo, linhas = [], rodape }) {
  const meia = 96;
  const esquerda = Math.min(Math.max(x, meia), Math.max(meia, largura - meia));
  return (
    <div className="fc-balao" style={{ left: esquerda, top: y }} role="status" aria-live="polite">
      {titulo && <span className="fc-balao-titulo">{titulo}</span>}
      {linhas.map((l) => (
        <span key={l.rotulo} className="fc-balao-linha">
          {l.cor && <i style={{ background: l.cor }} aria-hidden="true" />}
          <strong>{l.valor}</strong><span>{l.rotulo}</span>
        </span>
      ))}
      {rodape && <span className="fc-balao-rodape">{rodape}</span>}
    </div>
  );
}

// no toque, o dedo "sai" logo depois de tocar: a dica fica até tocar fora (o gráfico perde o foco)
const soltar = (setAtivo) => (e) => { if (e.pointerType !== "touch") setAtivo(null); };

// navegação pelo teclado dentro de um gráfico (setas, Home, End)
function teclasDeIndice(e, atual, total, setAtivo, passo = 1) {
  const mapa = { ArrowLeft: -passo, ArrowRight: passo, ArrowUp: -1, ArrowDown: 1 };
  let prox = null;
  if (e.key in mapa) prox = (atual ?? total - 1) + mapa[e.key];
  else if (e.key === "Home") prox = 0;
  else if (e.key === "End") prox = total - 1;
  else if (e.key === "Escape") { setAtivo(null); return; }
  if (prox === null) return;
  e.preventDefault();
  setAtivo(Math.max(0, Math.min(total - 1, prox)));
}

/* ---------- colunas empilhadas ---------- */

/* pontos: [{ chave, ...valores }]; series: [{ id, rotulo, cor }] (de baixo
   para cima); rotuloX(ponto): texto curto do eixo; dica(ponto): { titulo,
   linhas, rodape }. Os rótulos do eixo partem do fim (hoje) ou, com
   rotulosDoInicio, do começo. */
export function Colunas({ pontos, series, rotuloX, dica, altura = 220, rotulo, rotulosDoInicio = false }) {
  const [ref, largura] = useLargura();
  const [ativo, setAtivo] = useState(null);
  const m = { e: 40, d: 14, t: 12, b: 26 };
  const w = Math.max(0, largura - m.e - m.d);
  const h = altura - m.t - m.b;
  const n = pontos.length;
  const totais = pontos.map((p) => series.reduce((s, sr) => s + (p[sr.id] || 0), 0));
  const ticks = divisoes(Math.max(0, ...totais));
  const topo = ticks.at(-1);
  const escala = (v) => (v / topo) * h;
  const banda = n ? w / n : 0;
  const larguraBarra = Math.max(1, Math.min(24, banda * 0.72, banda - 2));
  const passoRotulo = Math.max(1, Math.ceil(60 / Math.max(banda, 1)));

  const aoMover = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.floor((e.clientX - r.left - m.e) / banda);
    setAtivo(i >= 0 && i < n ? i : null);
  };

  const p = ativo !== null ? pontos[ativo] : null;
  const info = p ? dica(p) : null;
  return (
    <div ref={ref} className="fc-grafico">
      {largura > 0 && (
        <svg width={largura} height={altura} role="img" aria-label={rotulo} tabIndex={0}
          onPointerMove={aoMover} onPointerDown={aoMover} onPointerLeave={soltar(setAtivo)}
          onFocus={() => setAtivo((a) => a ?? n - 1)} onBlur={() => setAtivo(null)}
          onKeyDown={(e) => teclasDeIndice(e, ativo, n, setAtivo)}>
          {ticks.map((t) => (
            <g key={t}>
              <line className="fc-grade" x1={m.e} x2={m.e + w} y1={m.t + h - escala(t)} y2={m.t + h - escala(t)} />
              <text className="fc-eixo" x={m.e - 8} y={m.t + h - escala(t)} textAnchor="end" dominantBaseline="central">{numero(t)}</text>
            </g>
          ))}
          {ativo !== null && <rect className="fc-banda-ativa" x={m.e + ativo * banda} y={m.t} width={banda} height={h} />}
          {pontos.map((pt, i) => {
            const x = m.e + i * banda + (banda - larguraBarra) / 2;
            let base = m.t + h;
            const visiveis = series.filter((s) => pt[s.id] > 0);
            return (
              <g key={pt.chave}>
                {visiveis.map((s, j) => {
                  const alt = Math.max(1, escala(pt[s.id]) - (j > 0 ? 2 : 0));
                  const y = base - alt;
                  base = y - 2;
                  return <path key={s.id} d={j === visiveis.length - 1 ? caminhoColuna(x, y, larguraBarra, alt) : `M${x},${y}h${larguraBarra}v${alt}h${-larguraBarra}Z`} style={{ fill: s.cor }} />;
                })}
              </g>
            );
          })}
          <line className="fc-eixo-base" x1={m.e} x2={m.e + w} y1={m.t + h + 0.5} y2={m.t + h + 0.5} />
          {pontos.map((pt, i) => ((rotulosDoInicio ? i : n - 1 - i) % passoRotulo === 0 ? (
            <text key={pt.chave} className="fc-eixo" x={m.e + i * banda + banda / 2} y={altura - 8} textAnchor="middle">{rotuloX(pt, i)}</text>
          ) : null))}
        </svg>
      )}
      {info && <Dica x={m.e + ativo * banda + banda / 2} y={m.t + h - escala(totais[ativo]) - 8} largura={largura} {...info} />}
    </div>
  );
}
