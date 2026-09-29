import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  AlertTriangle, BellRing, BookOpen, CalendarCheck, Check, CheckCircle2, Clock4, FileQuestion, Flame, ListChecks, PenLine, RefreshCw, Target, Zap,
} from "lucide-react";
import { DIAS, fmtMin } from "../../core/nucleo.js";
import { useApp } from "../../state/AppContext.jsx";
import { errosDeCampo, useAcao, useDevolutivas, useEu, useFrases, useNotificacoes } from "../../state/hooks.js";
import { useVisaoAluno } from "../../state/aluno.js";
import { NomeConteudo, SeletorConteudo } from "../../ui/Conteudo.jsx";
import { Barra, Botao, Campo, Carregando, Dialogo, Frase, MensagemErro, Vazio } from "../../ui/ui.jsx";
import { QuadroSemana } from "./Semana.jsx";
import { TEMPO_EXTRA } from "../../core/blocos.js";

/* "Preciso de mais tempo": 30, 60, 90 ou 120 min (blocos de 30). */
function EscolhaTempoExtra({ valor, aoMudar }) {
  return (
    <span className="segmentado" role="radiogroup" aria-label="Tempo a mais">
      {TEMPO_EXTRA.map((m) => <button key={m} type="button" role="radio" aria-checked={valor === m} onClick={() => aoMudar(m)}>{fmtMin(m)}</button>)}
    </span>
  );
}
import { FormQuestoes } from "../comum/Registros.jsx";
import { AvisoLinha, LerAviso } from "./Avisos.jsx";

// "na terça", "no sábado"
const noDia = (nome) => `${/^(Sábado|Domingo)$/.test(nome) ? "no" : "na"} ${nome.toLowerCase()}`;

export function MetaLinha({ meta, atrasada, aoAlternar, ocupado, somenteLeitura }) {
  const { ind } = useApp();
  const revisao = meta.tipo === "revisao";
  const nomeMateria = ind?.nomeMateria(meta.materiaId);
  return (
    <div className={`meta${atrasada ? " meta--atrasada" : ""}${meta.done ? " meta--feita" : ""}`}>
      <button type="button" className="check" aria-pressed={!!meta.done} disabled={ocupado || somenteLeitura} onClick={() => aoAlternar?.(meta)}
        aria-label={`${meta.done ? "Desmarcar" : "Concluir"} ${nomeMateria}, ${fmtMin(meta.minutos)}`}>
        {meta.done && <Check aria-hidden="true" />}
      </button>
      <div style={{ minWidth: 0 }}>
        <div className="meta-materia">
          <i style={{ "--cor": revisao ? "var(--rev)" : ind?.corDaMateria(meta.materiaId) }} aria-hidden="true" />
          <span>{nomeMateria}</span>
          {revisao && <span className="etiqueta etiqueta--rev">Revisão</span>}
          {atrasada && !meta.done && <span className="etiqueta etiqueta--perigo">Atrasada · {meta.origem}</span>}
          {meta.extra && <span className="etiqueta">Tempo extra</span>}
        </div>
        <div className="meta-topico">
          {meta.topicoId ? <NomeConteudo topicoId={meta.topicoId} subtopicoId={meta.subtopicoId} semMateria /> : "Conteúdo concluído na matéria: revise ou adiante"}
        </div>
      </div>
      <span className="meta-min">{fmtMin(meta.minutos)}</span>
    </div>
  );
}

