import { useMemo, useState } from "react";
import { FileQuestion, MessageSquareText, Plus } from "lucide-react";
import { useApp } from "../../state/AppContext.jsx";
import { useEu, useFrases, useHoje, useQuestoes, useAluno } from "../../state/hooks.js";
import { desempenhoPorMateria, desempenhoQuestoes, filtrarRegistros, fmtPct, pct } from "../../core/desempenho.js";
import { fmtDataCurta } from "../../core/datas.js";
import { BarraFiltros, filtroEfetivo, useFiltros } from "../../ui/Filtros.jsx";
import { NomeConteudo, PontoMateria } from "../../ui/Conteudo.jsx";
import { Botao, Carregando, Dialogo, TituloPagina, Vazio } from "../../ui/ui.jsx";
import { ApagarRegistro, DetalheQuestoes, FormQuestoes } from "../comum/Registros.jsx";

/* Resumo de acertos ou erros do período, por matéria (clicável no topo). */
function DetalhePeriodo({ foco, registros, aoFechar }) {
  const { ind } = useApp();
  if (!foco) return null;
  const linhas = desempenhoPorMateria(registros, ind).filter((l) => l[foco] > 0).sort((a, b) => b[foco] - a[foco]);
  return (
    <Dialogo aberto={!!foco} aoFechar={aoFechar} titulo={foco === "erros" ? "Onde estão os erros" : "Onde estão os acertos"} largura={480}>
      <div className="form">
        <p className="previa-linha">Somados dos registros no filtro atual. Clique num registro da lista para ver o bloco inteiro.</p>
        <ul className="lista-simples">
          {linhas.map((l) => (
            <li key={l.id} className="linha-detalhe">
              <span className="celula-conteudo"><PontoMateria materiaId={l.id} />{l.nome}</span>
              <b className={`num ${foco === "erros" ? "txt-erro" : "txt-ok"}`}>{l[foco]}</b>
              <small className="num">de {l.total} · {fmtPct(pct(l[foco], l.total))}</small>
            </li>
          ))}
        </ul>
        <div className="dialogo-acoes"><Botao variante="solido" onClick={aoFechar}>Fechar</Botao></div>
      </div>
    </Dialogo>
  );
}

