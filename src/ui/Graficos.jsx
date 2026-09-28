/* Gráficos leves em SVG, sempre sobre dados calculados dos registros.
   Cores de estado: acertos = --ok, erros = --danger, em branco = --faint,
   sempre com rótulo e número ao lado (nunca só a cor). */

import { useEffect, useRef, useState } from "react";
import { fmtPct } from "../core/desempenho.js";
import { fmtDataCurta } from "../core/datas.js";

const COR = { acertos: "var(--ok)", erros: "var(--danger)", emBranco: "var(--faint)" };

function useLargura(min = 240) {
  const ref = useRef(null);
  const [largura, setLargura] = useState(min);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setLargura(Math.max(min, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [min]);
  return [ref, largura];
}

/* ---------- Rosca: acertos × erros (× em branco) ---------- */

export function RoscaAcertos({ acertos = 0, erros = 0, emBranco = 0, aoAbrir }) {
  const total = acertos + erros + emBranco;
  const [ativo, setAtivo] = useState(null);
  const partes = [
    { k: "acertos", rotulo: "Acertos", valor: acertos },
    { k: "erros", rotulo: "Erros", valor: erros },
    { k: "emBranco", rotulo: "Em branco", valor: emBranco },
  ].filter((p) => p.valor > 0 || p.k !== "emBranco");
  const R = 64, r = 46, C = 80;
  let angulo = -Math.PI / 2;
  const gap = total && partes.filter((p) => p.valor).length > 1 ? 0.035 : 0;
  const arcos = partes.map((p) => {
    const frac = total ? p.valor / total : 0;
    const ini = angulo + gap / 2;
    const fim = angulo + frac * Math.PI * 2 - gap / 2;
    angulo += frac * Math.PI * 2;
    if (frac <= 0 || fim <= ini) return { ...p, d: null };
    const grande = fim - ini > Math.PI ? 1 : 0;
    const pt = (raio, a) => `${C + raio * Math.cos(a)} ${C + raio * Math.sin(a)}`;
    const d = frac >= 0.999
      ? `M ${pt(R, 0)} A ${R} ${R} 0 1 1 ${pt(R, Math.PI)} A ${R} ${R} 0 1 1 ${pt(R, 0)} M ${pt(r, 0)} A ${r} ${r} 0 1 0 ${pt(r, Math.PI)} A ${r} ${r} 0 1 0 ${pt(r, 0)} Z`
      : `M ${pt(R, ini)} A ${R} ${R} 0 ${grande} 1 ${pt(R, fim)} L ${pt(r, fim)} A ${r} ${r} 0 ${grande} 0 ${pt(r, ini)} Z`;
    return { ...p, d };
  });
  const pctAcertos = total ? fmtPct(Math.round((acertos / total) * 1000) / 10) : "–";
  const destaque = arcos.find((a) => a.k === ativo);

  return (
    <div className="rosca">
      <svg viewBox="0 0 160 160" role="img" aria-label={`Acertos ${acertos}, erros ${erros}${emBranco ? `, em branco ${emBranco}` : ""}, de ${total} questões`}>
        {!total && <circle cx={C} cy={C} r={(R + r) / 2} fill="none" stroke="var(--border)" strokeWidth={R - r} />}
        {arcos.map((a) => a.d && (
          <path key={a.k} d={a.d} fill={COR[a.k]} fillRule="evenodd" opacity={ativo && ativo !== a.k ? 0.35 : 1}
            onMouseEnter={() => setAtivo(a.k)} onMouseLeave={() => setAtivo(null)} />
        ))}
        <text x={C} y={C - 2} textAnchor="middle" className="rosca-valor">{destaque ? destaque.valor : pctAcertos}</text>
        <text x={C} y={C + 16} textAnchor="middle" className="rosca-rotulo">{destaque ? destaque.rotulo.toLowerCase() : "de acerto"}</text>
      </svg>
      <ul className="legenda">
        {partes.map((p) => {
          const conteudo = <><i style={{ background: COR[p.k] }} aria-hidden="true" /><span>{p.rotulo}</span><b className="num">{p.valor}</b><small className="num">{total ? fmtPct(Math.round((p.valor / total) * 1000) / 10) : "–"}</small></>;
          return (
            <li key={p.k} onMouseEnter={() => setAtivo(p.k)} onMouseLeave={() => setAtivo(null)} className={`legenda-${p.k}`}>
              {aoAbrir && p.k !== "emBranco" && p.valor > 0
                ? <button type="button" className="legenda-botao" onClick={() => aoAbrir(p.k)}>{conteudo}</button>
                : conteudo}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ---------- Linha: % ao longo do tempo (uma série, eixo 0–100) ---------- */

const rotuloPeriodo = (p, agrupamento) => (agrupamento === "mes" ? `${p.slice(5, 7)}/${p.slice(2, 4)}` : fmtDataCurta(p));

export function LinhaPercentual({ pontos, agrupamento = "semana", altura = 200, rotuloPonto, compacto = false }) {
  const [ref, largura] = useLargura(compacto ? 160 : 260);
  const [hover, setHover] = useState(null);
  if (!pontos.length) return <div ref={ref} className="grafico-vazio">Sem dados no período.</div>;
  const m = compacto ? { t: 10, r: 10, b: 20, l: 30 } : { t: 14, r: 16, b: 28, l: 38 };
  const w = largura - m.l - m.r, h = altura - m.t - m.b;
  const x = (i) => m.l + (pontos.length === 1 ? w / 2 : (i / (pontos.length - 1)) * w);
  const y = (v) => m.t + h - (v / 100) * h;
  const caminho = pontos.map((p, i) => `${i ? "L" : "M"} ${x(i)} ${y(p.pct)}`).join(" ");
  const passo = Math.max(1, Math.ceil(pontos.length / Math.max(2, Math.floor(w / 70))));
  const mover = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left;
    let melhor = 0;
    pontos.forEach((_, i) => { if (Math.abs(x(i) - px) < Math.abs(x(melhor) - px)) melhor = i; });
    setHover(melhor);
  };
  const p = hover != null ? pontos[hover] : null;

  return (
    <div ref={ref} className="grafico-linha">
      <svg width={largura} height={altura} role="img" aria-label={`Evolução: ${pontos.map((q) => `${rotuloPeriodo(q.periodo, agrupamento)} ${fmtPct(q.pct)}`).join(", ")}`}
        onMouseMove={mover} onMouseLeave={() => setHover(null)}>
        {[0, 50, 100].concat(compacto ? [] : [25, 75]).map((v) => (
          <g key={v}>
            <line x1={m.l} x2={m.l + w} y1={y(v)} y2={y(v)} className="grade" />
            <text x={m.l - 6} y={y(v) + 4} textAnchor="end" className="eixo">{v}%</text>
          </g>
        ))}
        {pontos.map((q, i) => (i % passo === 0 || i === pontos.length - 1) && (
          <text key={q.periodo} x={x(i)} y={altura - 6} textAnchor="middle" className="eixo">{rotuloPeriodo(q.periodo, agrupamento)}</text>
        ))}
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={m.t} y2={m.t + h} className="mira" />}
        <path d={caminho} className="linha" />
        {pontos.map((q, i) => (
          <circle key={q.periodo} cx={x(i)} cy={y(q.pct)} r={hover === i ? 5.5 : 4} className="marcador-ponto" />
        ))}
      </svg>
      {p && (
        <div className="dica" style={{ left: Math.min(Math.max(x(hover), 70), largura - 70), top: y(p.pct) }}>
          <strong>{rotuloPonto ? rotuloPonto(p) : rotuloPeriodo(p.periodo, agrupamento)}</strong>
          <span className="num">{fmtPct(p.pct)}{p.total != null ? ` · ${p.acertos}/${p.total}` : ""}</span>
        </div>
      )}
    </div>
  );
}

/* ---------- Barras: acertos | erros | em branco por matéria/tópico ---------- */

export function BarrasAcertos({ linhas, aoAbrir, rotuloAbrir = "Ver detalhes" }) {
  if (!linhas.length) return <div className="grafico-vazio">Sem registros no período.</div>;
  const maior = Math.max(...linhas.map((l) => l.total));
  return (
    <ul className="barras-acertos">
      {linhas.map((l) => {
        const corpo = (
          <>
            <span className="barras-nome">{l.nome}</span>
            <span className="barras-trilho" style={{ width: `${Math.max(8, (l.total / maior) * 100)}%` }}
              title={`${l.acertos} acertos, ${l.erros} erros${l.emBranco ? `, ${l.emBranco} em branco` : ""} de ${l.total}`}>
              {l.acertos > 0 && <i style={{ flexGrow: l.acertos, background: COR.acertos }} />}
              {l.erros > 0 && <i style={{ flexGrow: l.erros, background: COR.erros }} />}
              {l.emBranco > 0 && <i style={{ flexGrow: l.emBranco, background: COR.emBranco }} />}
            </span>
            <span className="barras-valor num"><b>{fmtPct(l.pct)}</b> · {l.acertos}/{l.total}</span>
          </>
        );
        return (
          <li key={l.id}>
            {aoAbrir ? <button type="button" className="barras-linha" onClick={() => aoAbrir(l)} aria-label={`${l.nome}: ${fmtPct(l.pct)} de acerto. ${rotuloAbrir}`}>{corpo}</button>
              : <div className="barras-linha">{corpo}</div>}
          </li>
        );
      })}
    </ul>
  );
}

export function LegendaAcertos() {
  return (
    <ul className="legenda legenda--linha" aria-label="Legenda">
      <li><i style={{ background: COR.acertos }} />Acertos</li>
      <li><i style={{ background: COR.erros }} />Erros</li>
      <li><i style={{ background: COR.emBranco }} />Em branco</li>
    </ul>
  );
}

/* ---------- Consistência: um quadrado por dia ---------- */

export function CalendarioDias({ dias, hojeIso }) {
  return (
    <div className="calendario-dias">
      <ol aria-label="Dias estudados">
        {dias.map((d) => (
          <li key={d.data} className={`${d.estudou ? "estudou" : ""}${d.data === hojeIso ? " hoje" : ""}`}
            title={`${fmtDataCurta(d.data)}: ${d.estudou ? "estudou" : "sem estudo registrado"}`}>
            <span className="sr-only">{fmtDataCurta(d.data)}: {d.estudou ? "estudou" : "em branco"}</span>
          </li>
        ))}
      </ol>
      <ul className="legenda legenda--linha" aria-hidden="true">
        <li><i className="q estudou" />Estudou</li>
        <li><i className="q" />Em branco</li>
      </ul>
    </div>
  );
}