/* Depois de fechar a última meta do dia numa matéria: como está o conteúdo? */
function ComoEstaConteudo({ popup, fechar, plano, alunoId }) {
  const { s, ind } = useApp();
  const [etapa, setEtapa] = useState("pergunta");
  const [minutos, setMinutos] = useState(30);
  const [retorno, setRetorno] = useState("");
  const { executar, ocupado, erro } = useAcao();
  const sair = () => { setEtapa("pergunta"); setRetorno(""); fechar(); };
  const podeConcluir = plano?.permissoesAluno?.concluirItens;
  if (!popup) return null;
  const nome = ind?.nomeTopico(popup.topicoId) + (popup.subtopicoId ? ` · ${ind.nomeSubtopico(popup.subtopicoId)}` : "");

  return (
    <Dialogo aberto={!!popup} aoFechar={sair} titulo="Meta concluída" largura={440}>
      <div className="form">
        {retorno ? (
          <>
            <p className="retorno" role="status">{retorno}</p>
            <Botao variante="vidro" onClick={sair}>Fechar</Botao>
          </>
        ) : etapa === "pergunta" ? (
          <>
            <p className="texto-dialogo">Você fechou o tempo de <strong>{nome}</strong> por hoje. Como está esse conteúdo?</p>
            {podeConcluir && (
              <Botao variante="solido" tamanho="lg" icone={Check} disabled={ocupado} onClick={() => executar(async () => {
                await s.planos.concluirItem(alunoId, popup.itemId);
                setRetorno("Tópico cortado. As revisões foram agendadas e as próximas metas seguem para o tópico seguinte.");
              })}>Estou dominando: concluir</Botao>
            )}
            <Botao variante="vidro" tamanho="lg" icone={Clock4} onClick={() => setEtapa("tempo")}>Preciso de mais tempo</Botao>
            <Botao variante="texto" onClick={sair}>Seguir o plano normal</Botao>
          </>
        ) : (
          <>
            <Campo rotulo="Tempo a mais" ajuda="Entra como uma meta extra no próximo dia com mais folga nesta semana.">
              <EscolhaTempoExtra valor={minutos} aoMudar={setMinutos} />
            </Campo>
            <Botao variante="solido" disabled={ocupado} onClick={() => executar(async () => {
              const dia = await s.estudo.tempoExtra(alunoId, { materiaId: popup.materiaId, topicoId: popup.topicoId, subtopicoId: popup.subtopicoId, itemId: popup.itemId, minutos });
              setRetorno(`Adicionamos ${fmtMin(minutos)} ${noDia(dia.nome)}.`);
            })}>Adicionar {fmtMin(minutos || 0)}</Botao>
          </>
        )}
        <MensagemErro erro={erro} />
      </div>
    </Dialogo>
  );
}

function Replanejar({ aberto, fechar, alunoId, disp }) {
  const { s, ind } = useApp();
  const [previa, setPrevia] = useState(null);
  const { executar, ocupado, erro } = useAcao();
  useEffect(() => {
    if (aberto) executar(async () => setPrevia(await s.estudo.previaReplanejamento(alunoId)));
  }, [aberto, alunoId, s, executar]);
  const porDia = useMemo(() => {
    if (!previa) return [];
    return DIAS.map((d) => {
      const metas = previa.semana[d.k] || [];
      const novas = metas.filter((m) => m.replanejada);
      return novas.length ? { ...d, novas, total: metas.reduce((x, m) => x + m.minutos, 0), teto: disp?.[d.k] || 0 } : null;
    }).filter(Boolean);
  }, [previa, disp]);

  return (
    <Dialogo aberto={aberto} aoFechar={() => { setPrevia(null); fechar(); }} titulo="Replanejar a semana" largura={540}>
      <div className="form">
        {!previa && !erro && <Carregando texto="Calculando…" />}
        <MensagemErro erro={erro} />
        {previa && (
          <>
            <p className="texto-dialogo">
              O resto da semana é <strong>recalculado a partir do seu plano</strong>. As pendências entram primeiro, sempre dentro do seu tempo de estudo de cada dia e em blocos de 30 min.
              O que você já concluiu fica como está.
            </p>
            <div className="replan-resumo">
              <div><strong className="num">{fmtMin(previa.resumo.totalRealocado)}</strong><span>tempo replanejado</span></div>
              <div><strong className="num">{previa.resumo.qtdPendencias}</strong><span>{previa.resumo.qtdPendencias === 1 ? "pendência" : "pendências"}</span></div>
            </div>
            {previa.resumo.minutosSemEspaco > 0 && (
              <p className="aviso" role="note">
                {fmtMin(previa.resumo.minutosSemEspaco)} de pendências não cabem no que resta da semana
                ({previa.resumo.naoCouberam.map((x) => ind?.nomeMateria(x.materiaId)).join(", ")}). Continuam como atrasadas.
              </p>
            )}
            <div className="replan-dias">
              {porDia.length === 0 && <p className="texto-dialogo">Nada novo para distribuir: você está em dia.</p>}
              {porDia.map((dia) => (
                <div key={dia.k} className="replan-dia">
                  <header>{dia.nome}<span className={dia.total <= dia.teto ? "ok" : "estourou"}>{fmtMin(dia.total)} / {fmtMin(dia.teto)}</span></header>
                  {dia.novas.map((m) => (
                    <p key={m.id}><span>{ind?.nomeMateria(m.materiaId)} · {ind?.nomeTopico(m.topicoId)}</span><span className="num">{fmtMin(m.minutos)}</span></p>
                  ))}
                </div>
              ))}
            </div>
            <div className="dialogo-acoes">
              <Botao variante="vidro" onClick={() => { setPrevia(null); fechar(); }}>Cancelar</Botao>
              <Botao variante="solido" icone={Check} disabled={ocupado} onClick={() => executar(async () => {
                await s.estudo.aplicarReplanejamento(alunoId, previa);
                setPrevia(null);
                fechar();
              })}>Confirmar</Botao>
            </div>
          </>
        )}
      </div>
    </Dialogo>
  );
}

