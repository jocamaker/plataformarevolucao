/* Jornadas: o conteúdo programático de cada curso (vestibular + curso).
   Criar é um passo só (todas as matérias, com todos os tópicos, e as horas
   divididas); depois se ajusta tudo na mesma tela: incidência das matérias,
   tópicos e subtópicos (novos ou existentes) e regras. Com "levar aos
   alunos", cada mudança vai também para o edital de quem está na jornada,
   sem desfazer o que foi ajustado individualmente. */

import { useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { Archive, ArchiveRestore, ArrowLeft, Copy, Map as Mapa, Pencil, Plus } from "lucide-react";
import { useApp } from "../../state/AppContext.jsx";
import { errosDeCampo, useAcao, useModelos, useTodosPlanos } from "../../state/hooks.js";
import { MODALIDADES, itensDoPlano } from "../../core/plano.js";
import { fmtMin } from "../../core/nucleo.js";
import { BlocosMaterias, Organizacao, TabelaIncidencia, TopicosDaMateria } from "../comum/Edital.jsx";
import { Botao, Campo, Carregando, Dialogo, MensagemErro, TituloPagina, Vazio } from "../../ui/ui.jsx";

const nomeModalidade = (id) => MODALIDADES.find((m) => m.id === id)?.nome || "";
const NOVO = "__novo";

export const CARGA_REFERENCIA = 1200; // 20 h por semana
export const cargaDe = (modelo) => modelo?.cargaReferencia || CARGA_REFERENCIA;

function resumoDa(modelo, ind) {
  const itens = itensDoPlano(modelo, ind);
  const semanal = cargaDe(modelo);
  const carga = itens.reduce((x, it) => x + it.duracao, 0);
  return { topicos: itens.length, semanal, carga, semanas: semanal ? Math.ceil(carga / semanal) : null, materias: (modelo.materias || []).filter((m) => m.ativa !== false).length };
}

/* Escolha com "+ Novo…" no fim: cria o item da estrutura ali mesmo. */
function EscolhaOuNovo({ rotulo, valor, novoNome, opcoes, vazio, aoMudar, aoMudarNovo, erro }) {
  return (
    <Campo rotulo={rotulo} erro={erro}>
      <select className="entrada" value={valor} onChange={(e) => aoMudar(e.target.value)}>
        {vazio != null && <option value="">{vazio}</option>}
        {opcoes.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
        <option value={NOVO}>+ Novo…</option>
      </select>
      {valor === NOVO && <input className="entrada" autoFocus placeholder="Nome" value={novoNome} onChange={(e) => aoMudarNovo(e.target.value)} />}
    </Campo>
  );
}

function NovaJornada({ fechar }) {
  const { s, ind } = useApp();
  const navigate = useNavigate();
  const [f, setF] = useState({ vestibularId: "", novoVestibular: "", cursoId: "", novoCurso: "", modalidade: "extensivo", horas: 20, dataAlvo: "", nome: "" });
  const { executar, ocupado, erro } = useAcao();
  const erros = errosDeCampo(erro);
  const nomeVest = f.vestibularId === NOVO ? f.novoVestibular.trim() : ind.nomeVestibular(f.vestibularId);
  const nomeCurso = f.cursoId === NOVO ? f.novoCurso.trim() : f.cursoId ? ind.nomeCurso(f.cursoId) : "";
  const sugestao = [nomeVest, nomeCurso].filter(Boolean).join(" · ");
  const criar = () => executar(async () => {
    const vestibularId = f.vestibularId === NOVO ? await s.estrutura.salvar("vestibular", { nome: f.novoVestibular }) : f.vestibularId;
    const cursoId = f.cursoId === NOVO ? await s.estrutura.salvar("curso", { nome: f.novoCurso }) : f.cursoId;
    const id = await s.planos.criarJornada({
      nome: f.nome || sugestao, vestibularId, cursoId, modalidade: f.modalidade, dataAlvo: f.dataAlvo || null, horasSemanais: Number(f.horas) || 20,
    });
    fechar();
    navigate(id);
  });
  return (
    <Dialogo aberto aoFechar={fechar} titulo="Nova jornada" largura={560}>
      <div className="form">
        <p className="previa-linha">A jornada nasce com as {ind.materias.length} matérias do curso, todos os tópicos delas e peso 2 em todas. Depois é só ajustar os pesos.</p>
        <div className="form-linha">
          <EscolhaOuNovo rotulo="Vestibular" valor={f.vestibularId} novoNome={f.novoVestibular} opcoes={ind.vestibulares} vazio="Selecione…" erro={erros.vestibularId || erros.nome}
            aoMudar={(v) => setF({ ...f, vestibularId: v })} aoMudarNovo={(v) => setF({ ...f, novoVestibular: v })} />
          <EscolhaOuNovo rotulo="Curso (opcional)" valor={f.cursoId} novoNome={f.novoCurso} opcoes={ind.cursos} vazio="Qualquer curso"
            aoMudar={(v) => setF({ ...f, cursoId: v })} aoMudarNovo={(v) => setF({ ...f, novoCurso: v })} />
        </div>
        <div className="form-linha form-linha--3">
          <Campo rotulo="Modalidade">
            <select className="entrada" value={f.modalidade} onChange={(e) => setF({ ...f, modalidade: e.target.value })}>
              {MODALIDADES.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Carga de referência (h/semana)" ajuda="Só para as prévias; o tempo real é o de cada aluno."><input className="entrada num" type="number" min="1" max="80" value={f.horas} onChange={(e) => setF({ ...f, horas: e.target.value })} /></Campo>
          <Campo rotulo="Data da prova (opcional)"><input className="entrada" type="date" value={f.dataAlvo} onChange={(e) => setF({ ...f, dataAlvo: e.target.value })} /></Campo>
        </div>
        <Campo rotulo="Nome (opcional)"><input className="entrada" value={f.nome} placeholder={sugestao || "Ex.: FUVEST · Medicina"} onChange={(e) => setF({ ...f, nome: e.target.value })} /></Campo>
        {!Object.keys(erros).length && <MensagemErro erro={erro} />}
        <div className="dialogo-acoes">
          <Botao variante="vidro" onClick={fechar}>Cancelar</Botao>
          <Botao variante="solido" disabled={ocupado || !f.vestibularId || (f.vestibularId === NOVO && !f.novoVestibular.trim()) || (f.cursoId === NOVO && !f.novoCurso.trim())} onClick={criar}>
            {ocupado ? "Criando…" : "Criar jornada"}
          </Botao>
        </div>
      </div>
    </Dialogo>
  );
}

export function Jornadas() {
  const { ind } = useApp();
  const modelos = useModelos();
  const planos = useTodosPlanos() || [];
  const [nova, setNova] = useState(false);
  const [verArquivadas, setVerArquivadas] = useState(false);
  if (!modelos || !ind) return <Carregando />;
  const lista = modelos.filter((m) => !!m.arquivado === verArquivadas);
  const arquivadas = modelos.filter((m) => m.arquivado).length;

  return (
    <>
      <TituloPagina eyebrow="Conteúdo programático" frase="*Jornadas* por vestibular"
        texto="Cada jornada é o edital de um vestibular (e curso): matérias, tópicos e o peso de cada uma. O aluno recebe uma cópia, que você ajusta no painel dele."
        direita={<Botao variante="solido" icone={Plus} onClick={() => setNova(true)}>Nova jornada</Botao>} />
      {arquivadas > 0 && (
        <div className="filtros" role="tablist">
          <button type="button" role="tab" className="filtro" aria-selected={!verArquivadas} onClick={() => setVerArquivadas(false)}>Em uso</button>
          <button type="button" role="tab" className="filtro" aria-selected={verArquivadas} onClick={() => setVerArquivadas(true)}>Arquivadas · {arquivadas}</button>
        </div>
      )}
      {lista.length === 0 ? <div className="cartao"><Vazio icone={Mapa} titulo={verArquivadas ? "Nenhuma jornada arquivada" : "Nenhuma jornada ainda"} texto={verArquivadas ? null : "Crie a primeira: escolha o vestibular e pronto."} /></div> : (
        <div className="grade-jornadas">
          {lista.map((m) => {
            const r = resumoDa(m, ind);
            const alunos = planos.filter((p) => p.modeloId === m.id).length;
            return (
              <Link key={m.id} to={m.id} className="cartao cartao-jornada" style={{ "--cor": ind.vestibular(m.vestibularId)?.cor }}>
                <span className="eyebrow">{[ind.nomeVestibular(m.vestibularId), m.cursoId ? ind.nomeCurso(m.cursoId) : null, nomeModalidade(m.modalidade)].filter(Boolean).join(" · ")}</span>
                <strong>{m.nome}</strong>
                <span className="previa-linha">{r.materias} matérias ativas · {r.topicos} tópicos</span>
                <span className="cartao-jornada-rodape">{alunos ? `${alunos} ${alunos === 1 ? "aluno" : "alunos"}` : "nenhum aluno ainda"}</span>
              </Link>
            );
          })}
        </div>
      )}
      {nova && <NovaJornada fechar={() => setNova(false)} />}
    </>
  );
}

function DadosDaJornada({ modelo, fechar }) {
  const { s, ind } = useApp();
  const [f, setF] = useState(() => ({
    nome: modelo.nome || "", descricao: modelo.descricao || "", vestibularId: modelo.vestibularId || "", cursoId: modelo.cursoId || "",
    modalidade: modelo.modalidade || "extensivo", periodo: modelo.periodo || "",
  }));
  const { executar, ocupado, erro } = useAcao();
  const erros = errosDeCampo(erro);
  return (
    <Dialogo aberto aoFechar={fechar} titulo="Dados da jornada" largura={560}>
      <div className="form">
        <Campo rotulo="Nome" erro={erros.nome}><input className="entrada" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} /></Campo>
        <div className="form-linha">
          <Campo rotulo="Vestibular" erro={erros.vestibularId}>
            <select className="entrada" value={f.vestibularId} onChange={(e) => setF({ ...f, vestibularId: e.target.value })}>
              {ind.vestibulares.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Curso" erro={erros.cursoId}>
            <select className="entrada" value={f.cursoId} onChange={(e) => setF({ ...f, cursoId: e.target.value })}>
              <option value="">Qualquer curso</option>{ind.cursos.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </Campo>
        </div>
        <div className="form-linha">
          <Campo rotulo="Modalidade">
            <select className="entrada" value={f.modalidade} onChange={(e) => setF({ ...f, modalidade: e.target.value })}>
              {MODALIDADES.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Período (opcional)"><input className="entrada" value={f.periodo} placeholder="Ex.: 2027" onChange={(e) => setF({ ...f, periodo: e.target.value })} /></Campo>
        </div>
        <Campo rotulo="Descrição (opcional)"><textarea className="entrada" rows={2} value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} /></Campo>
        {!Object.keys(erros).length && <MensagemErro erro={erro} />}
        <div className="dialogo-acoes">
          <Botao variante="vidro" onClick={fechar}>Cancelar</Botao>
          <Botao variante="solido" disabled={ocupado} onClick={() => executar(async () => { await s.planos.salvarModelo({ id: modelo.id, ...f }); fechar(); })}>Salvar</Botao>
        </div>
      </div>
    </Dialogo>
  );
}

export function Jornada() {
  const { id } = useParams();
  const { s, ind } = useApp();
  const modelos = useModelos();
  const planos = useTodosPlanos();
  const navigate = useNavigate();
  const [aberta, setAberta] = useState(null);
  const [propagar, setPropagar] = useState(false);
  const [editar, setEditar] = useState(false);
  const [retorno, setRetorno] = useState("");
  const { executar, ocupado, erro } = useAcao();
  const modelo = modelos?.find((m) => m.id === id);
  const r = useMemo(() => (modelo && ind ? resumoDa(modelo, ind) : null), [modelo, ind]);

  if (!modelos || !ind || !planos) return <Carregando />;
  if (!modelo) return <Navigate to="/moderador/jornadas" replace />;
  const alunos = planos.filter((p) => p.modeloId === id).length;
  const levar = propagar && alunos > 0;
  const avisar = (res) => setRetorno(levar ? (res?.alunos ? `Feito na jornada e em ${res.alunos} ${res.alunos === 1 ? "aluno" : "alunos"}.` : "Feito na jornada; os alunos já estavam assim ou têm ajuste próprio.") : "Feito na jornada.");
  const operar = (ops) => executar(async () => avisar(await s.planos.alterarJornada(id, ops, { propagar: levar })));
  const criar = (fn) => async (...args) => { const res = await fn(...args); setRetorno(levar ? "Criado na jornada e levado aos alunos." : "Criado na jornada."); return res; };

  return (
    <>
      <Link to="/moderador/jornadas" className="voltar"><ArrowLeft aria-hidden="true" />Jornadas</Link>
      <header className="titulo-pagina">
        <div>
          <span className="eyebrow">{[ind.nomeVestibular(modelo.vestibularId), modelo.cursoId ? ind.nomeCurso(modelo.cursoId) : null, nomeModalidade(modelo.modalidade), modelo.periodo].filter(Boolean).join(" · ")}{modelo.arquivado ? " · arquivada" : ""}</span>
          <h1>{modelo.nome}</h1>
          <p className="previa-linha">{r.materias} matérias ativas · {r.topicos} tópicos{r.semanas ? ` · ≈ ${r.semanas} semanas com ${fmtMin(r.semanal)} por semana` : ""}</p>
        </div>
        <div className="titulo-direita">
          <Botao variante="vidro" tamanho="sm" icone={Pencil} onClick={() => setEditar(true)}>Dados</Botao>
          <Botao variante="vidro" tamanho="sm" icone={Copy} disabled={ocupado} onClick={() => executar(async () => navigate(`/moderador/jornadas/${await s.planos.duplicarModelo(id)}`))}>Duplicar</Botao>
          <Botao variante="texto" tamanho="sm" icone={modelo.arquivado ? ArchiveRestore : Archive} disabled={ocupado} onClick={() => executar(() => s.planos.arquivarModelo(id, !modelo.arquivado))}>{modelo.arquivado ? "Restaurar" : "Arquivar"}</Botao>
        </div>
      </header>

      {alunos > 0 && (
        <label className="cartao levar-alunos">
          <input type="checkbox" checked={propagar} onChange={(e) => setPropagar(e.target.checked)} />
          <span>
            <b>Levar as mudanças também aos {alunos} {alunos === 1 ? "aluno" : "alunos"} desta jornada</b>
            <small>O que você ajustou no painel de cada aluno continua como está; mudanças de ordem ficam só na jornada.</small>
          </span>
        </label>
      )}
      <MensagemErro erro={erro} />
      {retorno && !erro && <p className="retorno-curto" role="status">{retorno}</p>}

      <TabelaIncidencia plano={modelo} ocupado={ocupado} capacidade={cargaDe(modelo)} aoAplicar={(ops) => operar(ops)}
        rotuloCapacidade={<>Prévia com a carga de referência: <b>{fmtMin(cargaDe(modelo))}</b> por semana</>} />

      <section className="secao" aria-label="Conteúdo programático">
        <h2 className="subtitulo secao-titulo">Conteúdo programático</h2>
        <BlocosMaterias plano={modelo} selecionada={aberta} aoSelecionar={setAberta} mostrarOcultas />
      </section>
      {aberta && (
        <TopicosDaMateria plano={modelo} materiaId={aberta} pode={{ reordenar: true, estrutura: true, criar: true, carga: true }} ocupado={ocupado}
          aoFechar={() => setAberta(null)} aoOperar={(op) => operar(op)}
          aoCriarTopico={criar((nome) => s.planos.novoTopico({ materiaId: aberta, nome, modeloId: id, propagar: levar }))}
          aoCriarSubtopico={criar((topicoId, nome) => s.planos.novoSubtopico({ materiaId: aberta, topicoId, nome, modeloId: id, propagar: levar }))} />
      )}

      <details className="recolhivel">
        <summary>Regras da jornada <small>limites de tempo, velocidade, data-alvo, revisões e o que o aluno pode mudar</small></summary>
        <Organizacao modelo plano={modelo} pode={{ ritmo: true, prazo: true, revisao: true, permissoes: true, limites: true }} aoOperar={(op) => operar(op)} ocupado={ocupado} />
      </details>
      {editar && <DadosDaJornada modelo={modelo} fechar={() => setEditar(false)} />}
    </>
  );
}
