import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft, BookOpen, ClipboardList, History, LayoutDashboard, ListChecks, PenLine, Replace, TrendingUp, Trash2, UserCog,
} from "lucide-react";
import { useApp } from "../../state/AppContext.jsx";
import { errosDeCampo, useAcao, useModelos, usePlanosAnteriores } from "../../state/hooks.js";
import { useVisaoAluno } from "../../state/aluno.js";
import { fmtMin } from "../../core/nucleo.js";
import { fmtDataCurta, fmtDataLonga } from "../../core/datas.js";
import { metricasAluno } from "../../services/desempenho.js";
import { fmtPct } from "../../core/desempenho.js";
import { CalendarioDias } from "../../ui/Graficos.jsx";
import { NomeConteudo, PontoMateria } from "../../ui/Conteudo.jsx";
import { Abas, Botao, Campo, Carregando, Confirmar, MensagemErro, Tile, Vazio } from "../../ui/ui.jsx";
import { EditalDoAluno, Historico, ListaRevisoes } from "../comum/Edital.jsx";
import { PainelDesempenho } from "../comum/Desempenho.jsx";
import { QuestoesDoAluno } from "../aluno/Questoes.jsx";
import { SimuladosDoAluno } from "../aluno/Simulados.jsx";
import { MetaLinha } from "../aluno/Inicio.jsx";
import { quando } from "../aluno/Avisos.jsx";
import { EtiquetaSituacao } from "./Alunos.jsx";
import { RedacoesDoAluno } from "./Redacao.jsx";

function TrocarJornada({ v, aberto, fechar }) {
  const { s } = useApp();
  const modelos = (useModelos() || []).filter((m) => !m.arquivado);
  const sugerido = s.planos.sugerir(modelos, v.aluno);
  const [modeloId, setModeloId] = useState("");
  const [motivo, setMotivo] = useState("");
  const { executar, ocupado, erro } = useAcao();
  const escolhido = modeloId || sugerido?.id || "";
  const substitui = !!v.plano;
  return (
    <Confirmar aberto={aberto} titulo={substitui ? "Trocar a jornada" : "Aplicar uma jornada"} rotulo={substitui ? "Trocar a jornada" : "Aplicar"} perigo={substitui}
      ocupado={ocupado || !escolhido} erro={erro} aoFechar={fechar}
      aoConfirmar={() => executar(async () => { await s.planos.aplicarModelo(v.aluno.id, escolhido, { substituir: substitui, motivo }); fechar(); })}>
      <Campo rotulo="Jornada" ajuda={sugerido ? `Sugerida pelo vestibular${sugerido.cursoId ? " e curso" : ""}: ${sugerido.nome}.` : "Nenhuma jornada bate com o vestibular do aluno."}>
        <select className="entrada" value={escolhido} onChange={(e) => setModeloId(e.target.value)}>
          <option value="">Selecione…</option>
          {modelos.map((m) => <option key={m.id} value={m.id}>{m.nome}{m.id === sugerido?.id ? " · sugerida" : ""}</option>)}
        </select>
      </Campo>
      {substitui && (
        <p className="aviso aviso--erro" role="note">
          O edital atual (<b>{v.plano.nome}</b>) será trocado por uma cópia nova da jornada. O anterior fica guardado,
          e o que já foi estudado, as questões e os simulados continuam. Ajustes individuais do edital atual não passam para o novo.
        </p>
      )}
      <Campo rotulo="Motivo (opcional)"><input className="entrada" value={motivo} onChange={(e) => setMotivo(e.target.value)} /></Campo>
    </Confirmar>
  );
}

