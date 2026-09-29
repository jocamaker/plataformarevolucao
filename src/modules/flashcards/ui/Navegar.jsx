/* Navegar (como o navegador de cartões do Anki): todos os cartões do aluno,
   com busca (sem ligar para acentos), filtros por matéria/tópico/tag/estado,
   ordenação, seleção múltipla e ações em lote. Arraste cartões para um
   tópico da lateral para movê-los (ou use "Mover para…"). */

import { lazy, Suspense, useDeferredValue, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useSearchParams } from "react-router-dom";
import { DndContext, DragOverlay, MouseSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import {
  CalendarClock, ChevronDown, EyeOff, FolderInput, Info, Pencil, Play, RotateCcw, Search, SkipForward, Tag as IconeTag, Trash2, X,
} from "lucide-react";
import { useBase, useLoja } from "../estado/hooks.js";
import { ESTADOS, textoDoHtml } from "../dados/modelo.js";
import { definirData, enterrar, resetar, suspender } from "../servicos/agenda.js";
import { alterarTags, apagarNotas, moverNotas } from "../servicos/notas.js";
import { formatarIntervalo } from "../motor/agendador.js";
import { Botao, Carregando, Confirmar, Dialogo, Menu, Vazio, avisar, executar } from "./comum.jsx";
import { Cartao } from "./Cartao.jsx";
import { DefinirData, InfoCartao, estadoDoCartao } from "./dialogosCartao.jsx";
import { htmlCloze, idDaForma, numeroDaLacuna } from "./html.js";

const EditorNota = lazy(() => import("./Editor.jsx").then((m) => ({ default: m.EditorNota })));

const POR_PAGINA = 100;

// telas estreitas: o painel sobe para o <body> (a área da plataforma não deixa nada passar do cabeçalho)
const ESTREITA = "(max-width: 1100px)";
const useEstreita = () => useSyncExternalStore(
  (f) => { const m = window.matchMedia(ESTREITA); m.addEventListener("change", f); return () => m.removeEventListener("change", f); },
  () => window.matchMedia(ESTREITA).matches,
);
const semAcento = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("pt-BR");

const ESTADOS_FILTRO = [
  ["", "Todos os estados"], ["novo", "Novos"], ["aprendendo", "Aprendendo"], ["revisao", "Em revisão"],
  ["hoje", "Vencem hoje"], ["suspenso", "Suspensos"], ["enterrado", "Enterrados / adiados"],
];
const ORDENS = [["criado", "Mais recentes"], ["proxima", "Próxima revisão"], ["dificuldade", "Mais difíceis"], ["frente", "Frente (A–Z)"]];

// texto curto do cartão (a "pergunta"), como a coluna do Anki
function resumo(nota, ordinal) {
  if (!nota) return "(nota não encontrada)";
  const c = nota.campos;
  if (nota.tipo === "basico") return textoDoHtml(c.frente);
  if (nota.tipo === "cloze") return textoDoHtml(htmlCloze(c.texto, numeroDaLacuna(ordinal), "frente"));
  const i = c.formas.findIndex((f) => f.id === idDaForma(ordinal));
  const f = c.formas[i];
  return `Imagem · forma ${i + 1}${f?.rotulo ? ` (${f.rotulo})` : ""}`;
}

function chaveEstado(c, agora) {
  if (c.suspenso) return "suspenso";
  if (c.enterradoAte && new Date(c.enterradoAte) > agora) return "enterrado";
  if (c.fsrs.state === ESTADOS.novo) return "novo";
  if (c.fsrs.state === ESTADOS.revisao) return "revisao";
  return "aprendendo";
}

function quando(c, agora) {
  if (c.suspenso) return "—";
  if (c.fsrs.state === ESTADOS.novo) return c.enterradoAte ? `a partir de ${new Date(c.enterradoAte).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}` : "na fila de novos";
  const d = new Date(c.fila || c.fsrs.due).getTime() - agora.getTime();
  if (d <= 0) return d > -86400000 ? "agora" : `atrasado ${formatarIntervalo(-d)}`;
  return `em ${formatarIntervalo(d)}`;
}

/* ---------- lateral (com alvos de soltar) ---------- */

function AlvoTopico({ t, ativo, n, aoClicar }) {
  const { setNodeRef, isOver } = useDroppable({ id: `topico:${t.id}` });
  return (
    <button ref={setNodeRef} type="button" className={`fc-lat-item fc-lat-item--topico${ativo ? " fc-lat-item--ativo" : ""}${isOver ? " fc-lat-item--soltar" : ""}`} onClick={aoClicar}>
      <span>{t.nome}</span><small>{n || ""}</small>
    </button>
  );
}

function Lateral({ estado, filtro, mudar, contagens }) {
  const [abertas, setAbertas] = useState({});
  return (
    <nav className="fc-lateral" aria-label="Filtrar por lugar">
      <button type="button" className={`fc-lat-item${!filtro.materia && !filtro.topico && !filtro.tag ? " fc-lat-item--ativo" : ""}`} onClick={() => mudar({ materia: "", topico: "", tag: "" })}>
        <span>Todos os cartões</span><small>{contagens.total}</small>
      </button>
      <p className="fc-lat-titulo">Matérias</p>
      {estado.materias.map((m) => {
        const topicos = estado.topicos.filter((t) => t.materiaId === m.id);
        const aberta = abertas[m.id] ?? (filtro.materia === m.id || topicos.some((t) => t.id === filtro.topico));
        return (
          <div key={m.id}>
            <div className="fc-lat-linha">
              <button type="button" className="fc-lat-seta" aria-label={aberta ? `Fechar ${m.nome}` : `Abrir ${m.nome}`} aria-expanded={aberta} onClick={() => setAbertas((a) => ({ ...a, [m.id]: !aberta }))}>
                <ChevronDown aria-hidden="true" />
              </button>
              <button type="button" className={`fc-lat-item${filtro.materia === m.id && !filtro.topico ? " fc-lat-item--ativo" : ""}`} onClick={() => mudar({ materia: m.id, topico: "", tag: "" })}>
                <span>{m.nome}</span><small>{contagens.materia[m.id] || ""}</small>
              </button>
            </div>
            {aberta && topicos.map((t) => (
              <AlvoTopico key={t.id} t={t} ativo={filtro.topico === t.id} n={contagens.topico[t.id]} aoClicar={() => mudar({ materia: "", topico: t.id, tag: "" })} />
            ))}
          </div>
        );
      })}
      {estado.tagsConhecidas.length > 0 && <p className="fc-lat-titulo">Tags</p>}
      {estado.tagsConhecidas.map((t) => (
        <button key={t} type="button" className={`fc-lat-item${filtro.tag === t ? " fc-lat-item--ativo" : ""}`} onClick={() => mudar({ materia: "", topico: "", tag: t })}>
          <span><IconeTag aria-hidden="true" />{t}</span><small>{contagens.tag[t] || ""}</small>
        </button>
      ))}
      <p className="fc-lat-dica">Arraste cartões para um tópico para movê-los.</p>
    </nav>
  );
}

/* ---------- linha da tabela ---------- */

function Linha({ c, nota, lugar, agora, marcado, aoMarcar, aoAbrir, ativo }) {
  const { setNodeRef, listeners, isDragging } = useDraggable({ id: c.id });
  const e = chaveEstado(c, agora);
  return (
    <tr ref={setNodeRef} className={`fc-tab-linha${ativo ? " fc-tab-linha--ativa" : ""}${marcado ? " fc-tab-linha--marcada" : ""}${isDragging ? " fc-tab-linha--arrastando" : ""}`}
      onClick={() => aoAbrir(c)} {...listeners} aria-selected={ativo} tabIndex={0}
      onKeyDown={(ev) => { if (ev.key === "Enter") aoAbrir(c); }}>
      <td className="fc-tab-marca" onClick={(ev) => ev.stopPropagation()} onPointerDown={(ev) => ev.stopPropagation()}>
        <input type="checkbox" checked={marcado} onChange={(ev) => aoMarcar(c.id, ev.nativeEvent.shiftKey)} aria-label="Selecionar cartão" />
      </td>
      <td className="fc-tab-frente"><span>{resumo(nota, c.ordinal)}</span>
        <small className="fc-tab-lugar-cel">{lugar} · {quando(c, agora)}</small>
      </td>
      <td className="fc-tab-lugar">{lugar}</td>
      <td><span className={`fc-selo fc-selo--${e}`}>{estadoDoCartao(c)}</span></td>
      <td className="fc-tab-quando">{quando(c, agora)}</td>
      <td className="fc-tab-dif">{c.fsrs.state === ESTADOS.novo ? "—" : <span className="fc-dif" style={{ "--d": c.fsrs.difficulty / 10 }}>{c.fsrs.difficulty.toFixed(1)}</span>}</td>
    </tr>
  );
}

/* ---------- diálogos de lote ---------- */

function MoverPara({ aberto, n, estado, aoFechar, aoMover }) {
  const [materia, setMateria] = useState("");
  const [topico, setTopico] = useState("");
  useEffect(() => {
    if (!aberto) return;
    const m = estado.materias[0]?.id || "";
    setMateria(m);
    setTopico(estado.topicos.find((t) => t.materiaId === m)?.id || "");
  }, [aberto]); // eslint-disable-line react-hooks/exhaustive-deps
  const topicos = estado.topicos.filter((t) => t.materiaId === materia);
  return (
    <Dialogo aberto={aberto} aoFechar={aoFechar} titulo={`Mover ${n} ${n === 1 ? "cartão" : "cartões"}`} largura={440}>
      <div className="fc-dialogo-corpo">
        <label className="fc-campo"><span>Matéria</span>
          <select className="fc-entrada" value={materia} onChange={(e) => { setMateria(e.target.value); setTopico(estado.topicos.find((t) => t.materiaId === e.target.value)?.id || ""); }}>
            {estado.materias.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
          </select>
        </label>
        <label className="fc-campo"><span>Tópico</span>
          <select className="fc-entrada" value={topico} onChange={(e) => setTopico(e.target.value)}>
            {!topicos.length && <option value="">Esta matéria não tem tópicos</option>}
            {topicos.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </select>
        </label>
        <p className="fc-dica">Cartões de lacunas e de oclusão vão com os irmãos (a nota inteira). O progresso fica.</p>
      </div>
      <footer className="fc-dialogo-acoes">
        <Botao onClick={aoFechar}>Cancelar</Botao>
        <Botao variante="primario" disabled={!topico} onClick={() => aoMover({ materiaId: materia, topicoId: topico })}>Mover</Botao>
      </footer>
    </Dialogo>
  );
}

function EditarTags({ aberto, n, conhecidas, aoFechar, aoAplicar }) {
  const [adicionar, setAdicionar] = useState("");
  const [remover, setRemover] = useState("");
  useEffect(() => { if (aberto) { setAdicionar(""); setRemover(""); } }, [aberto]);
  const lista = (s) => s.split(",").map((t) => t.trim()).filter(Boolean);
  return (
    <Dialogo aberto={aberto} aoFechar={aoFechar} titulo={`Tags de ${n} ${n === 1 ? "cartão" : "cartões"}`} largura={440}>
      <div className="fc-dialogo-corpo">
        <label className="fc-campo"><span>Acrescentar</span>
          <input className="fc-entrada" list="fc-tags-lote" value={adicionar} onChange={(e) => setAdicionar(e.target.value)} placeholder="revisar, banca FUVEST" />
        </label>
        <label className="fc-campo"><span>Tirar</span>
          <input className="fc-entrada" list="fc-tags-lote" value={remover} onChange={(e) => setRemover(e.target.value)} placeholder="separe por vírgula" />
        </label>
        <datalist id="fc-tags-lote">{conhecidas.map((t) => <option key={t} value={t} />)}</datalist>
      </div>
      <footer className="fc-dialogo-acoes">
        <Botao onClick={aoFechar}>Cancelar</Botao>
        <Botao variante="primario" disabled={!lista(adicionar).length && !lista(remover).length} onClick={() => aoAplicar({ adicionar: lista(adicionar), remover: lista(remover) })}>Aplicar</Botao>
      </footer>
    </Dialogo>
  );
}

/* ---------- painel do cartão aberto ---------- */

function Painel({ c, nota, lugar, agora, aoFechar, acoes }) {
  const { agendador } = useLoja();
  const [lado, setLado] = useState("frente");
  useEffect(() => setLado("frente"), [c.id]);
  const r = agendador.retencao(c, agora);
  const novo = c.fsrs.state === ESTADOS.novo;
  return (
    <aside className="fc-painel" aria-label="Cartão selecionado">
      <header className="fc-painel-topo">
        <div className="fc-escolhas fc-escolhas--compactas" role="radiogroup" aria-label="Lado">
          {["frente", "verso"].map((l) => <button key={l} type="button" role="radio" aria-checked={lado === l} className="fc-escolha" onClick={() => setLado(l)}>{l === "frente" ? "Frente" : "Verso"}</button>)}
        </div>
        <Botao variante="fantasma" icone={X} aria-label="Fechar" onClick={aoFechar} />
      </header>
      <div className="fc-previa-cartao">{nota ? <Cartao nota={nota} ordinal={c.ordinal} lado={lado} /> : <p className="fc-dica">Nota não encontrada.</p>}</div>
      <dl className="fc-info fc-info--painel">
        <div><dt>Onde</dt><dd>{lugar}</dd></div>
        <div><dt>Estado</dt><dd>{estadoDoCartao(c)}</dd></div>
        <div><dt>Próxima revisão</dt><dd>{quando(c, agora)}</dd></div>
        <div><dt>Chance de lembrar agora</dt><dd>{r == null ? "—" : `${Math.round(r * 100)}%`}</dd></div>
        <div><dt>Estabilidade</dt><dd>{novo ? "—" : `${c.fsrs.stability.toFixed(1)} dias`}</dd></div>
        <div><dt>Dificuldade</dt><dd>{novo ? "—" : `${c.fsrs.difficulty.toFixed(1)} de 10`}</dd></div>
        {nota?.tags?.length > 0 && <div><dt>Tags</dt><dd>{nota.tags.join(", ")}</dd></div>}
      </dl>
      <div className="fc-painel-acoes">
        <Botao variante="primario" icone={Pencil} onClick={acoes.editar}>Editar</Botao>
        <Botao icone={RotateCcw} onClick={acoes.reverHoje} disabled={c.suspenso}>Rever hoje</Botao>
        <Botao icone={EyeOff} onClick={acoes.suspender}>{c.suspenso ? "Reativar" : "Suspender"}</Botao>
        <Menu rotulo="Mais ações" itens={[
          { rotulo: "Histórico de respostas", icone: Info, aoClicar: acoes.info },
          { rotulo: "Mover para…", icone: FolderInput, aoClicar: acoes.mover },
          { rotulo: "Adiar ou escolher a data", icone: CalendarClock, aoClicar: acoes.data },
          { rotulo: "Enterrar até amanhã", icone: SkipForward, aoClicar: acoes.enterrar, desativado: c.suspenso },
          { rotulo: "Recomeçar do zero", icone: RotateCcw, aoClicar: acoes.resetar, desativado: novo },
          "-",
          { rotulo: "Apagar nota", icone: Trash2, perigo: true, aoClicar: acoes.apagar },
        ]} />
      </div>
    </aside>
  );
}

/* ---------- tela ---------- */

export default function Navegar() {
  const { estado, repo, loja, agendador } = useLoja();
  const base = useBase();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [notas, setNotas] = useState(null);
  const [cartoes, setCartoes] = useState(null);
  const [busca, setBusca] = useState(params.get("q") || "");
  const buscaAdiada = useDeferredValue(busca);
  const [limite, setLimite] = useState(POR_PAGINA);
  const [marcados, setMarcados] = useState(() => new Set());
  const [ultimoMarcado, setUltimoMarcado] = useState(null);
  const [aberto, setAberto] = useState(null); // id do cartão no painel
  const [dialogo, setDialogo] = useState(null);
  const [arrastando, setArrastando] = useState(null);
  const [erroLote, setErroLote] = useState(null);
  const agora = useMemo(() => new Date(), [cartoes]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const p1 = repo.observar("notas", {}, setNotas, (e) => avisar(e.message, { tipo: "erro" }));
    const p2 = repo.observar("cartoes", {}, setCartoes, (e) => avisar(e.message, { tipo: "erro" }));
    return () => { p1(); p2(); };
  }, [repo]);

  const filtro = { materia: params.get("materia") || "", topico: params.get("topico") || "", tag: params.get("tag") || "", estado: params.get("estado") || "", tipo: params.get("tipo") || "", ordem: params.get("ordem") || "criado" };
  const mudar = (patch) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) { if (v) p.set(k, v); else p.delete(k); }
    setParams(p, { replace: true });
    setLimite(POR_PAGINA);
    setMarcados(new Set());
  };

  const mapaNotas = useMemo(() => new Map((notas || []).map((n) => [n.id, n])), [notas]);
  const nomeMateria = useMemo(() => Object.fromEntries(estado.materias.map((m) => [m.id, m.nome])), [estado.materias]);
  const nomeTopico = useMemo(() => Object.fromEntries(estado.topicos.map((t) => [t.id, t.nome])), [estado.topicos]);
  const lugarDe = (c) => `${nomeMateria[c.materiaId] || "?"} › ${nomeTopico[c.topicoId] || "?"}`;

  // índice de busca por nota (texto de todos os campos, rótulos e tags, sem acentos)
  const textoNota = useMemo(() => {
    const m = new Map();
    for (const n of notas || []) {
      const c = n.campos || {};
      const partes = [c.frente, c.verso, c.texto, c.extra].map(textoDoHtml);
      if (c.formas) partes.push(...c.formas.map((f) => f.rotulo));
      m.set(n.id, semAcento([...partes, ...(n.tags || [])].join(" ")));
    }
    return m;
  }, [notas]);

  const contagens = useMemo(() => {
    const r = { total: 0, materia: {}, topico: {}, tag: {} };
    for (const c of cartoes || []) {
      r.total += 1;
      r.materia[c.materiaId] = (r.materia[c.materiaId] || 0) + 1;
      r.topico[c.topicoId] = (r.topico[c.topicoId] || 0) + 1;
      for (const t of c.tags || []) r.tag[t] = (r.tag[t] || 0) + 1;
    }
    return r;
  }, [cartoes]);

  const lista = useMemo(() => {
    if (!cartoes) return [];
    const termos = semAcento(buscaAdiada).split(/\s+/).filter(Boolean);
    const fim = estado.fimDoDia ? estado.fimDoDia.getTime() : agora.getTime();
    let r = cartoes.filter((c) => {
      if (filtro.materia && c.materiaId !== filtro.materia) return false;
      if (filtro.topico && c.topicoId !== filtro.topico) return false;
      if (filtro.tag && !(c.tags || []).includes(filtro.tag)) return false;
      if (filtro.tipo && c.tipo !== filtro.tipo) return false;
      if (filtro.estado) {
        if (filtro.estado === "hoje") { if (!c.fila || new Date(c.fila).getTime() > fim) return false; } else if (chaveEstado(c, agora) !== filtro.estado) return false;
      }
      if (termos.length) { const t = textoNota.get(c.notaId) || ""; if (!termos.every((x) => t.includes(x))) return false; }
      return true;
    });
    const due = (c) => (c.fsrs.state === ESTADOS.novo || c.suspenso ? Infinity : new Date(c.fila || c.fsrs.due).getTime());
    const ordens = {
      criado: (a, b) => new Date(b.criadoEm) - new Date(a.criadoEm) || a.id.localeCompare(b.id),
      proxima: (a, b) => due(a) - due(b),
      dificuldade: (a, b) => (b.fsrs.state ? b.fsrs.difficulty : -1) - (a.fsrs.state ? a.fsrs.difficulty : -1),
      frente: (a, b) => resumo(mapaNotas.get(a.notaId), a.ordinal).localeCompare(resumo(mapaNotas.get(b.notaId), b.ordinal), "pt-BR"),
    };
    r = [...r].sort(ordens[filtro.ordem] || ordens.criado);
    return r;
  }, [cartoes, buscaAdiada, filtro.materia, filtro.topico, filtro.tag, filtro.tipo, filtro.estado, filtro.ordem, textoNota, mapaNotas, agora, estado.fimDoDia]); // eslint-disable-line react-hooks/exhaustive-deps

  const sensores = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 8 } }), useSensor(TouchSensor, { activationConstraint: { delay: 350, tolerance: 6 } }));
  const estreita = useEstreita();

  if (!notas || !cartoes) return <Carregando texto="Carregando seus cartões…" />;

  const visiveis = lista.slice(0, limite);
  const selecao = cartoes.filter((c) => marcados.has(c.id));
  const notasDe = (cs) => [...new Map(cs.map((c) => [c.notaId, mapaNotas.get(c.notaId)]).filter(([, n]) => n)).values()];
  const todosMarcados = visiveis.length > 0 && visiveis.every((c) => marcados.has(c.id));
  const marcar = (id, comShift) => {
    setMarcados((m) => {
      const n = new Set(m);
      if (comShift && ultimoMarcado) {
        const i = visiveis.findIndex((c) => c.id === ultimoMarcado);
        const j = visiveis.findIndex((c) => c.id === id);
        if (i >= 0 && j >= 0) { visiveis.slice(Math.min(i, j), Math.max(i, j) + 1).forEach((c) => n.add(c.id)); return n; }
      }
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
    setUltimoMarcado(id);
  };
  const cartaoAberto = aberto ? cartoes.find((c) => c.id === aberto) : null;

  const emLote = async (fn, mensagem) => {
    setErroLote(null);
    const r = await executar(fn, { ok: mensagem });
    if (r.ok) { loja.recontar(); setDialogo(null); } else setErroLote(r.erro);
    return r.ok;
  };
  const alvo = (dialogo?.alvo) || selecao;
  const acoesDe = (cs) => ({
    // rever hoje: voltam para a fila de hoje (a contagem recomeça quando você responder)
    reverHoje: async () => {
      const ativos = cs.filter((c) => !c.suspenso);
      const r = await executar(() => definirData(repo, ativos, new Date()));
      if (!r.ok) return;
      loja.recontar();
      avisar(`${ativos.length === 1 ? "Volta" : `${ativos.length} cartões voltam`} para hoje.`, { acao: { rotulo: "Estudar agora", fn: () => navigate(`${base}/estudar`) } });
    },
    suspender: () => emLote(() => suspender(repo, cs, !cs.every((c) => c.suspenso)), cs.every((c) => c.suspenso) ? "Reativado." : "Suspenso: sai das revisões até reativar."),
    enterrar: () => emLote(() => enterrar(repo, cs, { virada: estado.config.viradaDoDia }), "Enterrado até amanhã."),
    resetar: () => setDialogo({ tipo: "resetar", alvo: cs }),
    data: () => setDialogo({ tipo: "data", alvo: cs }),
    mover: () => setDialogo({ tipo: "mover", alvo: cs }),
    tags: () => setDialogo({ tipo: "tags", alvo: cs }),
    apagar: () => setDialogo({ tipo: "apagar", alvo: cs }),
  });
  const lote = acoesDe(selecao);

  const fimArrasto = async ({ active, over }) => {
    setArrastando(null);
    if (!over || !String(over.id).startsWith("topico:")) return;
    const topicoId = String(over.id).slice(7);
    const t = estado.topicos.find((x) => x.id === topicoId);
    const cs = marcados.has(active.id) ? selecao : cartoes.filter((c) => c.id === active.id);
    const ns = notasDe(cs);
    await emLote(() => moverNotas(repo, ns, { materiaId: t.materiaId, topicoId }, { cartoes }), `${cs.length} ${cs.length === 1 ? "cartão movido" : "cartões movidos"} para ${t.nome}.`);
  };

  const semNada = cartoes.length === 0;

  return (
    <DndContext sensors={sensores} onDragStart={({ active }) => setArrastando(active.id)} onDragEnd={fimArrasto} onDragCancel={() => setArrastando(null)}>
      <div className={`fc-navegar${cartaoAberto ? " fc-navegar--painel" : ""}`}>
        <Lateral estado={estado} filtro={filtro} mudar={mudar} contagens={contagens} />
        <section className="fc-navegar-principal" aria-label="Cartões">
          <div className="fc-nav-filtros">
            <label className="fc-busca">
              <Search aria-hidden="true" />
              <input value={busca} onChange={(e) => { setBusca(e.target.value); setLimite(POR_PAGINA); }} placeholder="Buscar no texto, rótulos e tags" aria-label="Buscar" />
              {busca && <button type="button" aria-label="Limpar busca" onClick={() => setBusca("")}><X aria-hidden="true" /></button>}
            </label>
            <select className="fc-entrada fc-nav-sel fc-so-cel" value={filtro.topico ? `t:${filtro.topico}` : filtro.materia ? `m:${filtro.materia}` : filtro.tag ? `g:${filtro.tag}` : ""} aria-label="Onde"
              onChange={(e) => { const [k, v] = [e.target.value.slice(0, 1), e.target.value.slice(2)]; mudar({ materia: k === "m" ? v : "", topico: k === "t" ? v : "", tag: k === "g" ? v : "" }); }}>
              <option value="">Todos os cartões</option>
              {estado.materias.map((m) => [
                <option key={m.id} value={`m:${m.id}`}>{m.nome}</option>,
                ...estado.topicos.filter((t) => t.materiaId === m.id).map((t) => <option key={t.id} value={`t:${t.id}`}>{"  "}{m.nome} › {t.nome}</option>),
              ])}
              {estado.tagsConhecidas.map((t) => <option key={`g${t}`} value={`g:${t}`}>#{t}</option>)}
            </select>
            <select className="fc-entrada fc-nav-sel" value={filtro.estado} onChange={(e) => mudar({ estado: e.target.value })} aria-label="Estado">
              {ESTADOS_FILTRO.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
            </select>
            <select className="fc-entrada fc-nav-sel" value={filtro.tipo} onChange={(e) => mudar({ tipo: e.target.value })} aria-label="Tipo">
              <option value="">Todos os formatos</option><option value="basico">Frente e verso</option><option value="cloze">Trechos escondidos</option><option value="oclusao">Imagem</option>
            </select>
            <select className="fc-entrada fc-nav-sel" value={filtro.ordem} onChange={(e) => mudar({ ordem: e.target.value })} aria-label="Ordenar">
              {ORDENS.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
            </select>
          </div>

          <div className="fc-nav-resumo">
            <span>{lista.length} {lista.length === 1 ? "cartão" : "cartões"}{lista.length !== cartoes.length ? ` de ${cartoes.length}` : ""}</span>
            {lista.length > 0 && (filtro.materia || filtro.topico || filtro.tag) && (
              <Botao tamanho="sm" variante="fantasma" icone={Play} onClick={() => navigate(`${base}/estudar?${filtro.topico ? `topico=${filtro.topico}` : filtro.materia ? `materia=${filtro.materia}` : `tag=${encodeURIComponent(filtro.tag)}`}`)}>Estudar este recorte</Botao>
            )}
          </div>

          {marcados.size > 0 && (
            <div className="fc-lote" role="toolbar" aria-label="Ações nos selecionados">
              <strong>{marcados.size} {marcados.size === 1 ? "selecionado" : "selecionados"}</strong>
              <Botao tamanho="sm" variante="primario" icone={RotateCcw} onClick={lote.reverHoje}>Rever hoje</Botao>
              <Botao tamanho="sm" icone={FolderInput} onClick={lote.mover}>Mover</Botao>
              <Botao tamanho="sm" icone={IconeTag} onClick={lote.tags}>Tags</Botao>
              <Botao tamanho="sm" icone={EyeOff} onClick={lote.suspender}>{selecao.every((c) => c.suspenso) ? "Reativar" : "Suspender"}</Botao>
              <Menu rotulo="Mais ações nos selecionados" itens={[
                { rotulo: "Adiar ou escolher a data", icone: CalendarClock, aoClicar: lote.data },
                { rotulo: "Enterrar até amanhã", icone: SkipForward, aoClicar: lote.enterrar },
                { rotulo: "Recomeçar do zero", icone: RotateCcw, aoClicar: lote.resetar },
                "-",
                { rotulo: "Apagar", icone: Trash2, perigo: true, aoClicar: lote.apagar },
              ]} />
              <Botao tamanho="sm" variante="fantasma" icone={X} aria-label="Limpar seleção" onClick={() => setMarcados(new Set())} />
            </div>
          )}

          {semNada ? (
            <Vazio titulo="Nenhum cartão ainda" texto="Crie cartões na aba Adicionar.">
              <Botao variante="primario" onClick={() => navigate(`${base}/novo`)}>Adicionar cartões</Botao>
            </Vazio>
          ) : lista.length === 0 ? (
            <Vazio titulo="Nada com esses filtros" texto="Mude a busca ou os filtros." />
          ) : (
            <div className="fc-tabela-caixa">
              <table className="fc-tabela">
                <thead>
                  <tr>
                    <th className="fc-tab-marca"><input type="checkbox" checked={todosMarcados} aria-label="Selecionar todos os visíveis"
                      onChange={() => setMarcados(todosMarcados ? new Set() : new Set(visiveis.map((c) => c.id)))} /></th>
                    <th>Frente</th><th className="fc-tab-lugar">Onde</th><th>Estado</th><th className="fc-tab-quando">Próxima</th><th className="fc-tab-dif">Dificuldade</th>
                  </tr>
                </thead>
                <tbody>
                  {visiveis.map((c) => (
                    <Linha key={c.id} c={c} nota={mapaNotas.get(c.notaId)} lugar={lugarDe(c)} agora={agora} marcado={marcados.has(c.id)} aoMarcar={marcar}
                      aoAbrir={(x) => setAberto(x.id)} ativo={aberto === c.id} />
                  ))}
                </tbody>
              </table>
              {lista.length > limite && <div className="fc-mais"><Botao onClick={() => setLimite((l) => l + POR_PAGINA)}>Mostrar mais {Math.min(POR_PAGINA, lista.length - limite)}</Botao></div>}
            </div>
          )}
        </section>

        {cartaoAberto && (() => {
          const painel = (
            <Painel c={cartaoAberto} nota={mapaNotas.get(cartaoAberto.notaId)} lugar={lugarDe(cartaoAberto)} agora={agora} aoFechar={() => setAberto(null)}
              acoes={{
                ...acoesDe([cartaoAberto]),
                editar: () => setDialogo({ tipo: "editar", notaId: cartaoAberto.notaId }),
                info: () => setDialogo({ tipo: "info", alvo: [cartaoAberto] }),
              }} />
          );
          return estreita ? createPortal(<div className="fc fc-painel-sobre">{painel}</div>, document.body) : painel;
        })()}
      </div>

      <DragOverlay dropAnimation={null}>
        {arrastando ? <div className="fc fc-arrasto">{marcados.has(arrastando) && marcados.size > 1 ? `Mover ${marcados.size} cartões` : "Mover cartão"} → solte num tópico</div> : null}
      </DragOverlay>

      {dialogo?.tipo === "editar" && (
        <Suspense fallback={null}>
          <EditorNota notaId={dialogo.notaId} emDialogo aoFechar={() => setDialogo(null)} aoSalvar={() => setDialogo(null)} />
        </Suspense>
      )}
      {dialogo?.tipo === "info" && <InfoCartao cartao={dialogo.alvo[0]} aoFechar={() => setDialogo(null)} />}
      {dialogo?.tipo === "data" && <DefinirData cartoes={alvo} aoFechar={() => setDialogo(null)} aoConcluir={() => { avisar("Data da próxima revisão salva."); loja.recontar(); }} />}
      <MoverPara aberto={dialogo?.tipo === "mover"} n={alvo.length} estado={estado} aoFechar={() => setDialogo(null)}
        aoMover={(destino) => emLote(() => moverNotas(repo, notasDe(alvo), destino, { cartoes }), "Movido.")} />
      <EditarTags aberto={dialogo?.tipo === "tags"} n={alvo.length} conhecidas={estado.tagsConhecidas} aoFechar={() => setDialogo(null)}
        aoAplicar={(mud) => emLote(() => alterarTags(repo, notasDe(alvo), mud, { cartoes, tagsConhecidas: estado.tagsConhecidas }), "Tags atualizadas.")} />
      <Confirmar aberto={dialogo?.tipo === "resetar"} titulo={`Recomeçar ${alvo.length === 1 ? "este cartão" : `${alvo.length} cartões`} do zero?`} rotulo="Recomeçar" erro={erroLote}
        aoFechar={() => setDialogo(null)} aoConfirmar={() => emLote(() => resetar(repo, alvo, agendador), "Recomeçaram do zero.")}>
        <p className="fc-texto">Voltam a ser cartões novos: o algoritmo esquece o que sabia sobre eles. Para só rever antes do prazo, use “Rever hoje”. O histórico de respostas continua nas estatísticas.</p>
      </Confirmar>
      <Confirmar aberto={dialogo?.tipo === "apagar"} titulo="Apagar?" rotulo="Apagar" perigo erro={erroLote} aoFechar={() => setDialogo(null)}
        aoConfirmar={async () => { if (await emLote(() => apagarNotas(repo, notasDe(alvo), { cartoes }), "Apagado.")) { setMarcados(new Set()); setAberto(null); } }}>
        <p className="fc-texto">Vão {notasDe(alvo).length} {notasDe(alvo).length === 1 ? "nota" : "notas"} com todos os cartões delas (inclusive lacunas e formas irmãs). Não dá para desfazer.</p>
      </Confirmar>
    </DndContext>
  );
}
