import { useEffect, useRef, useState } from "react";
import { FileImage, Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import { COMPETENCIAS_ENEM, fmtData } from "../core/nucleo.js";
import { COR_NA_FOLHA, TIPOS_MARCACAO, competencia } from "../redacao.js";
import { useArquivoUrl } from "../state/hooks.js";

const TEXTO_NO_MARCADOR = { c1: "#fff", c2: "#111", c3: "#111", c4: "#111", c5: "#111" };
const nomeTipo = (id) => TIPOS_MARCACAO.find((t) => t.id === id)?.nome || "";

/* Foto da redação com as marcações numeradas do professor. Zoom por botões;
   no modo editável, clicar na foto cria uma marcação naquele ponto. */
export function FolhaCorrigida({ foto, marcacoes = [], ativa, aoSelecionar, editavel = false, aoAdicionar }) {
  const { url, carregando, faltando } = useArquivoUrl(foto);
  const [zoom, setZoom] = useState(1);
  const pagina = useRef(null);

  useEffect(() => {
    if (!ativa) return;
    pagina.current?.querySelector(`[data-id="${ativa}"]`)?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
  }, [ativa]);

  if (!foto || faltando) {
    return (
      <div className="folha-vazia">
        <FileImage aria-hidden="true" />
        <strong>{faltando ? "Foto indisponível neste aparelho" : "Sem foto da redação"}</strong>
        <p>{faltando ? "Não foi possível carregar a foto. No modo local (sem servidor), ela só aparece no navegador onde foi enviada." : "O professor não anexou a foto desta redação."}</p>
      </div>
    );
  }

  const clicar = (e) => {
    if (!editavel || !aoAdicionar) return;
    const r = e.currentTarget.getBoundingClientRect();
    const fr = (v) => Math.min(0.99, Math.max(0.01, Math.round(v * 1000) / 1000));
    aoAdicionar({ x: fr((e.clientX - r.left) / r.width), y: fr((e.clientY - r.top) / r.height) });
  };

  return (
    <div className="folha-corrigida">
      <div className="folha-ferramentas">
        <button type="button" className="icone-btn" aria-label="Diminuir zoom" disabled={zoom <= 1} onClick={() => setZoom((z) => Math.max(1, z - 0.25))}><ZoomOut /></button>
        <span className="num">{Math.round(zoom * 100)}%</span>
        <button type="button" className="icone-btn" aria-label="Aumentar zoom" disabled={zoom >= 3} onClick={() => setZoom((z) => Math.min(3, z + 0.25))}><ZoomIn /></button>
        <button type="button" className="icone-btn" aria-label="Ajustar à largura" disabled={zoom === 1} onClick={() => setZoom(1)}><Maximize2 /></button>
        {editavel && <span className="folha-dica">Clique no texto para marcar um trecho.</span>}
      </div>
      <div className="folha-rolagem">
        {carregando ? <div className="folha-carregando">Carregando a foto…</div> : (
          <div ref={pagina} className={`folha-pagina${editavel ? " folha-pagina--editavel" : ""}`} style={{ width: `${zoom * 100}%` }} onClick={clicar}>
            <img src={url} alt="Foto da redação corrigida" draggable={false} />
            {marcacoes.map((m, i) => {
              const c = competencia(m.competencia);
              return (
                <button key={m.id} type="button" data-id={m.id} className="marcador" data-ativo={ativa === m.id}
                  style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%`, "--cor": COR_NA_FOLHA[m.competencia], "--texto": TEXTO_NO_MARCADOR[m.competencia] }}
                  aria-label={`Marcação ${i + 1}: ${nomeTipo(m.tipo)}, ${c.sigla}`}
                  onClick={(e) => { e.stopPropagation(); aoSelecionar?.(m.id); }}>
                  {i + 1}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* Cartão de uma marcação (lista ao lado da foto). */
export function ItemMarcacao({ m, numero, ativa, aoSelecionar, children }) {
  const c = competencia(m.competencia);
  return (
    <article className={`item-marcacao${ativa ? " item-marcacao--ativa" : ""}`}>
      <button type="button" className="item-marcacao-topo" onClick={() => aoSelecionar?.(m.id)} aria-pressed={ativa}>
        <span className="bolinha" style={{ "--cor": COR_NA_FOLHA[m.competencia], "--texto": TEXTO_NO_MARCADOR[m.competencia] }}>{numero}</span>
        <span className={`tipo-marcacao tipo-marcacao--${m.tipo}`}>{nomeTipo(m.tipo)}</span>
        <span className="item-marcacao-comp">{c.sigla} · {c.nome}</span>
      </button>
      {children || (m.texto && <p>{m.texto}</p>)}
    </article>
  );
}

/* Notas por competência: barra = nota do aluno (0–200), traço = média do tema. */
export function NotasCompetencias({ notas = {}, media }) {
  return (
    <div className="notas-comp">
      {COMPETENCIAS_ENEM.map((comp) => {
        const c = competencia(comp.id);
        const v = Number(notas[comp.id]) || 0;
        const m = media?.porCompetencia?.[comp.id];
        return (
          <div key={comp.id} className="nota-comp" title={`${c.sigla}: ${v} de 200${m != null ? ` · média do tema ${m}` : ""}`}>
            <span className="nota-comp-sigla"><i style={{ background: `var(--${comp.id})` }} />{c.sigla}</span>
            <span className="nota-comp-nome">{c.nome}</span>
            <span className="nota-comp-trilho">
              <span className="nota-comp-barra" style={{ width: `${(v / 200) * 100}%`, background: `var(--${comp.id})` }} />
              {m != null && <span className="nota-comp-media" style={{ left: `${(m / 200) * 100}%` }} />}
            </span>
            <span className="nota-comp-valor num">{v}</span>
          </div>
        );
      })}
      {media && (
        <p className="legenda-comp">
          <span><i className="leg-barra" />Sua nota</span>
          <span><i className="leg-traco" />Média do tema ({media.quantas} redações)</span>
        </p>
      )}
    </div>
  );
}

/* Evolução da nota (% da nota máxima), uma série: linha fina, pontos com
   anel, rótulo só no último ponto; o valor de cada ponto aparece ao passar
   o mouse ou focar, e está também na lista de redações. */
export function EvolucaoNotas({ pontos }) {
  const [foco, setFoco] = useState(null);
  if (pontos.length < 2) return null;
  const L = 640, A = 190, esq = 40, dir = 24, cima = 16, baixo = 30;
  const x = (i) => esq + (i * (L - esq - dir)) / (pontos.length - 1);
  const y = (pct) => cima + ((100 - pct) * (A - cima - baixo)) / 100;
  const caminho = pontos.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.pct).toFixed(1)}`).join(" ");
  const ultimo = pontos[pontos.length - 1];
  const f = foco != null ? pontos[foco] : null;

  return (
    <figure className="evolucao">
      <svg viewBox={`0 0 ${L} ${A}`} role="img" aria-label={`Evolução da nota: ${pontos.map((p) => `${fmtData(p.data)} ${p.pct}%`).join(", ")}`}>
        {[0, 50, 100].map((t) => (
          <g key={t}>
            <line x1={esq} x2={L - dir} y1={y(t)} y2={y(t)} className="evo-grade" />
            <text x={esq - 8} y={y(t) + 4} textAnchor="end" className="evo-eixo">{t}%</text>
          </g>
        ))}
        {pontos.map((p, i) => (
          <text key={p.id} x={x(i)} y={A - 8} textAnchor="middle" className="evo-eixo">{fmtData(p.data).slice(0, 5)}</text>
        ))}
        <path d={caminho} className="evo-linha" />
        {pontos.map((p, i) => (
          <g key={p.id}>
            <circle cx={x(i)} cy={y(p.pct)} r={5} className="evo-ponto" />
            <circle cx={x(i)} cy={y(p.pct)} r={16} className="evo-alvo" tabIndex={0}
              aria-label={`${p.tema}, ${fmtData(p.data)}: ${p.texto} (${p.pct}%)`}
              onMouseEnter={() => setFoco(i)} onMouseLeave={() => setFoco(null)} onFocus={() => setFoco(i)} onBlur={() => setFoco(null)} />
          </g>
        ))}
        <text x={x(pontos.length - 1) - 10} y={y(ultimo.pct) - 12} textAnchor="end" className="evo-rotulo">{ultimo.pct}%</text>
      </svg>
      {f && (
        <div className="evo-dica" style={{ left: `${(x(foco) / L) * 100}%`, top: `${(y(f.pct) / A) * 100}%` }} role="status">
          <strong>{f.texto}</strong> · {f.pct}%<br /><span>{f.tema}</span>
        </div>
      )}
    </figure>
  );
}
