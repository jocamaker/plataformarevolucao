import { useMemo, useState } from "react";
import { ClipboardCheck, ExternalLink, FileText, Paperclip, Pencil, Plus, Trash2 } from "lucide-react";
import { useApp } from "../../state/AppContext.jsx";
import { useAluno, useArquivoUrl, useEu, useFrases, useHoje, usePlano, useProvas, useSimulados } from "../../state/hooks.js";
import { desempenhoSimulados, filtrarRegistros, fmtPct, pct } from "../../core/desempenho.js";
import { fmtDataLonga } from "../../core/datas.js";
import { BarraFiltros, filtroEfetivo, useFiltros } from "../../ui/Filtros.jsx";
import { LinhaPercentual } from "../../ui/Graficos.jsx";
import { Botao, Carregando, Dialogo, TituloPagina, Vazio } from "../../ui/ui.jsx";
import { CartaoProva } from "../../ui/Provas.jsx";
import { materialDoPrograma } from "../../midia.js";
import { ApagarRegistro, FormSimulado, podeCorrigir } from "../comum/Registros.jsx";

export function LinkPdf({ arquivo }) {
  const { url, carregando, faltando } = useArquivoUrl(arquivo?.ref);
  if (!arquivo) return null;
  if (carregando) return <span className="previa-linha">PDF…</span>;
  if (faltando || !url) return <span className="previa-linha" title="Arquivo indisponível neste aparelho">PDF indisponível</span>;
  return <a className="btn btn--texto btn--sm" href={url} target="_blank" rel="noreferrer"><Paperclip aria-hidden="true" />{arquivo.nome || "PDF"}</a>;
}

/* Histórico por vestibular: um gráfico por vestibular, lado a lado, sem ranking. */
export function SimuladosPorVestibular({ simulados }) {
  const { ind } = useApp();
  const d = desempenhoSimulados(simulados, ind);
  if (!d.quantidade) return null;
  return (
    <div className="grade-multiplos">
      {d.porVestibular.map((g) => (
        <section key={g.vestibularId} className="cartao multiplo">
          <header>
            <span className="etiqueta"><i style={{ "--cor": ind.vestibular(g.vestibularId)?.cor }} />{g.nome}</span>
            <span className="num previa-linha">{g.quantidade} {g.quantidade === 1 ? "simulado" : "simulados"} · média {fmtPct(g.mediaPct)}</span>
          </header>
          <LinhaPercentual compacto altura={130} agrupamento="dia"
            pontos={g.historico.map((h) => ({ periodo: h.data, pct: h.pct, acertos: h.acertos, total: h.total, nome: h.nome }))}
            rotuloPonto={(p) => `${p.nome} · ${fmtDataLonga(p.periodo)}`} />
        </section>
      ))}
    </div>
  );
}

