/* Edital: o plano de estudos em blocos. Matéria → tópicos (a unidade de
   estudo, que vira meta) → subtópicos (orientação dentro do tópico).
   Serve ao aluno (Edital), ao moderador (aba Edital de cada aluno) e às
   jornadas (plano geral de um vestibular). O que cada um pode mexer vem de
   `pode`; as permissões do aluno vêm do plano. */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, ArrowDown, ArrowUp, CalendarClock, Check, Clock4, History, Minus, Plus, RefreshCw, RotateCcw, Scissors, Settings2, Trash2, Undo2, X,
} from "lucide-react";
import { DIAS, fmtMin } from "../../core/nucleo.js";
import { fmtDataCurta, fmtDataLonga } from "../../core/datas.js";
import { CARGA_PADRAO, PERMISSOES_ALUNO, PRIORIDADES, RITMOS, capacidadeSemanal, idItem, itensDoPlano, nomeRitmo, topicosEmOrdem } from "../../core/plano.js";
import { useApp } from "../../state/AppContext.jsx";
import { useAcao, useLogs, useVistos } from "../../state/hooks.js";
import { Barra, Botao, Campo, Carregando, Confirmar, Dialogo, MensagemErro, Vazio } from "../../ui/ui.jsx";
import { quando } from "../aluno/Avisos.jsx";

const pctTxt = (v) => `${String(v).replace(".", ",")}%`;
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

/* ---------- Confirmação de alteração (prévia + motivo) ---------- */

export function useEdicaoPlano(alunoId, { confirmar = true } = {}) {
  const { s, usuario } = useApp();
  const [pedido, setPedido] = useState(null); // { ops, titulo, previa }
  const [motivo, setMotivo] = useState("");
  const { executar, ocupado, erro, limparErro } = useAcao();

  const aplicar = (ops) => executar(async () => {
    await s.planos.alterar(alunoId, ops, { motivo });
    setPedido(null);
    setMotivo("");
  });

  const propor = (ops, titulo = "Alterar o plano") => {
    const lista = Array.isArray(ops) ? ops : [ops];
    if (!confirmar) return aplicar(lista);
    limparErro();
    setPedido({ ops: lista, titulo, previa: null });
    return executar(async () => {
      const previa = await s.planos.previa(alunoId, lista);
      setPedido((p) => (p ? { ...p, previa } : p));
    });
  };

  const dialogo = (
    <Confirmar aberto={!!pedido} titulo={pedido?.titulo} rotulo="Aplicar alteração" ocupado={ocupado || !pedido?.previa} erro={erro}
      aoFechar={() => { setPedido(null); setMotivo(""); limparErro(); }} aoConfirmar={() => aplicar(pedido.ops)}>
      {!pedido?.previa ? <Carregando texto="Calculando o impacto…" /> : (
        <>
          <ul className="lista-alteracoes">
            {pedido.previa.alteracoes.map((a, i) => <li key={i}>{a.descricao}{a.antes != null || a.depois != null ? <small> · {fmtValorLog(a.antes)} → {fmtValorLog(a.depois)}</small> : null}</li>)}
            {!pedido.previa.alteracoes.length && <li>Nada muda com esta alteração.</li>}
          </ul>
          <p className="aviso" role="note">
            <CalendarClock aria-hidden="true" />
            <span>
              Essa alteração modificará <b>{pedido.previa.conteudosRemarcados}</b> {pedido.previa.conteudosRemarcados === 1 ? "tópico futuro" : "tópicos futuros"} do cronograma
              {pedido.previa.conteudosRetirados > 0 && <>, retira <b>{pedido.previa.conteudosRetirados}</b> {pedido.previa.conteudosRetirados === 1 ? "tópico pendente" : "tópicos pendentes"}</>}
              {pedido.previa.conteudosIncluidos > 0 && <>, inclui <b>{pedido.previa.conteudosIncluidos}</b> {pedido.previa.conteudosIncluidos === 1 ? "tópico novo" : "tópicos novos"}</>}.
              {" "}O que já foi estudado fica preservado{pedido.previa.concluidosPreservados ? ` (${plural(pedido.previa.concluidosPreservados, "tópico cortado", "tópicos cortados")})` : ""}.
              {pedido.previa.fimAntes !== pedido.previa.fimDepois && <> Previsão de término: {fmtDataLonga(pedido.previa.fimAntes) || "sem previsão"} → <b>{fmtDataLonga(pedido.previa.fimDepois) || "sem previsão"}</b>.</>}
              {!pedido.previa.cabeDepois && <> <b>Não cabe até a data-alvo</b> com as horas atuais.</>}
            </span>
          </p>
          {usuario?.role === "moderador" && (
            <Campo rotulo="Motivo (opcional)" ajuda="Fica no histórico de alterações do aluno.">
              <input className="entrada" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            </Campo>
          )}
        </>
      )}
    </Confirmar>
  );
  return { propor, aplicar, dialogo, ocupado, erro };
}

/* ---------- Valores do histórico ---------- */

export function fmtValorLog(v) {
  if (v == null || v === "") return "—";
  if (typeof v === "boolean") return v ? "sim" : "não";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "object") {
    if (DIAS.every((d) => d.k in v)) return DIAS.map((d) => `${d.nome.slice(0, 3).toLowerCase()} ${fmtMin(v[d.k] || 0)}`).join(", ");
    if ("intervalos" in v) return `a cada ${v.intervalos.join("/")} dias, ${v.duracaoMin} min`;
    return Object.entries(v).map(([k, x]) => `${k}: ${typeof x === "object" ? JSON.stringify(x) : x}`).join(", ");
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(v))) return fmtDataLonga(v);
  return String(v);
}

/* ---------- Resumo em uma linha ---------- */

