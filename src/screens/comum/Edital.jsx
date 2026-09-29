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
import {
  CARGA_PADRAO, PERMISSOES_ALUNO, PERMISSOES_PADRAO, PESOS, RITMOS, capacidadeSemanal, divisaoPorPeso, duracaoRevisao, estadoItem, idItem,
  itensDoPlano, limitesDe, minimoSemanal, nomePeso, nomeRitmo, pesoDe, topicosEmOrdem, validarDisponibilidade, validarLimites,
} from "../../core/plano.js";
import { BLOCO_MIN, DURACOES_META, MAX_SESSAO_PADRAO, deBlocos, passosDeTempo } from "../../core/blocos.js";
import { useApp } from "../../state/AppContext.jsx";
import { useAcao, useLogs, useModelos, useVistos } from "../../state/hooks.js";
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
    if ("intervalos" in v) return `a cada ${v.intervalos.join("/")} dias`;
    if ("maxDia" in v) return `${fmtMin(v.minDia || 0)} a ${fmtMin(v.maxDia)} por dia`;
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
        const horas = plano.alocacaoSemanal?.[m.materiaId] ?? 0;
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
              {oculta ? <span className="etiqueta">Oculta para o aluno</span> : plano.alunoId ? <span className="num">{fmtMin(horas)} por semana</span> : <span className="num">peso {nomePeso(pesoDe(m))}</span>}
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

/* ---------- Pesos por matéria (rascunho + aplicar de uma vez) ---------- */

/* Seletor segmentado de peso: "1 · Baixa", "2 · Média", "3 · Alta". */
export function SeletorPeso({ valor, aoMudar, desabilitado, rotulo }) {
  return (
    <span className="segmentado" role="radiogroup" aria-label={rotulo}>
      {PESOS.map((p) => (
        <button key={p.id} type="button" role="radio" aria-checked={valor === p.id} disabled={desabilitado}
          title={`${p.descricao} · ${p.efeito.toLowerCase()}`} onClick={() => aoMudar(p.id)}>
          <b className="num">{p.id}</b> · {p.nome}
        </button>
      ))}
    </span>
  );
}

const camposMateria = (m) => ({ peso: pesoDe(m), maxSessao: m.maxSessao || MAX_SESSAO_PADRAO, ritmo: m.ritmo ?? 1, ativa: m.ativa !== false });

/* Divisão prevista da semana pelos pesos (o mesmo cálculo do motor, com o
   bloco mínimo). pendentes: ids com conteúdo pendente (sem ele, todas). */
export function divisaoPrevista(materias, minutosSemana, pendentes) {
  const lista = materias.filter((m) => m.ativa !== false).map((m, pos) => ({
    materiaId: m.materiaId, peso: pesoDe(m), pos, pendente: pendentes ? pendentes.has(m.materiaId) : true,
  }));
  const { minutos, semTempo } = divisaoPorPeso(lista, minutosSemana);
  const total = Object.values(minutos).reduce((s, v) => s + v, 0);
  return { minutos, semTempo, total, pct: (id) => (total ? Math.round(((minutos[id] || 0) / total) * 100) : 0) };
}

/* Cada matéria: se aparece, peso, duração máxima da meta, velocidade e o
   tempo que resulta na semana (com `capacidade` minutos). Muda-se o que
   quiser e aplica tudo junto; aoAplicar(ops) decide se confirma (plano do
   aluno) ou não. jornada: a jornada de origem, para o selo "ajustado neste
   aluno". */