export function SimuladosDoAluno({ alunoId, registros, moderador = false, cursoPadrao }) {
  const { usuario, ind } = useApp();
  const hoje = useHoje();
  const filtros = useFiltros({ periodo: "tudo" });
  const [novo, setNovo] = useState(false);
  const [editar, setEditar] = useState(null);
  const [apagar, setApagar] = useState(null);
  const efetivo = useMemo(() => filtroEfetivo(filtros.f, hoje), [filtros.f, hoje]);
  const lista = useMemo(() => filtrarRegistros(registros, { inicio: efetivo.inicio, fim: efetivo.fim, vestibularId: efetivo.vestibularId, ano: efetivo.ano, cursoId: efetivo.cursoId }), [registros, efetivo]);
  const anos = [...new Set(registros.map((x) => x.ano).filter(Boolean))].sort((a, b) => b - a);
  const resumo = desempenhoSimulados(lista, ind);

  return (
    <>
      <div className="linha-titulo-secao">
        <BarraFiltros filtros={filtros} campos={["periodo", "vestibular", "ano", "curso"]} anos={anos} />
        <Botao variante="solido" icone={Plus} onClick={() => setNovo(true)}>Registrar simulado</Botao>
      </div>

      {lista.length === 0 ? (
        <div className="cartao"><Vazio icone={FileText} titulo={registros.length ? "Nenhum simulado com esses filtros" : "Nenhum simulado registrado ainda"}
          texto={registros.length ? "Mude os filtros." : "Registre cada simulado que fizer: vestibular, data, total, acertos e erros. O PDF é opcional."} /></div>
      ) : (
        <>
          <div className="stats-grid">
            <div className="stat-cartao"><strong className="num">{resumo.quantidade}</strong><span>{resumo.quantidade === 1 ? "simulado" : "simulados"}</span></div>
            <div className="stat-cartao"><strong className="num">{fmtPct(resumo.mediaPct)}</strong><span>média de acerto</span></div>
            <div className="stat-cartao"><strong className="num">{resumo.porVestibular.length}</strong><span>{resumo.porVestibular.length === 1 ? "vestibular" : "vestibulares"}</span></div>
          </div>
          <SimuladosPorVestibular simulados={lista} />
          <div className="tabela-rolagem">
            <table className="tabela tabela--cartoes">
              <thead><tr><th>Data</th><th>Simulado</th><th>Vestibular</th><th className="num">Acertos</th><th className="num">Erros</th><th className="num">%</th><th>PDF</th><th><span className="sr-only">Ações</span></th></tr></thead>
              <tbody>
                {lista.map((x) => {
                  const corrigivel = podeCorrigir(usuario, x);
                  return (
                    <tr key={x.id}>
                      <td className="num" data-rotulo="Data">{fmtDataLonga(x.data)}</td>
                      <td className="celula-principal">{x.nome}{x.ano ? <small className="bloco-pequeno">prova de {x.ano}{x.cursoId ? ` · ${ind.nomeCurso(x.cursoId)}` : ""}</small> : x.cursoId ? <small className="bloco-pequeno">{ind.nomeCurso(x.cursoId)}</small> : null}{x.obs && <small className="bloco-pequeno">{x.obs}</small>}</td>
                      <td data-rotulo="Vestibular">{ind.nomeVestibular(x.vestibularId)}</td>
                      <td className="num txt-ok" data-rotulo="Acertos">{x.acertos}</td>
                      <td className="num txt-erro" data-rotulo="Erros">{x.erros}</td>
                      <td className="num"><b>{fmtPct(pct(x.acertos, x.total))}</b><small className="bloco-pequeno">de {x.total}</small></td>
                      <td><LinkPdf arquivo={x.arquivo} /></td>
                      <td className="celula-acoes">
                        {corrigivel && <>
                          <button type="button" className="icone-btn" aria-label={`Corrigir ${x.nome}`} onClick={() => setEditar(x)}><Pencil /></button>
                          <button type="button" className="icone-btn" aria-label={`Apagar ${x.nome}`} onClick={() => setApagar(x)}><Trash2 /></button>
                        </>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Dialogo aberto={novo} aoFechar={() => setNovo(false)} titulo="Registrar simulado" largura={560}>
        {novo && <FormSimulado alunoId={alunoId} cursoPadrao={cursoPadrao} aoConcluir={() => setNovo(false)} aoCancelar={() => setNovo(false)} />}
      </Dialogo>
      <Dialogo aberto={!!editar} aoFechar={() => setEditar(null)} titulo="Corrigir simulado" largura={560}>
        {editar && <FormSimulado alunoId={alunoId} registro={editar} pedirMotivo={moderador} aoConcluir={() => setEditar(null)} aoCancelar={() => setEditar(null)} />}
      </Dialogo>
      <ApagarRegistro alvo={apagar} tipo="simulado" aoFechar={() => setApagar(null)} />
    </>
  );
}

/* Provas para fazer: a galeria que o moderador monta. A capa abre o PDF;
   "Registrar resultado" já vem com a prova preenchida. */
function ProvaDoAluno({ prova, resultado, aoRegistrar }) {
  const { url } = useArquivoUrl(prova.arquivo?.ref);
  return (
    <CartaoProva prova={prova} urlPdf={url} resultado={resultado}
      acoes={(
        <div className="cartao-prova-acoes">
          {url ? <a className="btn btn--solido btn--sm" href={url} target="_blank" rel="noreferrer"><ExternalLink aria-hidden="true" />Abrir prova</a>
            : <span className="previa-linha">PDF indisponível neste aparelho</span>}
          <Botao variante="texto" tamanho="sm" icone={ClipboardCheck} onClick={aoRegistrar}>{resultado ? "Registrar de novo" : "Registrar resultado"}</Botao>
        </div>
      )} />
  );
}

function ProvasParaFazer({ alunoId, registros, cursoPadrao }) {
  const { ind } = useApp();
  const provas = useProvas();
  const plano = usePlano(alunoId);
  const [vestibular, setVestibular] = useState("");
  const [registrar, setRegistrar] = useState(null);
  if (!provas || plano === undefined) return null;
  const doPrograma = provas.filter((p) => materialDoPrograma(p, plano?.modeloId || null));
  if (!doPrograma.length) return null;
  const exames = [...new Set(doPrograma.map((p) => p.vestibularId).filter(Boolean))];
  const lista = doPrograma.filter((p) => !vestibular || p.vestibularId === vestibular);
  // o resultado mais recente de cada prova
  const ultimo = {};
  registros.filter((r) => r.provaId).forEach((r) => { if (!ultimo[r.provaId] || r.data > ultimo[r.provaId].data) ultimo[r.provaId] = r; });

  return (
    <section className="secao" aria-labelledby="t-provas">
      <div className="linha-titulo-secao">
        <h2 id="t-provas" className="subtitulo">Provas para fazer <small>abra o PDF, resolva e registre o resultado</small></h2>
        {exames.length > 1 && (
          <div className="filtros filtros--compacto" role="tablist" aria-label="Exame">
            {[["", "Todas"], ...exames.map((id) => [id, ind.nomeVestibular(id)])].map(([id, nome]) => (
              <button key={id || "todas"} type="button" role="tab" className="filtro" aria-selected={vestibular === id} onClick={() => setVestibular(id)}>{nome}</button>
            ))}
          </div>
        )}
      </div>
      <div className="grade-provas">
        {lista.map((p) => (
          <ProvaDoAluno key={p.id} prova={p} aoRegistrar={() => setRegistrar(p)}
            resultado={ultimo[p.id] ? fmtPct(pct(ultimo[p.id].acertos, ultimo[p.id].total)) : null} />
        ))}
      </div>
      <Dialogo aberto={!!registrar} aoFechar={() => setRegistrar(null)} titulo="Registrar resultado" largura={560}>
        {registrar && (
          <FormSimulado alunoId={alunoId} cursoPadrao={cursoPadrao} aoConcluir={() => setRegistrar(null)} aoCancelar={() => setRegistrar(null)}
            inicial={{ vestibularId: registrar.vestibularId || "", nome: registrar.titulo, ano: registrar.ano ?? "", provaId: registrar.id }} />
        )}
      </Dialogo>
    </section>
  );
}

export default function SimuladosAluno() {
  const eu = useEu();
  const aluno = useAluno(eu.id);
  const registros = useSimulados(eu.id);
  const t = useFrases(aluno || eu);
  if (!registros) return <Carregando />;
  return (
    <>
      <TituloPagina eyebrow="Provas completas" frase={t("painel.simulados.titulo")}
        texto="Escolha uma prova, resolva no tempo dela e registre o resultado. O histórico fica separado por vestibular: cada prova tem a sua escala." />
      <ProvasParaFazer alunoId={eu.id} registros={registros} cursoPadrao={aluno?.cursoId} />
      <h2 className="subtitulo secao-titulo">Seus resultados</h2>
      <SimuladosDoAluno alunoId={eu.id} registros={registros} cursoPadrao={aluno?.cursoId} />
    </>
  );
}