export function ResumoEdital({ v, acoes }) {
  const { ind } = useApp();
  const p = v.progressoPlano;
  const a = v.atrasos;
  const plano = v.plano;
  return (
    <section className="cartao resumo-edital" aria-label="Resumo do edital">
      <div className="resumo-edital-linha">
        <strong className="resumo-edital-pct num">{pctTxt(p.pct)}</strong>
        <div className="resumo-edital-barra">
          <Barra valor={p.pct} altura={8} />
          <small>
            {plural(p.concluidos, "tópico cortado", "tópicos cortados")} de {p.total}
            {" · "}{plano.fimPrevisto ? <>término previsto em <b>{fmtDataLonga(plano.fimPrevisto)}</b></> : "sem previsão de término"}
            {plano.dataAlvo && plano.fimPrevisto > plano.dataAlvo ? <span className="txt-erro"> · depois da data-alvo</span> : null}
          </small>
        </div>
        {acoes && <div className="linha-acoes">{acoes}</div>}
      </div>
      {a.quantidade > 0 && (
        <p className="aviso aviso--erro" role="note">
          <AlertTriangle aria-hidden="true" />
          {plural(a.quantidade, "tópico passou", "tópicos passaram")} da data prevista ({a.materias.map((m) => ind?.nomeMateria(m)).join(", ")}).
          Recalcular redistribui o que falta a partir de hoje, sem apagar o que já foi feito.
        </p>
      )}
    </section>
  );
}

/* ---------- Blocos de matérias ---------- */

