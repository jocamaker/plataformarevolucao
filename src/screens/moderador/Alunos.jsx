import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { KeyRound, Plus, Users } from "lucide-react";
import { useApp } from "../../state/AppContext.jsx";
import {
  errosDeCampo, useAcao, useAlunos, useHoje, useModelos, useQuestoesDesde, useSessoesDesde, useTodoProgresso, useTodosPlanos, useTodosSimulados,
} from "../../state/hooks.js";
import { metricasAluno, SITUACOES } from "../../services/desempenho.js";
import { fmtDataCurta, fmtDataLonga, somarDias } from "../../core/datas.js";
import { fmtPct } from "../../core/desempenho.js";
import { Barra, Botao, Campo, Carregando, Dialogo, MensagemErro, Tile, TituloPagina, Vazio } from "../../ui/ui.jsx";

const sem = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function EtiquetaSituacao({ situacao }) {
  const st = SITUACOES[situacao] || SITUACOES.em_dia;
  const classe = situacao === "critico" ? " etiqueta--perigo" : situacao === "atencao" || situacao === "sem_plano" ? " etiqueta--rev" : " etiqueta--ok";
  return <span className={`etiqueta${classe}`}>{st.nome}</span>;
}

function senhaAleatoria() {
  const a = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return [...bytes].map((b) => a[b % a.length]).join("");
}