const ABAS_ESTUDO = [
  { k: "fora", label: "Estudei por fora", icone: BookOpen },
  { k: "concluido", label: "Cortei um tópico", icone: Zap },
  { k: "mais", label: "Preciso de mais tempo", icone: Clock4 },
];

function RegistrarEstudo({ aberto, fechar, v }) {
  const { s, ind, hoje } = useApp();
  const [aba, setAba] = useState("fora");
  const [sel, setSel] = useState({ materiaId: "", topicoId: "", subtopicoId: "" });
  const [minutos, setMinutos] = useState(30);
  const [data, setData] = useState(hoje);
  const [itemId, setItemId] = useState("");
  const [retorno, setRetorno] = useState("");
  const { executar, ocupado, erro, limparErro } = useAcao();
  const erros = errosDeCampo(erro);
  const plano = v.plano;
  const podeConcluir = plano?.permissoesAluno?.concluirItens;
  const pendentes = (v.itens || []).filter((it) => !v.estado(it).concluido);
  const materiasDoPlano = (plano?.materias || []).map((m) => m.materiaId);
  const sair = () => { setRetorno(""); setSel({ materiaId: "", topicoId: "", subtopicoId: "" }); setItemId(""); limparErro(); fechar(); };

  const salvar = () => executar(async () => {
    if (aba === "fora") {
      const r = await s.estudo.registrarEstudoFora(v.aluno.id, { ...sel, minutos, data });
      setRetorno(`Registrado: ${fmtMin(minutos)} de estudo.${r.concluidos.length ? " Um conteúdo foi concluído e as revisões foram agendadas." : ""}`);
    } else if (aba === "concluido") {
      await s.planos.concluirItem(v.aluno.id, itemId);
      setRetorno("Tópico cortado. As revisões foram agendadas e as próximas metas seguem para o tópico seguinte.");
    } else {
      const it = v.daVez(sel.materiaId);
      const dia = await s.estudo.tempoExtra(v.aluno.id, { materiaId: sel.materiaId, topicoId: sel.topicoId || it?.topicoId, subtopicoId: sel.subtopicoId || it?.subtopicoId, minutos });
      setRetorno(`Adicionamos ${fmtMin(minutos)} ${noDia(dia.nome)}.`);
    }
  });

  return (
    <Dialogo aberto={aberto} aoFechar={sair} titulo="Registrar estudo" largura={520}>
      {retorno ? (
        <div className="form">
          <p className="retorno" role="status">{retorno}</p>
          <div className="dialogo-acoes">
            <Botao variante="vidro" onClick={() => setRetorno("")}>Registrar outro</Botao>
            <Botao variante="solido" onClick={sair}>Fechar</Botao>
          </div>
        </div>
      ) : (
        <div className="form">
          <div className="abas" role="tablist">
            {ABAS_ESTUDO.filter((t) => t.k !== "concluido" || podeConcluir).map((t) => (
              <button key={t.k} type="button" role="tab" aria-selected={aba === t.k} onClick={() => { setAba(t.k); limparErro(); }}>
                <t.icone aria-hidden="true" />{t.label}
              </button>
            ))}
          </div>
          <p className="texto-dialogo">
            {aba === "fora" && "Estudo feito fora das metas. Soma no conteúdo escolhido (ou no da vez da matéria) e entra no histórico."}
            {aba === "concluido" && "Já domina um tópico? Corte-o do edital: as revisões são agendadas e as metas seguem para o próximo."}
            {aba === "mais" && "Precisa de mais tempo num conteúdo? Vira uma meta extra no próximo dia com folga nesta semana."}
          </p>
          {aba === "concluido" ? (
            <Campo rotulo="Tópico" erro={erros.itemId}>
              <select className="entrada" value={itemId} onChange={(e) => setItemId(e.target.value)}>
                <option value="">Selecione…</option>
                {materiasDoPlano.map((mid) => {
                  const lista = pendentes.filter((it) => it.materiaId === mid);
                  if (!lista.length) return null;
                  return (
                    <optgroup key={mid} label={ind?.nomeMateria(mid)}>
                      {lista.map((it) => <option key={it.itemId} value={it.itemId}>{ind?.nomeTopico(it.topicoId)}{it.subtopicoId ? ` · ${ind.nomeSubtopico(it.subtopicoId)}` : ""}</option>)}
                    </optgroup>
                  );
                })}
              </select>
            </Campo>
          ) : (
            <>
              <SeletorConteudo valor={sel} aoMudar={setSel} erros={erros} obrigatorio={{ materia: true }} materias={aba === "mais" ? materiasDoPlano : undefined} />
              <div className="form-linha">
                <Campo rotulo={aba === "fora" ? "Tempo estudado (min)" : "Tempo a mais"} erro={erros.minutos}>
                  {aba === "fora"
                    ? <input className="entrada num" type="number" min="5" step="5" value={minutos} onChange={(e) => setMinutos(+e.target.value)} />
                    : <EscolhaTempoExtra valor={TEMPO_EXTRA.includes(minutos) ? minutos : null} aoMudar={setMinutos} />}
                </Campo>
                {aba === "fora" && <Campo rotulo="Quando" erro={erros.data}><input className="entrada" type="date" max={hoje} value={data} onChange={(e) => setData(e.target.value)} /></Campo>}
              </div>
            </>
          )}
          {!Object.keys(erros).length && <MensagemErro erro={erro} />}
          <Botao variante="solido" bloco disabled={ocupado || (aba === "concluido" ? !itemId : !sel.materiaId)} onClick={salvar}>{ocupado ? "Salvando…" : "Salvar"}</Botao>
        </div>
      )}
    </Dialogo>
  );
}