export function TabelaIncidencia({ plano, aoAplicar, ocupado, capacidade, jornada, pendentes, rotuloCapacidade }) {
  const { ind } = useApp();
  const [rascunho, setRascunho] = useState({});
  const materias = (plano.materias || []).filter((m) => ind.materia(m.materiaId));
  // só vale o que ainda difere do plano (depois de aplicar, o rascunho some sozinho)
  const pendentesRasc = Object.fromEntries(materias.map((m) => {
    const orig = camposMateria(m);
    const campos = Object.fromEntries(Object.entries(rascunho[m.materiaId] || {}).filter(([k, x]) => x !== orig[k]));
    return [m.materiaId, campos];
  }).filter(([, c]) => Object.keys(c).length));
  const valor = (m) => ({ ...camposMateria(m), ...(pendentesRasc[m.materiaId] || {}) });
  const mudar = (m, campos) => setRascunho((r) => ({ ...r, [m.materiaId]: { ...(pendentesRasc[m.materiaId] || {}), ...campos } }));
  const ops = Object.entries(pendentesRasc).map(([materiaId, campos]) => ({ tipo: "definirMateria", materiaId, campos }));
  const fora = ind.materias.filter((m) => !plano.materias?.some((x) => x.materiaId === m.id));
  const div = divisaoPrevista(materias.map((m) => ({ materiaId: m.materiaId, ...valor(m) })), capacidade || 0, pendentes);
  const daJornada = (id) => jornada?.materias?.find((x) => x.materiaId === id);
  const ajustado = (m, k) => {
    const j = daJornada(m.materiaId);
    return j && camposMateria(j)[k] !== camposMateria(m)[k];
  };

  return (
    <section className="secao" aria-labelledby="t-incidencia">
      <div className="secao-cabeca">
        <h2 id="t-incidencia" className="subtitulo">Matérias e pesos</h2>
        <p className="previa-linha">
          O tempo de cada matéria sai do peso (1 : 2 : 3) sobre o tempo de estudo da semana, em blocos de 30 min.
          Toda matéria ativa com conteúdo aparece ao menos uma vez na semana. Mude o que quiser e aplique tudo de uma vez.
        </p>
      </div>
      {div.semTempo.length > 0 && (
        <p className="aviso aviso--erro" role="note">
          <AlertTriangle aria-hidden="true" />
          Sem tempo na semana para {div.semTempo.map((id) => ind.nomeMateria(id)).join(", ")}: com {fmtMin(capacidade || 0)} não cabe um bloco de cada matéria ativa.
        </p>
      )}
      <div className="tabela-rolagem">
        <table className="tabela tabela-incidencia tabela--cartoes">
          <thead><tr><th>Matéria</th><th>Ativa</th><th>Peso</th><th>Duração máx. da meta</th><th>Velocidade</th><th className="num">Na semana</th><th className="num">Revisão</th></tr></thead>
          <tbody>
            {materias.map((m) => {
              const x = valor(m);
              const mudou = !!pendentesRasc[m.materiaId];
              const nome = ind.nomeMateria(m.materiaId);
              const min = div.minutos[m.materiaId] || 0;
              const selo = jornada && ["peso", "ativa", "maxSessao", "ritmo"].some((k) => ajustado(m, k));
              return (
                <tr key={m.materiaId} className={`${mudou ? "linha-mudou" : ""}${x.ativa ? "" : " linha-oculta"}`}>
                  <td className="celula-principal">
                    <span className="celula-conteudo">
                      <i className="ponto-materia" style={{ "--cor": ind.corDaMateria(m.materiaId) }} aria-hidden="true" /><strong>{nome}</strong>
                      {mudou && <small className="etiqueta etiqueta--rev">alterada</small>}
                      {selo && !mudou && <small className="etiqueta" title="Diferente da jornada: mudanças da jornada não mexem aqui">ajustado neste aluno</small>}
                    </span>
                  </td>
                  <td data-rotulo="Ativa">
                    <label className="interruptor"><input type="checkbox" checked={x.ativa} onChange={(e) => mudar(m, { ativa: e.target.checked })} aria-label={`${nome} ativa`} /><span>{x.ativa ? "Ativa" : "Inativa"}</span></label>
                  </td>
                  <td data-rotulo="Peso"><SeletorPeso valor={x.peso} desabilitado={!x.ativa} rotulo={`Peso de ${nome}`} aoMudar={(peso) => mudar(m, { peso })} /></td>
                  <td data-rotulo="Meta de até">
                    <select className="entrada entrada--sm" value={x.maxSessao} disabled={!x.ativa} aria-label={`Duração máxima da meta de ${nome}`} onChange={(e) => mudar(m, { maxSessao: Number(e.target.value) })}>
                      {DURACOES_META.map((d) => <option key={d} value={d}>até {fmtMin(d)}</option>)}
                    </select>
                  </td>
                  <td data-rotulo="Velocidade">
                    <select className="entrada entrada--sm" value={x.ritmo} disabled={!x.ativa} aria-label={`Velocidade de ${nome}`} onChange={(e) => mudar(m, { ritmo: Number(e.target.value) })}>
                      {RITMOS.map((r) => <option key={r.id} value={r.multiplicador}>{r.nome}</option>)}
                    </select>
                  </td>
                  <td className="num" data-rotulo="Na semana">{x.ativa ? <>{fmtMin(min)} <small className="bloco-pequeno">{div.pct(m.materiaId)}%</small></> : "—"}</td>
                  <td className="num" data-rotulo="Revisão">{x.ativa ? fmtMin(duracaoRevisao(x.peso)) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="barra-incidencia">
        <span className="num">{rotuloCapacidade || <>Com <b>{fmtMin(capacidade || 0)}</b> por semana</>}</span>
        {fora.length > 0 && <AdicionarSelect rotulo="Incluir matéria" opcoes={fora} aoEscolher={(id) => aoAplicar([{ tipo: "adicionarMateria", materiaId: id }], `Incluir ${ind.nomeMateria(id)}`)} />}
        {ops.length > 0 && <>
          <Botao variante="texto" tamanho="sm" onClick={() => setRascunho({})}>Descartar</Botao>
          <Botao variante="solido" tamanho="sm" disabled={ocupado} onClick={() => aoAplicar(ops, "Matérias e pesos")}>Aplicar {plural(ops.length, "alteração", "alterações")}</Botao>
        </>}
      </div>
    </section>
  );
}

/* ---------- Tempo de estudo por dia, ordem das matérias, regras ---------- */

/* O aluno escolhe o tempo de cada dia de 30 em 30 min, dentro dos limites do
   moderador; embaixo, a divisão resultante entre as matérias (só leitura). */
export function TempoPorDia({ plano, progresso, podeEditar, aoOperar, ocupado }) {
  const { ind } = useApp();
  const lim = limitesDe(plano);
  const [disp, setDisp] = useState(() => Object.fromEntries(DIAS.map((d) => [d.k, Number(plano.disponibilidade?.[d.k]) || 0])));
  const total = DIAS.reduce((s, d) => s + disp[d.k], 0);
  const minimo = minimoSemanal(plano, ind, progresso);
  const mudou = DIAS.some((d) => disp[d.k] !== (Number(plano.disponibilidade?.[d.k]) || 0));
  const erros = validarDisponibilidade(disp, lim, minimo);
  const itens = itensDoPlano(plano, ind);
  const pendentes = new Set(itens.filter((it) => !estadoItem(it, progresso || {}).concluido).map((it) => it.materiaId));
  const div = divisaoPrevista((plano.materias || []).filter((m) => ind.materia(m.materiaId)), total, pendentes);
  const passo = (k, delta) => setDisp((x) => ({ ...x, [k]: Math.min(lim.maxDia, Math.max(lim.minDia, x[k] + delta)) }));
  return (
    <section className="form" aria-labelledby="t-horas">
      <h3 id="t-horas" className="subtitulo subtitulo--sm"><Clock4 aria-hidden="true" /> Tempo de estudo por dia</h3>
      <p className="previa-linha">De 30 em 30 min, entre {lim.minDia ? fmtMin(lim.minDia) : "0"} e {fmtMin(lim.maxDia)} por dia. Zero é dia de folga.</p>
      <div className="grade-dias grade-dias--passos">
        {DIAS.map((d) => (
          <div key={d.k} className="campo campo--dia">
            <span>{d.nome.slice(0, 3)}</span>
            <span className="passo">
              <button type="button" className="icone-btn" aria-label={`Menos 30 min na ${d.nome}`} disabled={!podeEditar || disp[d.k] <= lim.minDia} onClick={() => passo(d.k, -BLOCO_MIN)}><Minus /></button>
              <b className="num" aria-live="polite">{disp[d.k] ? fmtMin(disp[d.k]) : "folga"}</b>
              <button type="button" className="icone-btn" aria-label={`Mais 30 min na ${d.nome}`} disabled={!podeEditar || disp[d.k] >= lim.maxDia} onClick={() => passo(d.k, BLOCO_MIN)}><Plus /></button>
            </span>
          </div>
        ))}
      </div>
      <p className="num">Total: <b>{fmtMin(total)}</b> por semana · mínimo {fmtMin(minimo)}</p>
      {erros.disponibilidade && <p className="aviso aviso--erro" role="alert"><AlertTriangle aria-hidden="true" />{erros.disponibilidade}.</p>}
      <div className="divisao-materias" aria-label="Divisão entre as matérias">
        <small className="previa-linha">A divisão entre as matérias é definida pelo seu mentor.</small>
        <ul>
          {(plano.materias || []).filter((m) => m.ativa !== false && ind.materia(m.materiaId) && (div.minutos[m.materiaId] || 0) > 0).map((m) => (
            <li key={m.materiaId}><i className="ponto-materia" style={{ "--cor": ind.corDaMateria(m.materiaId) }} aria-hidden="true" />{ind.nomeMateria(m.materiaId)}<span className="num">{fmtMin(div.minutos[m.materiaId])} · {div.pct(m.materiaId)}%</span></li>
          ))}
        </ul>
      </div>
      {podeEditar && (
        <Botao variante="solido" tamanho="sm" disabled={!mudou || ocupado || Object.keys(erros).length > 0}
          onClick={() => aoOperar({ tipo: "definirPlano", campos: { disponibilidade: disp } }, "Mudar o tempo de estudo")}>Salvar tempo</Botao>
      )}
    </section>
  );
}

/* Ordem das matérias no dia: setas (toque e teclado) ou arrastar. */
export function OrdemMaterias({ plano, aoOperar, ocupado }) {
  const { ind } = useApp();
  const ativas = (plano.materias || []).filter((m) => m.ativa !== false && ind.materia(m.materiaId)).map((m) => m.materiaId);
  const inicial = () => {
    const ordem = (plano.ordemMaterias || []).filter((id) => ativas.includes(id));
    return [...ordem, ...ativas.filter((id) => !ordem.includes(id))];
  };
  const [lista, setLista] = useState(inicial);
  const [arrastando, setArrastando] = useState(null);
  const mover = (i, j) => setLista((l) => { if (j < 0 || j >= l.length) return l; const n = [...l]; const [x] = n.splice(i, 1); n.splice(j, 0, x); return n; });
  const mudou = JSON.stringify(lista) !== JSON.stringify(inicial());
  return (
    <section className="form" aria-labelledby="t-ordem">
      <h3 id="t-ordem" className="subtitulo subtitulo--sm"><ArrowDown aria-hidden="true" /> Ordem das matérias no dia</h3>
      <p className="previa-linha">As revisões vêm primeiro; depois as matérias nesta ordem. Os minutos de cada uma não mudam.</p>
      <ol className="lista-ordem">
        {lista.map((id, i) => (
          <li key={id} draggable onDragStart={() => setArrastando(i)} onDragOver={(e) => e.preventDefault()}
            onDrop={() => { if (arrastando != null) mover(arrastando, i); setArrastando(null); }} className={arrastando === i ? "arrastando" : ""}>
            <span className="num">{i + 1}</span>
            <i className="ponto-materia" style={{ "--cor": ind.corDaMateria(id) }} aria-hidden="true" />
            <strong>{ind.nomeMateria(id)}</strong>
            <span className="linha-acoes">
              <button type="button" className="icone-btn" aria-label={`Subir ${ind.nomeMateria(id)}`} disabled={i === 0} onClick={() => mover(i, i - 1)}><ArrowUp /></button>
              <button type="button" className="icone-btn" aria-label={`Descer ${ind.nomeMateria(id)}`} disabled={i === lista.length - 1} onClick={() => mover(i, i + 1)}><ArrowDown /></button>
            </span>
          </li>
        ))}
      </ol>
      <Botao variante="solido" tamanho="sm" disabled={!mudou || ocupado} onClick={() => aoOperar({ tipo: "definirPlano", campos: { ordemMaterias: lista } }, "Mudar a ordem das matérias")}>Salvar ordem</Botao>
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

function LimitesTempo({ plano, aoOperar, ocupado }) {
  const atual = limitesDe(plano);
  const [lim, setLim] = useState(atual);
  const opcoes = passosDeTempo(0, deBlocos(24));
  const erros = validarLimites(lim);
  return (
    <section className="form" aria-labelledby="t-limites">
      <h3 id="t-limites" className="subtitulo subtitulo--sm"><Clock4 aria-hidden="true" /> Tempo de estudo que o aluno pode escolher</h3>
      <div className="form-linha">
        <Campo rotulo="Mínimo por dia" erro={erros.minDia}>
          <select className="entrada" value={lim.minDia} onChange={(e) => setLim({ ...lim, minDia: Number(e.target.value) })}>{opcoes.map((v) => <option key={v} value={v}>{v ? fmtMin(v) : "0 (folga)"}</option>)}</select>
        </Campo>
        <Campo rotulo="Máximo por dia" erro={erros.maxDia}>
          <select className="entrada" value={lim.maxDia} onChange={(e) => setLim({ ...lim, maxDia: Number(e.target.value) })}>{opcoes.filter((v) => v > 0).map((v) => <option key={v} value={v}>{fmtMin(v)}</option>)}</select>
        </Campo>
      </div>
      <Botao variante="vidro" tamanho="sm" disabled={ocupado || Object.keys(erros).length > 0 || (lim.minDia === atual.minDia && lim.maxDia === atual.maxDia)}
        onClick={() => aoOperar({ tipo: "definirPlano", campos: { limitesTempo: lim } }, "Mudar os limites de tempo")}>Salvar limites</Botao>
    </section>
  );
}

export function Organizacao({ plano, progresso, pode = {}, aoOperar, ocupado, modelo = false }) {
  const [dataAlvo, setDataAlvo] = useState(plano.dataAlvo || "");
  const [intervalosTxt, setIntervalosTxt] = useState(() => (plano.revisao?.intervalos || [7, 15, 30]).join(", "));
  const [perm, setPerm] = useState(() => ({ ...PERMISSOES_PADRAO, ...(plano.permissoesAluno || {}) }));
  const intervalos = intervalosTxt.split(/[,\s]+/).map(Number).filter((n) => Number.isInteger(n) && n > 0);

  return (
    <div className="grade-organizacao">
      {!modelo && <section className="cartao"><TempoPorDia plano={plano} progresso={progresso} podeEditar={pode.disponibilidade} aoOperar={aoOperar} ocupado={ocupado} /></section>}
      {pode.limites && <section className="cartao"><LimitesTempo plano={plano} aoOperar={aoOperar} ocupado={ocupado} /></section>}

      <section className="cartao form" aria-labelledby="t-ritmo">
        <h3 id="t-ritmo" className="subtitulo subtitulo--sm"><RefreshCw aria-hidden="true" /> Ritmo e prazo</h3>
        <RitmoDoPlano plano={plano} podeEditar={pode.ritmo} aoOperar={aoOperar} ocupado={ocupado} />
        <Campo rotulo="Data-alvo" ajuda={pode.prazo ? "Com data-alvo, o edital mostra as matérias que não terminam a tempo; os pesos não mudam sozinhos." : "Definida pelo professor."}>
          <span className="linha-entrada">
            <input className="entrada" type="date" value={dataAlvo} disabled={!pode.prazo} onChange={(e) => setDataAlvo(e.target.value)} />
            {pode.prazo && <Botao variante="vidro" tamanho="sm" disabled={(dataAlvo || null) === (plano.dataAlvo || null) || ocupado} onClick={() => aoOperar({ tipo: "definirPlano", campos: { dataAlvo: dataAlvo || null } }, "Mudar a data-alvo")}>Salvar</Botao>}
          </span>
        </Campo>
      </section>

      <section className="cartao form" aria-labelledby="t-rev">
        <h3 id="t-rev" className="subtitulo subtitulo--sm"><RotateCcw aria-hidden="true" /> Revisões espaçadas</h3>
        <Campo rotulo="Dias depois de cortar" ajuda="Separados por vírgula."><input className="entrada num" value={intervalosTxt} disabled={!pode.revisao} onChange={(e) => setIntervalosTxt(e.target.value)} /></Campo>
        <p className="previa-linha">Revisões: 30 min para matérias de peso 1 e 60 min para peso 2 ou 3.</p>
        {pode.revisao && <Botao variante="vidro" tamanho="sm" disabled={!intervalos.length || ocupado} onClick={() => aoOperar({ tipo: "definirPlano", campos: { revisao: { intervalos } } }, "Mudar as revisões")}>Salvar revisões</Botao>}
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
          <Botao variante="vidro" tamanho="sm" disabled={JSON.stringify(perm) === JSON.stringify({ ...PERMISSOES_PADRAO, ...(plano.permissoesAluno || {}) }) || ocupado}
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
      disponibilidade: true, ritmo: true, prazo: true, revisao: true, permissoes: true, limites: true, ordemMaterias: true }
    : { reordenar: !!perm.reordenar, cortar: !!perm.concluirItens, vistos: !!perm.concluirItens, recalcular: !!perm.recalcular,
      disponibilidade: !!perm.disponibilidade, ritmo: !!perm.ritmo, ordemMaterias: !!perm.ordemMaterias };
  const modelos = useModelos(moderador);
  const jornada = modelos?.find((m) => m.id === v.plano.modeloId);
  const pendentes = new Set(v.itens.filter((it) => !v.estado(it).concluido).map((it) => it.materiaId));

  // tirar conteúdo e mexer na incidência passam pela prévia; ordem, inclusão e tempo vão direto (com log)
  const operar = (op, titulo) => (REMOCOES.includes(op.tipo) ? confirmada : direta).propor(op, titulo);
  const ocupado = acao.ocupado || confirmada.ocupado || direta.ocupado;
  const materiaVisivel = aberta && v.plano.materias.find((m) => m.materiaId === aberta && (moderador || m.ativa !== false));
  const mostrarRecalcular = pode.recalcular && (moderador || v.atrasos.quantidade > 0);

  return (
    <>
      <ResumoEdital v={v} acoes={<>
        {!moderador && (pode.disponibilidade || pode.ritmo || pode.ordemMaterias) && <Botao variante="vidro" tamanho="sm" icone={Clock4} onClick={() => setRotina(true)}>Minha rotina</Botao>}
        {mostrarRecalcular && <Botao variante={v.atrasos.quantidade ? "solido" : "vidro"} tamanho="sm" icone={RefreshCw} disabled={ocupado} onClick={() => setRecalc(true)}>Recalcular</Botao>}
      </>} />
      <MensagemErro erro={acao.erro || direta.erro} />

      {moderador && (
        <TabelaIncidencia plano={v.plano} capacidade={capacidadeSemanal(v.plano.disponibilidade)} jornada={jornada} pendentes={pendentes} ocupado={ocupado}
          rotuloCapacidade={<>Com o tempo deste aluno: <b>{fmtMin(capacidadeSemanal(v.plano.disponibilidade))}</b> por semana</>}
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
          <summary>Rotina e regras deste aluno <small>tempo por dia e limites, velocidade, data-alvo, revisões e permissões</small></summary>
          <Organizacao plano={v.plano} progresso={v.progresso} pode={pode} aoOperar={(op, titulo) => confirmada.propor(op, titulo)} ocupado={ocupado} />
        </details>
      ) : (
        <p className="rodape-edital"><Botao variante="texto" tamanho="sm" icone={History} onClick={() => setHistorico(true)}>Histórico de alterações</Botao></p>
      )}

      {confirmada.dialogo}
      {direta.dialogo}
      {rotina && (
        <Dialogo aberto titulo="Minha rotina" largura={560} aoFechar={() => setRotina(false)}>
          <div className="form">
            {pode.disponibilidade && <TempoPorDia plano={v.plano} progresso={v.progresso} podeEditar aoOperar={(op, t) => { setRotina(false); confirmada.propor(op, t); }} ocupado={ocupado} />}
            {pode.ordemMaterias && <OrdemMaterias plano={v.plano} aoOperar={(op, t) => { setRotina(false); direta.propor(op, t); }} ocupado={ocupado} />}
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
          O que falta é redistribuído a partir de hoje, considerando o tempo de estudo de cada dia, a velocidade e o peso de cada matéria{v.plano.dataAlvo ? " e a data-alvo" : ""}.
          O que já foi cortado e o histórico de estudo continuam iguais. A semana atual é refeita de hoje em diante.
        </p>
      </Confirmar>
    </>
  );
}