/* Cadastro: cria o acesso e, em seguida, aplica a jornada sugerida. */
function NovoAluno({ aberto, fechar }) {
  const { s, ind } = useApp();
  const modelos = useModelos() || [];
  const navigate = useNavigate();
  const vazio = { nome: "", email: "", senha: senhaAleatoria(), vestibularId: "", cursoId: "", turma: "", telefone: "", dataProva: "" };
  const [f, setF] = useState(vazio);
  const [criado, setCriado] = useState(null); // { id, nome, email, senha }
  const [modeloId, setModeloId] = useState("");
  const { executar, ocupado, erro, limparErro } = useAcao();
  const erros = errosDeCampo(erro);
  const sair = () => { setF({ ...vazio, senha: senhaAleatoria() }); setCriado(null); setModeloId(""); limparErro(); fechar(); };

  const criar = () => executar(async () => {
    const id = await s.alunos.criar(f);
    const sugerido = s.planos.sugerir(modelos, f);
    setModeloId(sugerido?.id || "");
    setCriado({ id, nome: f.nome, email: f.email.trim().toLowerCase(), senha: f.senha });
  });
  const aplicar = () => executar(async () => {
    await s.planos.aplicarModelo(criado.id, modeloId);
    const id = criado.id;
    sair();
    navigate(id);
  });

  return (
    <Dialogo aberto={aberto} aoFechar={sair} titulo={criado ? "Aluno cadastrado" : "Novo aluno"} largura={560}>
      {!criado ? (
        <div className="form">
          <Campo rotulo="Nome completo" erro={erros.nome}><input className="entrada" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} /></Campo>
          <div className="form-linha">
            <Campo rotulo="E-mail (é o login)" erro={erros.email}><input className="entrada" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Campo>
            <Campo rotulo="Senha inicial" ajuda="Passe para o aluno." erro={erros.senha}>
              <span className="linha-entrada">
                <input className="entrada num" value={f.senha} onChange={(e) => setF({ ...f, senha: e.target.value })} />
                <button type="button" className="icone-btn" aria-label="Gerar outra senha" title="Gerar outra" onClick={() => setF({ ...f, senha: senhaAleatoria() })}><KeyRound /></button>
              </span>
            </Campo>
          </div>
          <div className="form-linha">
            <Campo rotulo="Vestibular" erro={erros.vestibularId}>
              <select className="entrada" value={f.vestibularId} onChange={(e) => setF({ ...f, vestibularId: e.target.value })}>
                <option value="">Selecione…</option>
                {ind?.vestibulares.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
              </select>
            </Campo>
            <Campo rotulo="Curso (opcional)" erro={erros.cursoId}>
              <select className="entrada" value={f.cursoId} onChange={(e) => setF({ ...f, cursoId: e.target.value })}>
                <option value="">Nenhum</option>
                {ind?.cursos.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </Campo>
          </div>
          <div className="form-linha form-linha--3">
            <Campo rotulo="Turma (opcional)"><input className="entrada" value={f.turma} onChange={(e) => setF({ ...f, turma: e.target.value })} /></Campo>
            <Campo rotulo="Telefone (opcional)"><input className="entrada" type="tel" value={f.telefone} onChange={(e) => setF({ ...f, telefone: e.target.value })} /></Campo>
            <Campo rotulo="Data da prova (opcional)" erro={erros.dataProva}><input className="entrada" type="date" value={f.dataProva} onChange={(e) => setF({ ...f, dataProva: e.target.value })} /></Campo>
          </div>
          {!Object.keys(erros).length && <MensagemErro erro={erro} />}
          <div className="dialogo-acoes">
            <Botao variante="vidro" onClick={sair}>Cancelar</Botao>
            <Botao variante="solido" disabled={ocupado} onClick={criar}>{ocupado ? "Cadastrando…" : "Cadastrar"}</Botao>
          </div>
        </div>
      ) : (
        <div className="form">
          <p className="retorno" role="status">Acesso criado para <b>{criado.nome}</b>: {criado.email} · senha <b className="num">{criado.senha}</b></p>
          <Campo rotulo="Jornada" ajuda="Sugestão pelo vestibular e curso. Depois dá para ajustar tudo no edital do aluno.">
            <select className="entrada" value={modeloId} onChange={(e) => setModeloId(e.target.value)}>
              <option value="">Sem jornada por enquanto</option>
              {modelos.filter((m) => !m.arquivado).map((m) => <option key={m.id} value={m.id}>{m.nome}{m.vestibularId === f.vestibularId ? " · sugerida" : ""}</option>)}
            </select>
          </Campo>
          <MensagemErro erro={erro} />
          <div className="dialogo-acoes">
            <Botao variante="vidro" onClick={() => { const id = criado.id; sair(); navigate(id); }}>Ver o aluno</Botao>
            <Botao variante="solido" disabled={!modeloId || ocupado} onClick={aplicar}>{ocupado ? "Aplicando…" : "Aplicar jornada"}</Botao>
          </div>
        </div>
      )}
    </Dialogo>
  );
}

export default function Alunos() {
  const { ind } = useApp();
  const hoje = useHoje();
  const inicio = hoje ? somarDias(hoje, -29) : null;
  const alunos = useAlunos();
  const planos = useTodosPlanos();
  const progresso = useTodoProgresso();
  const questoes = useQuestoesDesde(inicio);
  const sessoes = useSessoesDesde(inicio);
  const simulados = useTodosSimulados();
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState({ vestibularId: "", situacao: "", turma: "", ativos: "ativos" });
  const [novo, setNovo] = useState(false);

  const carregando = [alunos, planos, progresso, questoes, sessoes, simulados].some((x) => x === undefined) || !ind;
  const linhas = useMemo(() => {
    if (carregando) return [];
    const por = (lista) => lista.reduce((m, x) => ((m[x.alunoId] ||= []).push(x), m), {});
    const q = por(questoes), se = por(sessoes), si = por(simulados);
    return alunos.map((a) => ({
      aluno: a,
      m: metricasAluno({
        aluno: a, plano: planos.find((p) => p.id === a.id) || null, progresso: progresso[a.id] || {},
        questoes: q[a.id] || [], sessoes: se[a.id] || [], simulados: si[a.id] || [], ind, hojeIso: hoje,
      }),
    }));
  }, [carregando, alunos, planos, progresso, questoes, sessoes, simulados, ind, hoje]);

  if (carregando) return <Carregando />;
  const turmas = [...new Set(alunos.map((a) => a.turma).filter(Boolean))].sort();
  const b = sem(busca).trim();
  const visiveis = linhas
    .filter(({ aluno: a, m }) => (filtro.ativos === "todos" || (filtro.ativos === "ativos" ? a.ativo !== false : a.ativo === false))
      && (!b || sem(`${a.nome} ${a.email} ${a.turma}`).includes(b))
      && (!filtro.vestibularId || a.vestibularId === filtro.vestibularId)
      && (!filtro.turma || a.turma === filtro.turma)
      && (!filtro.situacao || m.situacao === filtro.situacao))
    .sort((x, y) => (SITUACOES[y.m.situacao]?.nivel ?? 0) - (SITUACOES[x.m.situacao]?.nivel ?? 0) || x.aluno.nome.localeCompare(y.aluno.nome, "pt-BR"));
  const ativos = linhas.filter((l) => l.aluno.ativo !== false);
  const conta = (sit) => ativos.filter((l) => l.m.situacao === sit).length;

  return (
    <>
      <TituloPagina eyebrow="Acompanhamento" frase="Seus *alunos*"
        texto="Clique num aluno para abrir o painel dele: edital, incidência das matérias, redações e registros."
        direita={<Botao variante="solido" icone={Plus} onClick={() => setNovo(true)}>Novo aluno</Botao>} />

      <div className="stats-grid stats-grid--4">
        <Tile valor={ativos.length} rotulo="alunos ativos" />
        <Tile valor={conta("em_dia")} rotulo="em dia" tom="ok" />
        <Tile valor={conta("atencao") + conta("sem_plano")} rotulo="pedem atenção" detalhe={conta("sem_plano") ? `${conta("sem_plano")} sem edital` : null} />
        <Tile valor={conta("critico")} rotulo="em situação crítica" tom={conta("critico") ? "perigo" : undefined} detalhe="7+ dias sem estudar ou 14+ dias de atraso" />
      </div>

      <div className="barra-filtros" role="search">
        <label className="filtro-campo filtro-campo--largo"><span>Buscar</span><input className="entrada" type="search" value={busca} placeholder="Nome, e-mail ou turma" onChange={(e) => setBusca(e.target.value)} /></label>
        <label className="filtro-campo"><span>Vestibular</span>
          <select className="entrada" value={filtro.vestibularId} onChange={(e) => setFiltro({ ...filtro, vestibularId: e.target.value })}>
            <option value="">Todos</option>{ind.vestibulares.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
          </select>
        </label>
        {turmas.length > 0 && (
          <label className="filtro-campo"><span>Turma</span>
            <select className="entrada" value={filtro.turma} onChange={(e) => setFiltro({ ...filtro, turma: e.target.value })}>
              <option value="">Todas</option>{turmas.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
        )}
        <label className="filtro-campo"><span>Situação</span>
          <select className="entrada" value={filtro.situacao} onChange={(e) => setFiltro({ ...filtro, situacao: e.target.value })}>
            <option value="">Todas</option>{Object.entries(SITUACOES).map(([k, v]) => <option key={k} value={k}>{v.nome}</option>)}
          </select>
        </label>
        <label className="filtro-campo"><span>Acesso</span>
          <select className="entrada" value={filtro.ativos} onChange={(e) => setFiltro({ ...filtro, ativos: e.target.value })}>
            <option value="ativos">Ativos</option><option value="bloqueados">Bloqueados</option><option value="todos">Todos</option>
          </select>
        </label>
      </div>

      {visiveis.length === 0 ? (
        <div className="cartao"><Vazio icone={Users} titulo={alunos.length ? "Ninguém com esses filtros" : "Nenhum aluno cadastrado"} texto={alunos.length ? null : "Use “Novo aluno” para cadastrar o primeiro."} /></div>
      ) : (
        <div className="tabela-rolagem">
          <table className="tabela tabela-alunos">
            <thead>
              <tr><th>Aluno</th><th>Jornada</th><th>Edital</th><th className="num">Atrasos</th><th>Últimos 30 dias</th><th>Situação</th></tr>
            </thead>
            <tbody>
              {visiveis.map(({ aluno: a, m }) => (
                <tr key={a.id}>
                  <td><Link to={a.id} className="link-aluno"><strong>{a.nome}</strong><small>{a.turma || a.email}</small></Link></td>
                  <td>{ind.nomeVestibular(a.vestibularId)}{a.cursoId && <small className="bloco-pequeno">{ind.nomeCurso(a.cursoId)}</small>}</td>
                  <td className="celula-progresso">{m.planoPct != null ? <><Barra valor={m.planoPct} /><small className="num">{String(m.planoPct).replace(".", ",")}%{m.fimPrevisto ? ` · até ${fmtDataCurta(m.fimPrevisto)}` : ""}</small></> : <small>sem edital</small>}</td>
                  <td className={`num${m.atrasados ? " txt-erro" : ""}`}>{m.atrasados ? `${m.atrasados} · ${m.maxDiasAtraso}d` : "—"}</td>
                  <td className="num">
                    {m.diasEstudados30}/30 dias{m.questoes30 ? ` · ${m.questoes30} questões (${fmtPct(m.pct30)})` : ""}
                    <small className="bloco-pequeno">{m.ultimoEstudo ? `último estudo ${m.diasSemEstudar === 0 ? "hoje" : fmtDataLonga(m.ultimoEstudo)}` : "sem estudo no período"}</small>
                  </td>
                  <td>{a.ativo === false ? <span className="etiqueta">Bloqueado</span> : <EtiquetaSituacao situacao={m.situacao} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <NovoAluno aberto={novo} fechar={() => setNovo(false)} />
    </>
  );
}