function VisaoGeral({ v }) {
  const { ind } = useApp();
  const m = metricasAluno({ aluno: v.aluno, plano: v.plano, progresso: v.progresso, questoes: v.questoes, sessoes: v.sessoes, simulados: v.simulados, ind, hojeIso: v.hoje });
  const a = v.aluno;
  return (
    <>
      <div className="grade-perfil">
        <section className="cartao perfil" aria-label="Perfil">
          <span className="eyebrow">Perfil</span>
          <dl>
            <dt>E-mail</dt><dd>{a.email}</dd>
            {a.telefone && <><dt>Telefone</dt><dd>{a.telefone}</dd></>}
            <dt>Vestibular</dt><dd>{ind.nomeVestibular(a.vestibularId)}{a.cursoId ? ` · ${ind.nomeCurso(a.cursoId)}` : ""}</dd>
            {a.turma && <><dt>Turma</dt><dd>{a.turma}</dd></>}
            {a.dataProva && <><dt>Prova</dt><dd>{fmtDataLonga(a.dataProva)}</dd></>}
            <dt>Último acesso</dt><dd>{a.ultimoAcessoEm ? quando(a.ultimoAcessoEm) : "nunca entrou"}</dd>
          </dl>
        </section>
        <section className="cartao consistencia" aria-label="Consistência">
          <span className="eyebrow">Consistência</span>
          <p className="subtitulo">Estudou <b className="num">{v.consistencia30.diasEstudados}</b> dos últimos 30 dias</p>
          <CalendarioDias dias={v.consistencia30.dias} hojeIso={v.hoje} />
        </section>
      </div>
      <div className="stats-grid stats-grid--4">
        <Tile valor={m.planoPct != null ? `${String(m.planoPct).replace(".", ",")}%` : "–"} rotulo="do edital" detalhe={m.fimPrevisto ? `término previsto ${fmtDataCurta(m.fimPrevisto)}` : null} />
        <Tile valor={m.atrasados} rotulo="tópicos atrasados" tom={m.atrasados ? "perigo" : undefined} detalhe={m.atrasados ? `até ${m.maxDiasAtraso} dias · ${fmtMin(m.cargaAtrasadaMin)}` : null} />
        <Tile valor={m.questoes30} rotulo="questões em 30 dias" detalhe={m.questoes30 ? `${fmtPct(m.pct30)} de acerto` : null} />
        <Tile valor={m.simulados} rotulo="simulados" detalhe={m.simulados ? `média ${fmtPct(m.mediaSimulados)}` : null} />
      </div>
      <section className="secao" aria-label="Metas de hoje">
        <span className="eyebrow">Metas de hoje · {v.feitasHoje} de {v.totalHoje} feitas</span>
        {v.atrasadas.map((meta) => <MetaLinha key={meta.id} meta={meta} atrasada somenteLeitura />)}
        {v.metasHoje.map((meta) => <MetaLinha key={meta.id} meta={meta} somenteLeitura />)}
        {!v.totalHoje && <p className="previa-linha">{v.plano ? "Sem metas hoje." : "Sem edital: aplique uma jornada na aba Edital."}</p>}
      </section>
      <p><EtiquetaSituacao situacao={m.situacao} /></p>
    </>
  );
}