const VISOES = [["hoje", "Hoje"], ["semana", "Semana"]];

/* Dashboard: o dia (metas, atrasadas, registro rápido) ou a semana inteira. */
export default function Inicio() {
  const { s } = useApp();
  const eu = useEu();
  const v = useVisaoAluno(eu.id);
  const t = useFrases(v.aluno || eu);
  const avisos = useNotificacoes(eu.id) || [];
  const devolutivas = useDevolutivas(eu.id) || [];
  const [params, setParams] = useSearchParams();
  const visao = params.get("ver") === "semana" ? "semana" : "hoje";
  const [popup, setPopup] = useState(null);
  const [replan, setReplan] = useState(false);
  const [estudo, setEstudo] = useState(false);
  const [questoes, setQuestoes] = useState(false);
  const [retornoQuestoes, setRetornoQuestoes] = useState("");
  const [aviso, setAviso] = useState(null);
  const { executar, ocupado, erro } = useAcao();

  if (v.carregando) return <Carregando />;
  const novos = avisos.filter((n) => !n.lidaEm);
  const redacoesNovas = devolutivas.filter((d) => !d.lida).length;
  const dataHoje = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  const atrasadasAbertas = v.atrasadas.filter((m) => !m.done).length;
  const pct = v.totalHoje ? Math.round((v.feitasHoje / v.totalHoje) * 100) : 0;
  const vest = v.ind.vestibular(v.aluno?.vestibularId);
  const c30 = v.consistencia30;

  const alternar = (meta) => executar(async () => {
    const r = await s.estudo.alternarMeta(eu.id, meta.id);
    if (!r.feita || meta.tipo === "revisao") return;
    if (r.concluidos.length) {
      setPopup(null);
      return;
    }
    const aindaHoje = [...v.metasHoje, ...v.atrasadas].some((m) => m.id !== meta.id && !m.done && m.materiaId === meta.materiaId);
    if (!aindaHoje && meta.itemId) setTimeout(() => setPopup({ ...meta }), 300);
  });

  return (
    <>
      <section className="cartao saudacao" aria-label="Seu resumo">
        <div className="saudacao-quem">
          <span className="saudacao-avatar" aria-hidden="true">{(v.aluno?.nome || eu.nome || "?").charAt(0)}</span>
          <div>
            <h1><Frase texto={t("painel.dashboard.saudacao")} /></h1>
            <p>{dataHoje}{vest ? ` · ${vest.nome}` : ""}</p>
          </div>
        </div>
        <ul className="saudacao-numeros">
          <li style={{ "--cor-numero": "#1f3d73" }}><span className="saudacao-icone"><CalendarCheck aria-hidden="true" /></span><b className="num">{c30.diasEstudados}</b><small>dias estudados nos últimos 30</small></li>
          <li style={{ "--cor-numero": "#e2761b" }}><span className="saudacao-icone"><Flame aria-hidden="true" /></span><b className="num">{c30.sequenciaAtual}</b><small>{c30.sequenciaAtual === 1 ? "dia seguido" : "dias seguidos"}</small></li>
          <li style={{ "--cor-numero": "#1e8f63" }}><span className="saudacao-icone"><Target aria-hidden="true" /></span><b className="num">{v.progressoPlano ? `${String(v.progressoPlano.pct).replace(".", ",")}%` : "–"}</b><small>do edital</small></li>
        </ul>
      </section>

      <div className="barra-dia">
        <div className="filtros filtros--compacto" role="tablist" aria-label="Ver">
          {VISOES.map(([k, nome]) => (
            <button key={k} type="button" role="tab" className="filtro" aria-selected={visao === k} onClick={() => setParams(k === "hoje" ? {} : { ver: k }, { replace: true })}>{nome}</button>
          ))}
        </div>
        {visao === "hoje" && v.totalHoje > 0 && (
          <div className="progresso-dia">
            <div className="num">{v.feitasHoje} de {v.totalHoje} metas de hoje</div>
            <Barra valor={pct} />
          </div>
        )}
      </div>

      {novos.length > 0 && (
        <section className="secao avisos-novos" aria-label="Avisos novos">
          <span className="eyebrow"><BellRing aria-hidden="true" /> {novos.length === 1 ? "Aviso novo" : `${novos.length} avisos novos`}</span>
          {novos.slice(0, 3).map((n) => <AvisoLinha key={n.id} aviso={n} aoAbrir={() => setAviso(n)} />)}
          {novos.length > 3 && <Link to="/aluno/avisos" className="btn btn--texto btn--sm">Ver todos</Link>}
        </section>
      )}

      {redacoesNovas > 0 && (
        <div className="aviso">
          <PenLine aria-hidden="true" />
          {redacoesNovas === 1 ? "Sua redação foi corrigida." : `${redacoesNovas} redações corrigidas esperando você.`}
          <Link className="btn btn--solido btn--sm" to="/aluno/redacao">Ver a correção</Link>
        </div>
      )}

      {visao === "semana" ? <QuadroSemana v={v} texto={t("painel.semana.texto")} /> : v.plano === null ? (
        <div className="cartao"><Vazio icone={ListChecks} titulo="Seu edital ainda não foi montado" texto="Assim que o professor aplicar a sua jornada, as metas de cada dia aparecem aqui." /></div>
      ) : (
        <>
          <div className="faixa">
            <span>
              Hoje: <b className="num">{fmtMin(v.minutosHoje)}</b> estudados{v.questoesHoje ? <>, <b className="num">{v.questoesHoje}</b> questões</> : null}
            </span>
            {v.atrasos?.quantidade > 0 && (
              <Link to="/aluno/edital" className="faixa-atraso"><AlertTriangle aria-hidden="true" />{v.atrasos.quantidade} {v.atrasos.quantidade === 1 ? "tópico atrasado" : "tópicos atrasados"}</Link>
            )}
            <Botao variante={atrasadasAbertas ? "solido" : "vidro"} tamanho="sm" icone={RefreshCw} onClick={() => setReplan(true)}>Replanejar</Botao>
          </div>
          <MensagemErro erro={erro} />

          {v.atrasadas.length > 0 && (
            <section className="secao" aria-label="Metas atrasadas">
              <span className="eyebrow perigo">Metas atrasadas</span>
              {v.atrasadas.map((m) => <MetaLinha key={m.id} meta={m} atrasada aoAlternar={alternar} ocupado={ocupado} />)}
            </section>
          )}

          <section className="secao" aria-label="Metas de hoje">
            {v.atrasadas.length > 0 && <span className="eyebrow">Hoje</span>}
            {v.metasHoje.map((m) => <MetaLinha key={m.id} meta={m} aoAlternar={alternar} ocupado={ocupado} />)}
            {v.metasHoje.length === 0 && (
              <div className="cartao"><Vazio icone={CheckCircle2} titulo={t("painel.dashboard.vazioTitulo")} texto={t("painel.dashboard.vazioTexto")} /></div>
            )}
          </section>

          <div className="acoes-painel">
            <Botao variante="vidro" icone={FileQuestion} onClick={() => setQuestoes(true)}>Registrar questões</Botao>
            <Botao variante="vidro" icone={BookOpen} onClick={() => setEstudo(true)}>Registrar estudo</Botao>
          </div>
        </>
      )}

      <ComoEstaConteudo popup={popup} fechar={() => setPopup(null)} plano={v.plano} alunoId={eu.id} />
      {replan && <Replanejar aberto={replan} fechar={() => setReplan(false)} alunoId={eu.id} disp={v.plano?.disponibilidade} />}
      {estudo && <RegistrarEstudo aberto={estudo} fechar={() => setEstudo(false)} v={v} />}
      <Dialogo aberto={questoes} aoFechar={() => { setQuestoes(false); setRetornoQuestoes(""); }} titulo="Registrar questões" largura={520}>
        {questoes && (retornoQuestoes ? (
          <div className="form">
            <p className="retorno" role="status">{retornoQuestoes}</p>
            <div className="dialogo-acoes">
              <Botao variante="vidro" onClick={() => setRetornoQuestoes("")}>Registrar outro bloco</Botao>
              <Botao variante="solido" onClick={() => { setQuestoes(false); setRetornoQuestoes(""); }}>Fechar</Botao>
            </div>
          </div>
        ) : <FormQuestoes alunoId={eu.id} aoConcluir={setRetornoQuestoes} aoCancelar={() => setQuestoes(false)} />)}
      </Dialogo>
      <LerAviso aviso={aviso} aoFechar={() => setAviso(null)} />
    </>
  );
}