/* Lista filtrável de questões de um aluno (aluno e moderador). */
export function QuestoesDoAluno({ alunoId, registros, moderador = false }) {
  const hoje = useHoje();
  const filtros = useFiltros({ periodo: "30d" });
  const [novo, setNovo] = useState(false);
  const [retorno, setRetorno] = useState("");
  const [detalhe, setDetalhe] = useState(null); // { registro, foco }
  const [editar, setEditar] = useState(null);
  const [apagar, setApagar] = useState(null);
  const [focoPeriodo, setFocoPeriodo] = useState(null);

  const efetivo = useMemo(() => filtroEfetivo(filtros.f, hoje), [filtros.f, hoje]);
  const lista = useMemo(() => filtrarRegistros(registros, efetivo), [registros, efetivo]);
  const r = desempenhoQuestoes(lista);

  return (
    <>
      <div className="linha-titulo-secao">
        <BarraFiltros filtros={filtros} campos={["periodo", "conteudo", "vestibular"]} />
        <Botao variante="solido" icone={Plus} onClick={() => setNovo(true)}>Registrar questões</Botao>
      </div>

      <div className="stats-grid stats-grid--4 resumo-questoes">
        <div className="stat-cartao"><strong className="num">{r.total}</strong><span>questões · {r.registros} {r.registros === 1 ? "registro" : "registros"}</span></div>
        <button type="button" className="stat-cartao stat-cartao--ok" disabled={!r.acertos} onClick={() => setFocoPeriodo("acertos")}>
          <strong className="num">{r.acertos}</strong><span>acertos</span>
        </button>
        <button type="button" className="stat-cartao stat-cartao--perigo" disabled={!r.erros} onClick={() => setFocoPeriodo("erros")}>
          <strong className="num">{r.erros}</strong><span>erros{r.emBranco ? ` · ${r.emBranco} em branco` : ""}</span>
        </button>
        <div className="stat-cartao"><strong className="num">{r.total ? fmtPct(r.pct) : "–"}</strong><span>de acerto</span></div>
      </div>

      {lista.length === 0 ? (
        <div className="cartao"><Vazio icone={FileQuestion} titulo={registros.length ? "Nenhum registro com esses filtros" : "Nenhuma questão registrada ainda"}
          texto={registros.length ? "Mude o período ou limpe os filtros." : "Registre cada bloco de questões que resolver: data, matéria, tópico, total, acertos e erros."} /></div>
      ) : (
        <div className="tabela-rolagem">
          <table className="tabela tabela-registros tabela--cartoes">
            <thead><tr><th>Data</th><th>Conteúdo</th><th className="num">Total</th><th className="num">Acertos</th><th className="num">Erros</th><th className="num">%</th><th><span className="sr-only">Notas</span></th></tr></thead>
            <tbody>
              {lista.map((q) => (
                <tr key={q.id}>
                  <td className="num" data-rotulo="Data">{fmtDataCurta(q.data)}</td>
                  <td className="celula-principal">
                    <button type="button" className="link-linha" onClick={() => setDetalhe({ registro: q })}>
                      <span className="celula-conteudo"><PontoMateria materiaId={q.materiaId} /><span><NomeConteudo materiaId={q.materiaId} topicoId={q.topicoId} subtopicoId={q.subtopicoId} /></span></span>
                    </button>
                  </td>
                  <td className="num" data-rotulo="Total">{q.total}</td>
                  <td className="num" data-rotulo="Acertos"><button type="button" className="numero-clicavel txt-ok" onClick={() => setDetalhe({ registro: q, foco: "acertos" })} aria-label={`${q.acertos} acertos: ver registro`}>{q.acertos}</button></td>
                  <td className="num" data-rotulo="Erros"><button type="button" className="numero-clicavel txt-erro" onClick={() => setDetalhe({ registro: q, foco: "erros" })} aria-label={`${q.erros} erros: ver registro`}>{q.erros}</button></td>
                  <td className="num" data-rotulo="Acerto">{fmtPct(pct(q.acertos, q.total))}</td>
                  <td>{q.obs && <MessageSquareText aria-label="Tem observação" className="icone-pequeno" />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialogo aberto={novo} aoFechar={() => { setNovo(false); setRetorno(""); }} titulo="Registrar questões" largura={520}>
        {novo && (retorno ? (
          <div className="form">
            <p className="retorno" role="status">{retorno}</p>
            <div className="dialogo-acoes">
              <Botao variante="vidro" onClick={() => setRetorno("")}>Registrar outro bloco</Botao>
              <Botao variante="solido" onClick={() => { setNovo(false); setRetorno(""); }}>Fechar</Botao>
            </div>
          </div>
        ) : <FormQuestoes alunoId={alunoId} aoConcluir={setRetorno} aoCancelar={() => setNovo(false)} />)}
      </Dialogo>
      <DetalheQuestoes registro={detalhe?.registro} foco={detalhe?.foco} aoFechar={() => setDetalhe(null)}
        aoEditar={(q) => { setDetalhe(null); setEditar(q); }} aoApagar={(q) => { setDetalhe(null); setApagar(q); }} />
      <Dialogo aberto={!!editar} aoFechar={() => setEditar(null)} titulo="Corrigir registro" largura={520}>
        {editar && <FormQuestoes alunoId={alunoId} registro={editar} pedirMotivo={moderador} aoConcluir={() => setEditar(null)} aoCancelar={() => setEditar(null)} />}
      </Dialogo>
      <ApagarRegistro alvo={apagar} tipo="questoes" aoFechar={() => setApagar(null)} />
      <DetalhePeriodo foco={focoPeriodo} registros={lista} aoFechar={() => setFocoPeriodo(null)} />
    </>
  );
}

export default function QuestoesAluno() {
  const eu = useEu();
  const aluno = useAluno(eu.id);
  const registros = useQuestoes(eu.id);
  const t = useFrases(aluno || eu);
  if (!registros) return <Carregando />;
  return (
    <>
      <TituloPagina eyebrow="Banco de questões" frase={t("painel.questoes.titulo")}
        texto="Cada registro é um bloco de questões: quantas fez, quantas acertou e quantas errou. O desempenho sai daqui." />
      <QuestoesDoAluno alunoId={eu.id} registros={registros} />
    </>
  );
}