export function BlocosMaterias({ plano, progresso, selecionada, aoSelecionar, mostrarOcultas = false }) {
  const { ind } = useApp();
  const materias = (plano.materias || []).filter((m) => ind.materia(m.materiaId) && (mostrarOcultas || m.ativa !== false));
  if (!materias.length) return <div className="cartao"><Vazio icone={Settings2} titulo="Nenhuma matéria no edital" /></div>;
  return (
    <div className="blocos-materias">
      {materias.map((m) => {
        const pm = progresso?.porMateria.find((x) => x.materiaId === m.materiaId);
        const topicos = (m.topicos || []).filter((t) => ind.topico(t.topicoId)).length;
        const oculta = m.ativa === false;
        const horas = plano.alocacaoSemanal?.[m.materiaId] ?? m.minutosSemanais ?? 0;
        return (
          <button key={m.materiaId} type="button" className={`bloco-materia${oculta ? " bloco-materia--oculta" : ""}`}
            style={{ "--cor": ind.corDaMateria(m.materiaId) }} aria-pressed={selecionada === m.materiaId}
            onClick={() => aoSelecionar(selecionada === m.materiaId ? null : m.materiaId)}>
            <span className="bloco-materia-nome">{ind.nomeMateria(m.materiaId)}</span>
            <span className="bloco-materia-info">
              {plural(topicos, "tópico", "tópicos")}{pm?.concluidos ? ` · ${pm.concluidos} ${pm.concluidos === 1 ? "cortado" : "cortados"}` : ""}
              {pm?.atrasados ? <b className="txt-erro"> · {pm.atrasados} em atraso</b> : null}
            </span>
            {pm && <span className="bloco-materia-barra"><Barra valor={pm.pct} cor="var(--cor)" /><small className="num">{pctTxt(pm.pct)}</small></span>}
            <span className="bloco-materia-rodape">
              {oculta ? <span className="etiqueta">Oculta para o aluno</span> : <span className="num">{fmtMin(horas)} por semana</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ---------- Tópicos de uma matéria ---------- */

function proximaRevisao(revisoes, itemId, hojeIso) {
  const futuras = (revisoes || []).filter((r) => r.itemId === itemId).flatMap((r) => r.sessoes.filter((x) => x.status === "agendada").map((x) => x.dia)).sort();
  return futuras.find((d) => d >= hojeIso) || futuras[0] || null;
}

function CargaEditor({ valor, padrao, aoSalvar, rotulo }) {
  const [editando, setEditando] = useState(false);
  const [x, setX] = useState(valor ?? "");
  if (!editando) return <button type="button" className="carga" onClick={() => { setX(valor ?? ""); setEditando(true); }} title="Mudar o tempo de estudo">{fmtMin(valor ?? padrao)}{valor != null && <i aria-label="(personalizado)">*</i>}</button>;
  return (
    <span className="carga-edicao">
      <input className="entrada num" type="number" min="5" step="5" aria-label={rotulo} value={x} placeholder={String(padrao)} autoFocus onChange={(e) => setX(e.target.value)} />
      <button type="button" className="icone-btn" aria-label="Salvar" onClick={() => { setEditando(false); aoSalvar(x === "" ? null : Number(x)); }}><Check /></button>
      <button type="button" className="icone-btn" aria-label="Cancelar" onClick={() => setEditando(false)}><Undo2 /></button>
    </span>
  );
}

function AdicionarSelect({ rotulo, opcoes, aoEscolher }) {
  return (
    <select className="entrada entrada--sm adicionar-select" value="" aria-label={rotulo} onChange={(e) => e.target.value && aoEscolher(e.target.value)}>
      <option value="">+ {rotulo}…</option>
      {opcoes.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
    </select>
  );
}

// "+ Novo tópico": abre um campo; Enter salva, Esc cancela
function NovoNome({ rotulo, aoCriar, ocupado }) {
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState("");
  const [erro, setErro] = useState(null);
  const salvar = async () => {
    if (!nome.trim()) return;
    setErro(null);
    try { await aoCriar(nome.trim()); setNome(""); setAberto(false); } catch (e) { setErro(e); }
  };
  if (!aberto) return <Botao variante="texto" tamanho="sm" icone={Plus} onClick={() => setAberto(true)}>{rotulo}</Botao>;
  return (
    <div className="novo-nome">
      <input className="entrada entrada--sm" value={nome} autoFocus aria-label={rotulo} placeholder="Nome"
        onChange={(e) => setNome(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") salvar(); if (e.key === "Escape") setAberto(false); }} />
      <Botao variante="solido" tamanho="sm" disabled={!nome.trim() || ocupado} onClick={salvar}>Criar</Botao>
      <Botao variante="texto" tamanho="sm" onClick={() => { setAberto(false); setNome(""); }}>Cancelar</Botao>
      <MensagemErro erro={erro} />
    </div>
  );
}

function infoDoTopico({ it, v, cortado, st, datas }) {
  const partes = [];
  if (!it) return "";
  if (v && cortado) {
    const e = v.estado(it);
    partes.push(e.concluidoEm ? `cortado em ${fmtDataCurta(e.concluidoEm)}` : "cortado");
    const rev = proximaRevisao(v.revisoes, it.itemId, v.hoje);
    if (rev) partes.push(`revisão ${fmtDataCurta(rev)}`);
    return partes.join(" · ");
  }
  partes.push(`${fmtMin(it.duracao)} de estudo`);
  if (v) {
    const e = v.estado(it);
    if (e.minutos > 0) partes.push(`${fmtMin(Math.min(e.minutos, it.duracao))} feitos`);
    if (datas?.inicio) {
      const quandoTxt = datas.inicio === datas.fim || !datas.fim ? fmtDataCurta(datas.inicio) : `${fmtDataCurta(datas.inicio)} a ${fmtDataCurta(datas.fim)}`;
      partes.push(st === "atrasado" ? `era para ${quandoTxt}` : `previsto ${quandoTxt}`);
    }
  }
  return partes.join(" · ");
}

/* pode: { reordenar, cortar, vistos, estrutura, criar, carga } */
export function TopicosDaMateria({
  plano, materiaId, pode = {}, v, vistos, aoOperar, aoCortar, aoDescortar, aoMarcarVisto, aoCriarTopico, aoCriarSubtopico, ocupado, aoFechar,
}) {
  const { ind } = useApp();
  const ref = useRef(null);
  const itens = useMemo(() => new Map(itensDoPlano({ ...plano, materias: plano.materias.map((m) => ({ ...m, ativa: true })) }, ind).map((it) => [it.itemId, it])), [plano, ind]);
  useEffect(() => { ref.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, [materiaId]);
  const m = plano.materias.find((x) => x.materiaId === materiaId);
  if (!m) return null;
  const topicos = topicosEmOrdem(plano, m).filter((t) => ind.topico(t.topicoId));
  const fora = ind.topicosDaMateria(materiaId).filter((t) => !m.topicos.some((x) => x.topicoId === t.id));
  const op = (o, titulo) => aoOperar(o, titulo);
  const nomeM = ind.nomeMateria(materiaId);

  return (
    <section ref={ref} className="cartao painel-topicos" style={{ "--cor": ind.corDaMateria(materiaId) }} aria-label={`Tópicos de ${nomeM}`}>
      <header className="painel-topicos-cabeca">
        <div>
          <h2 className="subtitulo">{nomeM}</h2>
          <p className="previa-linha">
            {plural(topicos.length, "tópico", "tópicos")} na ordem de estudo
            {m.ativa === false ? " · oculta para o aluno (não gera metas)" : ""}
          </p>
        </div>
        {aoFechar && <button type="button" className="icone-btn" aria-label="Fechar" onClick={aoFechar}><X /></button>}
      </header>

      {topicos.length === 0 && <p className="previa-linha">Nenhum tópico nesta matéria ainda.</p>}
      <ol className="lista-topicos">
        {topicos.map((t, i) => {
          const it = itens.get(idItem(t.topicoId));
          const cortado = !!(v && it && v.estado(it).concluido);
          const st = v && it && m.ativa !== false ? v.status(it) : null;
          const datas = plano.cronograma?.[idItem(t.topicoId)];
          const subs = (t.subtopicos || []).filter((x) => ind.subtopico(x.subtopicoId));
          const subsFora = ind.subtopicosDoTopico(t.topicoId).filter((x) => !t.subtopicos?.some((y) => y.subtopicoId === x.id));
          const nomeT = ind.nomeTopico(t.topicoId);
          return (
            <li key={t.topicoId} className={`topico${cortado ? " topico--cortado" : ""}${st === "atrasado" ? " topico--atrasado" : ""}`}>
              <div className="topico-cabeca">
                <span className="topico-num num" aria-hidden="true">{i + 1}</span>
                <div className="topico-texto">
                  <strong>{nomeT}</strong>
                  <small>{st === "atrasado" && <b className="txt-erro">Atrasado · </b>}{infoDoTopico({ it, v, cortado, st, datas })}</small>
                </div>
                <span className="topico-acoes">
                  {pode.carga && !cortado && (
                    <CargaEditor valor={t.cargaMin} padrao={ind.topico(t.topicoId)?.cargaMin ?? CARGA_PADRAO} rotulo={`Minutos de estudo de ${nomeT}`}
                      aoSalvar={(c) => op({ tipo: "definirCarga", materiaId, topicoId: t.topicoId, cargaMin: c }, "Mudar o tempo de estudo")} />
                  )}
                  {pode.reordenar && <>
                    <button type="button" className="icone-btn" aria-label={`Subir ${nomeT}`} disabled={i === 0 || ocupado} onClick={() => op({ tipo: "moverTopico", materiaId, topicoId: t.topicoId, passo: -1 }, "Mudar a ordem")}><ArrowUp /></button>
                    <button type="button" className="icone-btn" aria-label={`Descer ${nomeT}`} disabled={i === topicos.length - 1 || ocupado} onClick={() => op({ tipo: "moverTopico", materiaId, topicoId: t.topicoId, passo: 1 }, "Mudar a ordem")}><ArrowDown /></button>
                  </>}
                  {pode.cortar && it && (cortado
                    ? <Botao variante="texto" tamanho="sm" icone={Undo2} disabled={ocupado} aria-label={`Ver de novo: ${nomeT}`} onClick={() => aoDescortar(it)}>Ver de novo</Botao>
                    : <Botao variante="vidro" tamanho="sm" icone={Scissors} disabled={ocupado} aria-label={`Cortar ${nomeT}`} onClick={() => aoCortar(it)}>Cortar</Botao>)}
                  {pode.estrutura && <button type="button" className="icone-btn" aria-label={`Tirar ${nomeT} do edital`} title="Tirar do edital" disabled={ocupado} onClick={() => op({ tipo: "removerTopico", materiaId, topicoId: t.topicoId }, `Tirar ${nomeT} do edital`)}><Trash2 /></button>}
                </span>
              </div>
              {(subs.length > 0 || pode.estrutura || pode.criar) && (
                <ul className="lista-subtopicos" aria-label={`Orientação de ${nomeT}`}>
                  {subs.map((x) => {
                    const nomeS = ind.nomeSubtopico(x.subtopicoId);
                    return (
                      <li key={x.subtopicoId}>
                        {pode.vistos
                          ? <label className="sub-visto"><input type="checkbox" checked={!!vistos?.[x.subtopicoId]} disabled={ocupado} onChange={(e) => aoMarcarVisto(x.subtopicoId, e.target.checked)} /><span>{nomeS}</span></label>
                          : <span className="sub-nome">{nomeS}</span>}
                        {pode.estrutura && <button type="button" className="icone-btn icone-btn--mini" aria-label={`Tirar ${nomeS}`} disabled={ocupado} onClick={() => op({ tipo: "removerSubtopico", materiaId, topicoId: t.topicoId, subtopicoId: x.subtopicoId }, `Tirar ${nomeS}`)}><X /></button>}
                      </li>
                    );
                  })}
                  {(pode.estrutura && subsFora.length > 0) || pode.criar ? (
                    <li className="lista-subtopicos-acoes">
                      {pode.estrutura && subsFora.length > 0 && <AdicionarSelect rotulo="Subtópico existente" opcoes={subsFora} aoEscolher={(id) => op({ tipo: "adicionarSubtopico", materiaId, topicoId: t.topicoId, subtopicoId: id }, "Incluir subtópico")} />}
                      {pode.criar && <NovoNome rotulo="Novo subtópico" ocupado={ocupado} aoCriar={(nome) => aoCriarSubtopico(t.topicoId, nome)} />}
                    </li>
                  ) : null}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
      {(pode.criar || (pode.estrutura && fora.length > 0)) && (
        <div className="painel-topicos-rodape">
          {pode.criar && <NovoNome rotulo="Novo tópico" ocupado={ocupado} aoCriar={aoCriarTopico} />}
          {pode.estrutura && fora.length > 0 && <AdicionarSelect rotulo="Tópico existente" opcoes={fora} aoEscolher={(id) => op({ tipo: "adicionarTopico", materiaId, topicoId: id }, "Incluir tópico")} />}
        </div>
      )}
    </section>
  );
}

/* ---------- Incidência por matéria (rascunho + aplicar de uma vez) ---------- */

const DURACOES = [30, 45, 60, 75, 90, 120];
const camposMateria = (m) => ({ minutosSemanais: m.minutosSemanais ?? 0, maxSessao: m.maxSessao || 60, prioridade: m.prioridade ?? 2, ritmo: m.ritmo ?? 1, ativa: m.ativa !== false });
const metasDe = (x) => (x.minutosSemanais > 0 ? Math.ceil(x.minutosSemanais / x.maxSessao) : 0);

/* Cada matéria: se aparece, quantas metas por semana e de quanto tempo
   (a incidência), prioridade e velocidade. Muda-se o que quiser e aplica
   tudo junto; aoAplicar(ops) decide se confirma (plano do aluno) ou não. */
export function TabelaIncidencia({ plano, aoAplicar, ocupado, capacidade, comAlocacao = false }) {
  const { ind } = useApp();
  const [rascunho, setRascunho] = useState({});
  const materias = (plano.materias || []).filter((m) => ind.materia(m.materiaId));
  // só vale o que ainda difere do plano (depois de aplicar, o rascunho some sozinho)
  const pendentes = Object.fromEntries(materias.map((m) => {
    const orig = camposMateria(m);
    const campos = Object.fromEntries(Object.entries(rascunho[m.materiaId] || {}).filter(([k, x]) => x !== orig[k]));
    return [m.materiaId, campos];
  }).filter(([, c]) => Object.keys(c).length));
  const valor = (m) => ({ ...camposMateria(m), ...(pendentes[m.materiaId] || {}) });
  const mudar = (m, campos) => setRascunho((r) => ({ ...r, [m.materiaId]: { ...(pendentes[m.materiaId] || {}), ...campos } }));
  const mudarMetas = (m, n) => { const x = valor(m); mudar(m, { minutosSemanais: Math.max(0, n) * x.maxSessao }); };
  const mudarDuracao = (m, d) => { const x = valor(m); mudar(m, { maxSessao: d, minutosSemanais: Math.max(1, metasDe(x)) * d }); };
  const ops = Object.entries(pendentes).map(([materiaId, campos]) => ({ tipo: "definirMateria", materiaId, campos }));
  const total = materias.reduce((acc, m) => { const x = valor(m); return acc + (x.ativa ? x.minutosSemanais : 0); }, 0);
  const fora = ind.materias.filter((m) => !plano.materias?.some((x) => x.materiaId === m.id));

  return (
    <section className="secao" aria-labelledby="t-incidencia">
      <div className="secao-cabeca">
        <h2 id="t-incidencia" className="subtitulo">Incidência e metas por matéria</h2>
        <p className="previa-linha">Quantas metas cada matéria gera por semana, de quanto tempo, e se aparece. Mude o que quiser e aplique tudo de uma vez.</p>
      </div>
      <div className="tabela-rolagem">
        <table className="tabela tabela-incidencia tabela--cartoes">
          <thead><tr><th>Matéria</th><th>Aparece</th><th>Metas por semana</th><th>Cada meta</th><th className="num">Total</th><th>Prioridade</th><th>Velocidade</th></tr></thead>
          <tbody>
            {materias.map((m) => {
              const x = valor(m);
              const mudou = !!pendentes[m.materiaId];
              const nome = ind.nomeMateria(m.materiaId);
              const metas = metasDe(x);
              const real = comAlocacao ? plano.alocacaoSemanal?.[m.materiaId] : null;
              return (
                <tr key={m.materiaId} className={`${mudou ? "linha-mudou" : ""}${x.ativa ? "" : " linha-oculta"}`}>
                  <td className="celula-principal"><span className="celula-conteudo"><i className="ponto-materia" style={{ "--cor": ind.corDaMateria(m.materiaId) }} aria-hidden="true" /><strong>{nome}</strong>{mudou && <small className="etiqueta etiqueta--rev">alterada</small>}</span></td>
                  <td data-rotulo="Aparece">
                    <label className="interruptor"><input type="checkbox" checked={x.ativa} onChange={(e) => mudar(m, { ativa: e.target.checked })} aria-label={`${nome} aparece para o aluno`} /><span>{x.ativa ? "Sim" : "Oculta"}</span></label>
                  </td>
                  <td data-rotulo="Metas/sem">
                    <span className="passo">
                      <button type="button" className="icone-btn" aria-label={`Menos metas de ${nome}`} disabled={metas <= 0} onClick={() => mudarMetas(m, metas - 1)}><Minus /></button>
                      <b className="num" aria-live="polite">{metas}</b>
                      <button type="button" className="icone-btn" aria-label={`Mais metas de ${nome}`} disabled={metas >= 14} onClick={() => mudarMetas(m, metas + 1)}><Plus /></button>
                    </span>
                  </td>
                  <td data-rotulo="Cada meta">
                    <select className="entrada entrada--sm" value={x.maxSessao} aria-label={`Duração de cada meta de ${nome}`} onChange={(e) => mudarDuracao(m, Number(e.target.value))}>
                      {[...new Set([...DURACOES, x.maxSessao])].sort((a, b) => a - b).map((d) => <option key={d} value={d}>até {fmtMin(d)}</option>)}
                    </select>
                  </td>
                  <td className="num" data-rotulo="Total">
                    {fmtMin(x.minutosSemanais)}
                    {real != null && x.ativa && real !== x.minutosSemanais && !mudou && <small className="bloco-pequeno" title="Com data-alvo ou sem horas livres para tudo, o recálculo ajusta o tempo">no cronograma: {fmtMin(real)}</small>}
                  </td>
                  <td data-rotulo="Prioridade">
                    <select className="entrada entrada--sm" value={x.prioridade} aria-label={`Prioridade de ${nome}`} onChange={(e) => mudar(m, { prioridade: Number(e.target.value) })}>
                      {PRIORIDADES.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                    </select>
                  </td>
                  <td data-rotulo="Velocidade">
                    <select className="entrada entrada--sm" value={x.ritmo} aria-label={`Velocidade de ${nome}`} onChange={(e) => mudar(m, { ritmo: Number(e.target.value) })}>
                      {RITMOS.map((r) => <option key={r.id} value={r.multiplicador}>{r.nome}</option>)}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="barra-incidencia">
        <span className="num">
          Total: <b>{fmtMin(total)}</b> por semana{capacidade ? <> de {fmtMin(capacidade)} livres</> : null}
          {capacidade && total > capacidade ? <span className="txt-erro"> · passa das horas livres: a prioridade alta é atendida primeiro</span> : null}
        </span>
        {fora.length > 0 && <AdicionarSelect rotulo="Incluir matéria" opcoes={fora} aoEscolher={(id) => aoAplicar([{ tipo: "adicionarMateria", materiaId: id }], `Incluir ${ind.nomeMateria(id)}`)} />}
        {ops.length > 0 && <>
          <Botao variante="texto" tamanho="sm" onClick={() => setRascunho({})}>Descartar</Botao>
          <Botao variante="solido" tamanho="sm" disabled={ocupado} onClick={() => aoAplicar(ops, "Incidência e metas por matéria")}>Aplicar {plural(ops.length, "alteração", "alterações")}</Botao>
        </>}
      </div>
    </section>
  );
}

/* ---------- Rotina e regras: horas livres, ritmo, prazo, revisões, permissões ---------- */

function HorasLivres({ plano, podeEditar, aoOperar, ocupado }) {
  const [disp, setDisp] = useState(() => ({ ...(plano.disponibilidade || {}) }));
  const total = DIAS.reduce((s, d) => s + (Number(disp[d.k]) || 0), 0);
  const mudou = DIAS.some((d) => (Number(disp[d.k]) || 0) !== (Number(plano.disponibilidade?.[d.k]) || 0));
  return (
    <section className="form" aria-labelledby="t-horas">
      <h3 id="t-horas" className="subtitulo subtitulo--sm"><Clock4 aria-hidden="true" /> Horas livres por dia</h3>
      <p className="previa-linha">É o limite diário que as metas respeitam.</p>
      <div className="grade-dias">
        {DIAS.map((d) => (
          <label key={d.k} className="campo campo--dia">
            <span>{d.nome.slice(0, 3)}</span>
            <input className="entrada num" type="number" min="0" max="960" step="15" disabled={!podeEditar} value={disp[d.k] ?? 0}
              onChange={(e) => setDisp({ ...disp, [d.k]: Math.max(0, Number(e.target.value) || 0) })} aria-label={`Minutos livres ${d.nome}`} />
            <small className="num">{Number(disp[d.k]) ? fmtMin(Number(disp[d.k])) : "livre"}</small>
          </label>
        ))}
      </div>
      <p className="num">Total: <b>{fmtMin(total)}</b> por semana</p>
      {podeEditar && <Botao variante="solido" tamanho="sm" disabled={!mudou || ocupado} onClick={() => aoOperar({ tipo: "definirPlano", campos: { disponibilidade: Object.fromEntries(DIAS.map((d) => [d.k, Number(disp[d.k]) || 0])) } }, "Mudar as horas livres")}>Salvar horas</Botao>}
    </section>
  );
}

function RitmoDoPlano({ plano, podeEditar, aoOperar, ocupado }) {
  return (
    <Campo rotulo="Velocidade do plano" ajuda="Mais rápido encurta o tempo de cada tópico.">
      <select className="entrada" value={plano.ritmo || 1} disabled={!podeEditar || ocupado} onChange={(e) => aoOperar({ tipo: "definirPlano", campos: { ritmo: Number(e.target.value) } }, "Mudar a velocidade")}>
        {RITMOS.map((r) => <option key={r.id} value={r.multiplicador}>{r.nome} ({String(r.multiplicador).replace(".", ",")}×)</option>)}
      </select>
    </Campo>
  );
}

export function Organizacao({ plano, pode = {}, aoOperar, ocupado, modelo = false }) {
  const [dataAlvo, setDataAlvo] = useState(plano.dataAlvo || "");
  const [rev, setRev] = useState(() => ({ intervalos: (plano.revisao?.intervalos || [7, 15, 30]).join(", "), duracaoMin: plano.revisao?.duracaoMin || 20 }));
  const [perm, setPerm] = useState(() => ({ ...(plano.permissoesAluno || {}) }));
  const intervalos = rev.intervalos.split(/[,\s]+/).map(Number).filter((n) => Number.isInteger(n) && n > 0);

  return (
    <div className="grade-organizacao">
      {!modelo && <section className="cartao"><HorasLivres plano={plano} podeEditar={pode.disponibilidade} aoOperar={aoOperar} ocupado={ocupado} /></section>}

      <section className="cartao form" aria-labelledby="t-ritmo">
        <h3 id="t-ritmo" className="subtitulo subtitulo--sm"><RefreshCw aria-hidden="true" /> Ritmo e prazo</h3>
        <RitmoDoPlano plano={plano} podeEditar={pode.ritmo} aoOperar={aoOperar} ocupado={ocupado} />
        <Campo rotulo="Data-alvo" ajuda={pode.prazo ? "Com data-alvo, o recálculo aumenta o tempo semanal do que for preciso para terminar a tempo." : "Definida pelo professor."}>
          <span className="linha-entrada">
            <input className="entrada" type="date" value={dataAlvo} disabled={!pode.prazo} onChange={(e) => setDataAlvo(e.target.value)} />
            {pode.prazo && <Botao variante="vidro" tamanho="sm" disabled={(dataAlvo || null) === (plano.dataAlvo || null) || ocupado} onClick={() => aoOperar({ tipo: "definirPlano", campos: { dataAlvo: dataAlvo || null } }, "Mudar a data-alvo")}>Salvar</Botao>}
          </span>
        </Campo>
      </section>

      <section className="cartao form" aria-labelledby="t-rev">
        <h3 id="t-rev" className="subtitulo subtitulo--sm"><RotateCcw aria-hidden="true" /> Revisões espaçadas</h3>
        <div className="form-linha">
          <Campo rotulo="Dias depois de cortar" ajuda="Separados por vírgula."><input className="entrada num" value={rev.intervalos} disabled={!pode.revisao} onChange={(e) => setRev({ ...rev, intervalos: e.target.value })} /></Campo>
          <Campo rotulo="Duração (min)"><input className="entrada num" type="number" min="5" max="120" value={rev.duracaoMin} disabled={!pode.revisao} onChange={(e) => setRev({ ...rev, duracaoMin: Number(e.target.value) })} /></Campo>
        </div>
        {pode.revisao && <Botao variante="vidro" tamanho="sm" disabled={!intervalos.length || ocupado} onClick={() => aoOperar({ tipo: "definirPlano", campos: { revisao: { intervalos, duracaoMin: Number(rev.duracaoMin) || 20 } } }, "Mudar as revisões")}>Salvar revisões</Botao>}
      </section>

      {pode.permissoes && (
        <section className="cartao form" aria-labelledby="t-perm">
          <h3 id="t-perm" className="subtitulo subtitulo--sm"><Settings2 aria-hidden="true" /> O que o aluno pode mudar</h3>
          {PERMISSOES_ALUNO.map((p) => (
            <label key={p.id} className="checagem">
              <input type="checkbox" checked={!!perm[p.id]} onChange={(e) => setPerm({ ...perm, [p.id]: e.target.checked })} />
              {p.nome}
            </label>
          ))}
          <Botao variante="vidro" tamanho="sm" disabled={JSON.stringify(perm) === JSON.stringify(plano.permissoesAluno || {}) || ocupado}
            onClick={() => aoOperar({ tipo: "definirPlano", campos: { permissoesAluno: perm } }, "Mudar as permissões do aluno")}>Salvar permissões</Botao>
        </section>
      )}
    </div>
  );
}

/* ---------- Revisões ---------- */

export function ListaRevisoes({ v, podeIgnorar }) {
  const { s, ind } = useApp();
  const { executar, ocupado, erro } = useAcao();
  const linhas = (v.revisoes || []).flatMap((r) => r.sessoes.map((x) => ({
    r, dia: x.dia, status: x.status === "agendada" && x.dia < v.hoje ? "atrasada" : x.status, quando: x.realizadaEm || x.ignoradaEm,
  }))).sort((a, b) => a.dia.localeCompare(b.dia));
  const grupos = [
    { k: "atrasada", nome: "Atrasadas", tom: "perigo" },
    { k: "agendada", nome: "Agendadas" },
    { k: "realizada", nome: "Realizadas" },
    { k: "ignorada", nome: "Ignoradas" },
  ];
  if (!linhas.length) return <div className="cartao"><Vazio icone={RotateCcw} titulo="Nenhuma revisão ainda" texto="Ao cortar um tópico, as revisões são agendadas automaticamente." /></div>;
  return (
    <>
      <MensagemErro erro={erro} />
      {grupos.map((g) => {
        const lista = linhas.filter((l) => l.status === g.k);
        if (!lista.length) return null;
        const mostrar = g.k === "realizada" || g.k === "ignorada" ? lista.slice(-30).reverse() : lista;
        return (
          <section key={g.k} className="secao">
            <span className={`eyebrow${g.tom ? " perigo" : ""}`}>{g.nome} · {lista.length}</span>
            <ul className="lista-simples">
              {mostrar.map((l) => (
                <li key={`${l.r.id}|${l.dia}`} className="cartao linha-revisao">
                  <span className="num">{fmtDataCurta(l.dia)}</span>
                  <span className="celula-conteudo"><i className="ponto-materia" style={{ "--cor": ind.corDaMateria(l.r.materiaId) }} aria-hidden="true" /><span><small>{ind.nomeMateria(l.r.materiaId)}</small>{ind.nomeTopico(l.r.topicoId)}{l.r.subtopicoId ? ` · ${ind.nomeSubtopico(l.r.subtopicoId)}` : ""}</span></span>
                  <span className="num">{fmtMin(l.r.duracaoMin)}</span>
                  {(g.k === "agendada" || g.k === "atrasada") && podeIgnorar
                    ? <Botao variante="texto" tamanho="sm" disabled={ocupado} onClick={() => executar(() => s.estudo.marcarRevisao(v.aluno.id, l.r.id, l.dia, "ignorada"))}>Ignorar</Botao>
                    : g.k === "ignorada" && podeIgnorar
                      ? <Botao variante="texto" tamanho="sm" disabled={ocupado} onClick={() => executar(() => s.estudo.marcarRevisao(v.aluno.id, l.r.id, l.dia, "agendada"))}>Reativar</Botao>
                      : <span className="previa-linha">{l.quando ? fmtDataCurta(l.quando) : ""}</span>}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}

/* ---------- Histórico de alterações ---------- */

const ENTIDADES = { plano: "Edital", semana: "Semana", estudo: "Estudo", questoes: "Questões", simulado: "Simulado", aluno: "Cadastro", redacao: "Redação" };

export function Historico({ alunoId, entidades }) {
  const logs = useLogs(alunoId);
  const [filtro, setFiltro] = useState("");
  if (!logs) return <Carregando />;
  const lista = logs.filter((l) => (!entidades || entidades.includes(l.entidade)) && (!filtro || l.entidade === filtro));
  const usadas = [...new Set(logs.map((l) => l.entidade))].filter((e) => !entidades || entidades.includes(e));
  return (
    <>
      {usadas.length > 1 && (
        <div className="filtros" role="tablist" aria-label="Filtrar histórico">
          {[["", "Tudo"], ...usadas.map((e) => [e, ENTIDADES[e] || e])].map(([k, nome]) => (
            <button key={k || "tudo"} type="button" role="tab" className="filtro" aria-selected={filtro === k} onClick={() => setFiltro(k)}>{nome}</button>
          ))}
        </div>
      )}
      {lista.length === 0 ? <div className="cartao"><Vazio icone={History} titulo="Nenhuma alteração registrada" /></div> : (
        <div className="tabela-rolagem">
          <table className="tabela">
            <thead><tr><th>Quando</th><th>Quem</th><th>O que mudou</th><th>Antes</th><th>Depois</th><th>Motivo</th></tr></thead>
            <tbody>
              {lista.map((l) => (
                <tr key={l.id}>
                  <td className="num">{quando(l.em)}</td>
                  <td>{l.autorNome}<small className="bloco-pequeno">{l.papel === "moderador" ? "moderador" : "aluno"}</small></td>
                  <td>{l.descricao}</td>
                  <td className="celula-valor">{fmtValorLog(l.antes)}</td>
                  <td className="celula-valor">{fmtValorLog(l.depois)}</td>
                  <td>{l.motivo || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/* ---------- O edital de um aluno (visto pelo aluno ou pelo moderador) ---------- */

const REMOCOES = ["removerTopico", "removerSubtopico", "removerMateria"];

export function EditalDoAluno({ v, modo }) {
  const { s } = useApp();
  const moderador = modo === "moderador";
  const perm = v.plano?.permissoesAluno || {};
  const alunoId = v.aluno.id;
  const [aberta, setAberta] = useState(null);
  const [recalc, setRecalc] = useState(false);
  const [rotina, setRotina] = useState(false);
  const [historico, setHistorico] = useState(false);
  const confirmada = useEdicaoPlano(alunoId);
  const direta = useEdicaoPlano(alunoId, { confirmar: false });
  const acao = useAcao();
  const vistos = useVistos(alunoId);

  const pode = moderador
    ? { reordenar: true, cortar: true, vistos: true, estrutura: true, criar: true, carga: true, recalcular: true,
      disponibilidade: true, ritmo: true, prazo: true, revisao: true, permissoes: true }
    : { reordenar: !!perm.reordenar, cortar: !!perm.concluirItens, vistos: !!perm.concluirItens, recalcular: !!perm.recalcular,
      disponibilidade: !!perm.disponibilidade, ritmo: !!perm.ritmo };

  // tirar conteúdo e mexer na incidência passam pela prévia; ordem, inclusão e tempo vão direto (com log)
  const operar = (op, titulo) => (REMOCOES.includes(op.tipo) ? confirmada : direta).propor(op, titulo);
  const ocupado = acao.ocupado || confirmada.ocupado || direta.ocupado;
  const materiaVisivel = aberta && v.plano.materias.find((m) => m.materiaId === aberta && (moderador || m.ativa !== false));
  const mostrarRecalcular = pode.recalcular && (moderador || v.atrasos.quantidade > 0);

  return (
    <>
      <ResumoEdital v={v} acoes={<>
        {!moderador && (pode.disponibilidade || pode.ritmo) && <Botao variante="vidro" tamanho="sm" icone={Clock4} onClick={() => setRotina(true)}>Minha rotina</Botao>}
        {mostrarRecalcular && <Botao variante={v.atrasos.quantidade ? "solido" : "vidro"} tamanho="sm" icone={RefreshCw} disabled={ocupado} onClick={() => setRecalc(true)}>Recalcular</Botao>}
      </>} />
      <MensagemErro erro={acao.erro || direta.erro} />

      {moderador && (
        <TabelaIncidencia plano={v.plano} comAlocacao capacidade={capacidadeSemanal(v.plano.disponibilidade)} ocupado={ocupado}
          aoAplicar={(ops, titulo) => confirmada.propor(ops, titulo)} />
      )}

      <section className="secao" aria-label="Matérias">
        {moderador && <h2 className="subtitulo secao-titulo">Conteúdo do edital</h2>}
        <BlocosMaterias plano={v.plano} progresso={v.progressoPlano} selecionada={aberta} aoSelecionar={setAberta} mostrarOcultas={moderador} />
      </section>

      {materiaVisivel && (
        <TopicosDaMateria plano={v.plano} materiaId={aberta} pode={pode} v={v} vistos={vistos} ocupado={ocupado}
          aoFechar={() => setAberta(null)} aoOperar={operar}
          aoCortar={(it) => acao.executar(() => s.planos.concluirItem(alunoId, it.itemId))}
          aoDescortar={(it) => acao.executar(() => s.planos.reabrirItem(alunoId, it.itemId))}
          aoMarcarVisto={(subId, visto) => acao.executar(() => s.planos.marcarSubtopico(alunoId, subId, visto))}
          aoCriarTopico={(nome) => s.planos.novoTopico({ materiaId: aberta, nome, alunoId })}
          aoCriarSubtopico={(topicoId, nome) => s.planos.novoSubtopico({ materiaId: aberta, topicoId, nome, alunoId })} />
      )}

      {moderador ? (
        <details className="recolhivel">
          <summary>Rotina e regras deste aluno <small>horas livres, velocidade, data-alvo, revisões e permissões</small></summary>
          <Organizacao plano={v.plano} pode={pode} aoOperar={(op, titulo) => confirmada.propor(op, titulo)} ocupado={ocupado} />
        </details>
      ) : (
        <p className="rodape-edital"><Botao variante="texto" tamanho="sm" icone={History} onClick={() => setHistorico(true)}>Histórico de alterações</Botao></p>
      )}

      {confirmada.dialogo}
      {direta.dialogo}
      {rotina && (
        <Dialogo aberto titulo="Minha rotina" largura={560} aoFechar={() => setRotina(false)}>
          <div className="form">
            {pode.disponibilidade && <HorasLivres plano={v.plano} podeEditar aoOperar={(op, t) => { setRotina(false); confirmada.propor(op, t); }} ocupado={ocupado} />}
            {pode.ritmo && <RitmoDoPlano plano={v.plano} podeEditar aoOperar={(op, t) => { setRotina(false); confirmada.propor(op, t); }} ocupado={ocupado} />}
            <p className="previa-linha">Ritmo atual: {nomeRitmo(v.plano.ritmo).toLowerCase()}{v.plano.dataAlvo ? ` · data-alvo ${fmtDataLonga(v.plano.dataAlvo)}` : ""}.</p>
          </div>
        </Dialogo>
      )}
      {historico && (
        <Dialogo aberto titulo="Histórico de alterações" largura={820} aoFechar={() => setHistorico(false)}>
          <Historico alunoId={alunoId} entidades={["plano", "semana", "estudo"]} />
        </Dialogo>
      )}
      <Confirmar aberto={recalc} titulo="Recalcular o edital" rotulo="Recalcular" ocupado={acao.ocupado} erro={acao.erro}
        aoFechar={() => setRecalc(false)} aoConfirmar={() => acao.executar(async () => { await s.planos.recalcular(alunoId); setRecalc(false); })}>
        <p className="texto-dialogo">
          O que falta é redistribuído a partir de hoje, considerando as horas livres, a velocidade e a prioridade de cada matéria{v.plano.dataAlvo ? " e a data-alvo" : ""}.
          O que já foi cortado e o histórico de estudo continuam iguais. A semana atual é refeita de hoje em diante.
        </p>
      </Confirmar>
    </>
  );
}