function Estudo({ v }) {
  const { s, ind } = useApp();
  const [apagar, setApagar] = useState(null);
  const [motivo, setMotivo] = useState("");
  const { executar, ocupado, erro } = useAcao();
  const origem = { meta: "Meta", extra: "Tempo extra", revisao: "Revisão", fora: "Por fora" };
  if (!v.sessoes.length) return <div className="cartao"><Vazio icone={BookOpen} titulo="Nenhuma sessão de estudo registrada" /></div>;
  return (
    <>
      <div className="tabela-rolagem">
        <table className="tabela">
          <thead><tr><th>Data</th><th>Conteúdo</th><th className="num">Tempo</th><th>Origem</th><th><span className="sr-only">Ações</span></th></tr></thead>
          <tbody>
            {v.sessoes.slice(0, 200).map((x) => (
              <tr key={x.id}>
                <td className="num">{fmtDataLonga(x.data)}</td>
                <td><span className="celula-conteudo"><PontoMateria materiaId={x.materiaId} /><span><NomeConteudo materiaId={x.materiaId} topicoId={x.topicoId} subtopicoId={x.subtopicoId} /></span></span></td>
                <td className="num">{fmtMin(x.minutos)}</td>
                <td>{origem[x.origem] || x.origem}{x.partes?.some((p) => p.concluiu) && <small className="bloco-pequeno">concluiu conteúdo</small>}</td>
                <td><button type="button" className="icone-btn" aria-label="Apagar sessão" onClick={() => setApagar(x)}><Trash2 /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Confirmar aberto={!!apagar} titulo="Apagar sessão de estudo" rotulo="Apagar" perigo ocupado={ocupado} erro={erro}
        aoFechar={() => { setApagar(null); setMotivo(""); }}
        aoConfirmar={() => executar(async () => { await s.estudo.removerSessao(apagar.id, { motivo }); setApagar(null); setMotivo(""); })}>
        <p className="texto-dialogo">Os minutos saem do progresso ({apagar && `${fmtMin(apagar.minutos)} de ${ind.nomeMateria(apagar.materiaId)}`}). A exclusão fica no histórico.</p>
        <Campo rotulo="Motivo"><input className="entrada" value={motivo} onChange={(e) => setMotivo(e.target.value)} /></Campo>
      </Confirmar>
    </>
  );
}

const REGISTROS = [["questoes", "Questões"], ["simulados", "Simulados"], ["estudo", "Estudo"], ["revisoes", "Revisões"]];

function Registros({ v }) {
  const [tipo, setTipo] = useState("questoes");
  return (
    <>
      <div className="filtros" role="tablist" aria-label="Tipo de registro">
        {REGISTROS.map(([k, nome]) => (
          <button key={k} type="button" role="tab" className="filtro" aria-selected={tipo === k} onClick={() => setTipo(k)}>
            {nome}{k === "questoes" && v.questoes.length ? ` · ${v.questoes.length}` : k === "simulados" && v.simulados.length ? ` · ${v.simulados.length}` : ""}
          </button>
        ))}
      </div>
      {tipo === "questoes" && <QuestoesDoAluno alunoId={v.aluno.id} registros={v.questoes} moderador />}
      {tipo === "simulados" && <SimuladosDoAluno alunoId={v.aluno.id} registros={v.simulados} moderador cursoPadrao={v.aluno.cursoId} />}
      {tipo === "estudo" && <Estudo v={v} />}
      {tipo === "revisoes" && <ListaRevisoes v={v} podeIgnorar />}
    </>
  );
}

function Perfil({ v }) {
  const { s, ind } = useApp();
  const a = v.aluno;
  const [f, setF] = useState({ nome: a.nome, vestibularId: a.vestibularId, cursoId: a.cursoId || "", turma: a.turma || "", telefone: a.telefone || "", dataProva: a.dataProva || "" });
  const [ok, setOk] = useState("");
  const { executar, ocupado, erro } = useAcao();
  const erros = errosDeCampo(erro);
  const anteriores = usePlanosAnteriores(a.id) || [];
  return (
    <div className="grade-organizacao">
      <section className="cartao form">
        <h3 className="subtitulo">Dados do aluno</h3>
        <Campo rotulo="Nome" erro={erros.nome}><input className="entrada" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} /></Campo>
        <div className="form-linha">
          <Campo rotulo="Vestibular" erro={erros.vestibularId}>
            <select className="entrada" value={f.vestibularId} onChange={(e) => setF({ ...f, vestibularId: e.target.value })}>
              {ind.vestibulares.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Curso">
            <select className="entrada" value={f.cursoId} onChange={(e) => setF({ ...f, cursoId: e.target.value })}>
              <option value="">Nenhum</option>{ind.cursos.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
            </select>
          </Campo>
        </div>
        <div className="form-linha form-linha--3">
          <Campo rotulo="Turma"><input className="entrada" value={f.turma} onChange={(e) => setF({ ...f, turma: e.target.value })} /></Campo>
          <Campo rotulo="Telefone"><input className="entrada" value={f.telefone} onChange={(e) => setF({ ...f, telefone: e.target.value })} /></Campo>
          <Campo rotulo="Data da prova" erro={erros.dataProva}><input className="entrada" type="date" value={f.dataProva} onChange={(e) => setF({ ...f, dataProva: e.target.value })} /></Campo>
        </div>
        <p className="previa-linha">Mudar o vestibular ou o curso não troca o edital; para isso, use “Trocar jornada”.</p>
        {ok && <p className="retorno-curto" role="status">{ok}</p>}
        {!Object.keys(erros).length && <MensagemErro erro={erro} />}
        <Botao variante="solido" disabled={ocupado} onClick={() => executar(async () => { const m = await s.alunos.atualizar(a.id, { ...f, dataProva: f.dataProva || null }); setOk(m ? "Dados salvos." : "Nada mudou."); })}>Salvar</Botao>
      </section>
      <section className="cartao form">
        <h3 className="subtitulo">Acesso</h3>
        <p className="texto-dialogo">{a.ativo === false ? "O acesso está bloqueado: o aluno não entra e não vê os dados." : "O aluno entra com o e-mail cadastrado."} O histórico é mantido nos dois casos.</p>
        <Botao variante={a.ativo === false ? "solido" : "perigo"} disabled={ocupado} onClick={() => executar(() => s.alunos.atualizar(a.id, { ativo: a.ativo === false }))}>
          {a.ativo === false ? "Liberar acesso" : "Bloquear acesso"}
        </Botao>
        <Link className="btn btn--vidro btn--sm" to={`/moderador/textos?aluno=${a.id}`}>Textos personalizados deste aluno</Link>
        {anteriores.length > 0 && (
          <>
            <h3 className="subtitulo">Editais anteriores</h3>
            <ul className="lista-simples">{anteriores.map((p) => <li key={p.id}>{p.plano?.nome} <small>substituído em {quando(p.substituidoEm)}</small></li>)}</ul>
          </>
        )}
      </section>
    </div>
  );
}

const ABAS = [
  { k: "geral", label: "Visão geral", icone: LayoutDashboard },
  { k: "edital", label: "Edital", icone: ListChecks },
  { k: "redacao", label: "Redação", icone: PenLine },
  { k: "desempenho", label: "Desempenho", icone: TrendingUp },
  { k: "registros", label: "Registros", icone: ClipboardList },
  { k: "historico", label: "Histórico", icone: History },
  { k: "perfil", label: "Perfil e acesso", icone: UserCog },
];

/* Tudo de um aluno num lugar: o moderador mexe no edital dele (incidência,
   metas, matérias visíveis, tópicos), corrige redações e vê os registros.
   A aba fica no endereço (?aba=), para voltar direto a ela. */
export default function AlunoPainel() {
  const { id } = useParams();
  const v = useVisaoAluno(id);
  const [params, setParams] = useSearchParams();
  const aba = ABAS.some((a) => a.k === params.get("aba")) ? params.get("aba") : "geral";
  const mudarAba = (k) => setParams(k === "geral" ? {} : { aba: k }, { replace: true });
  const [trocar, setTrocar] = useState(false);
  if (v.carregando) return <Carregando />;
  if (!v.aluno) return <><Link to="/moderador/alunos" className="voltar"><ArrowLeft aria-hidden="true" />Alunos</Link><div className="cartao"><Vazio icone={UserCog} titulo="Aluno não encontrado" /></div></>;

  return (
    <>
      <Link to="/moderador/alunos" className="voltar"><ArrowLeft aria-hidden="true" />Todos os alunos</Link>
      <header className="titulo-pagina">
        <div>
          <span className="eyebrow">{[v.plano?.nome || v.ind.nomeVestibular(v.aluno.vestibularId), v.aluno.turma, v.aluno.ativo === false ? "acesso bloqueado" : null].filter(Boolean).join(" · ")}</span>
          <h1>{v.aluno.nome}</h1>
        </div>
        <div className="titulo-direita">
          <Botao variante={v.plano ? "vidro" : "solido"} icone={Replace} onClick={() => setTrocar(true)}>{v.plano ? "Trocar jornada" : "Aplicar jornada"}</Botao>
        </div>
      </header>
      <Abas rotulo="Seções do aluno" itens={ABAS} ativa={aba} aoMudar={mudarAba} />
      {aba === "geral" && <VisaoGeral v={v} />}
      {aba === "edital" && (v.plano ? <EditalDoAluno v={v} modo="moderador" /> : (
        <div className="cartao"><Vazio icone={ListChecks} titulo="Este aluno ainda não tem edital" texto="Aplique a jornada do vestibular dele; depois ela vira uma cópia individual, que você ajusta aqui." />
          <Botao variante="solido" onClick={() => setTrocar(true)}>Aplicar jornada</Botao></div>
      ))}
      {aba === "redacao" && <RedacoesDoAluno aluno={v.aluno} />}
      {aba === "desempenho" && <PainelDesempenho v={v} />}
      {aba === "registros" && <Registros v={v} />}
      {aba === "historico" && <Historico alunoId={v.aluno.id} />}
      {aba === "perfil" && <Perfil key={v.aluno.id} v={v} />}
      {trocar && <TrocarJornada v={v} aberto={trocar} fechar={() => setTrocar(false)} />}
    </>
  );
}
