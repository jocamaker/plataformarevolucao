import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { ArrowLeft, ExternalLink, PenLine, PlayCircle, Send } from "lucide-react";
import { notaDevolutiva } from "../../core/nucleo.js";
import { fmtDataLonga } from "../../core/datas.js";
import { useApp } from "../../state/AppContext.jsx";
import { useAluno, useArquivoUrl, useConfigRedacao, useDevolutivas, useEu, useFrases, usePlaylists } from "../../state/hooks.js";
import { evolucao } from "../../redacao.js";
import { EvolucaoNotas, FolhaCorrigida, ItemMarcacao, NotasCompetencias } from "../../ui/Correcao.jsx";
import { Carregando, TituloPagina, Vazio } from "../../ui/ui.jsx";
import { AbrirPdf } from "./Materiais.jsx";

function CapaRedacao({ d }) {
  const { ind } = useApp();
  const { url } = useArquivoUrl(d.foto);
  const v = ind?.vestibular(d.vestibularId);
  if (url) return <div className="capa capa--foto"><img src={url} alt="" loading="lazy" /></div>;
  return (
    <div className="capa capa--gerada" style={{ "--cor": v?.cor || "var(--muted)" }} aria-hidden="true">
      <span className="capa-categoria">{v?.nome || "Redação"}</span>
      <strong>Redação</strong>
      <PenLine className="capa-icone" />
    </div>
  );
}

export function RedacoesAluno() {
  const eu = useEu();
  const aluno = useAluno(eu.id);
  const t = useFrases(aluno || eu);
  const minhas = useDevolutivas(eu.id);
  const config = useConfigRedacao();
  const playlists = usePlaylists() || [];
  const { ind } = useApp();
  if (!minhas) return <Carregando />;
  const pontos = evolucao(minhas);
  const temAulas = playlists.some((pl) => pl.categoria === "redacao");

  return (
    <>
      <TituloPagina eyebrow="Devolutivas do professor" frase={t("painel.redacao.titulo")} />

      <div className="cartao como-enviar">
        <Send aria-hidden="true" />
        <div>
          <span className="eyebrow">Como enviar sua redação</span>
          <p>{config?.instrucoes || "Combine com o professor como enviar sua redação."}</p>
        </div>
        {temAulas && <Link className="btn btn--vidro btn--sm" to="/aluno/cursos?categoria=redacao"><PlayCircle />Aulas de redação</Link>}
      </div>

      {pontos.length >= 2 && (
        <section className="cartao bloco-evolucao" aria-labelledby="titulo-evolucao">
          <h2 id="titulo-evolucao" className="subtitulo">Evolução da nota <small>% da nota máxima</small></h2>
          <EvolucaoNotas pontos={pontos} />
        </section>
      )}

      {minhas.length === 0 ? (
        <div className="cartao"><Vazio icone={PenLine} titulo="Nenhuma devolutiva ainda" texto="Quando o professor corrigir sua redação, ela aparece aqui com a nota e os comentários." /></div>
      ) : (
        <div className="grade-redacoes">
          {minhas.map((d) => {
            const nota = notaDevolutiva(d);
            return (
              <Link key={d.id} to={d.id} className="cartao-redacao">
                <CapaRedacao d={d} />
                {!d.lida && <span className="selo-nova">Nova</span>}
                <div className="cartao-redacao-corpo">
                  <strong>{d.tema}</strong>
                  <div className="cartao-redacao-rodape">
                    <span>
                      Corrigida em <b>{fmtDataLonga(d.enviadaEm)}</b><br />
                      Vestibular <b>{ind?.nomeVestibular(d.vestibularId) || "—"}</b>
                    </span>
                    <span className="nota-cartao"><small>Nota</small><b>{nota.texto}</b></span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}

export function RedacaoAluno() {
  const { id } = useParams();
  const { s, ind } = useApp();
  const eu = useEu();
  const minhas = useDevolutivas(eu.id);
  const playlists = usePlaylists() || [];
  const d = minhas?.find((x) => x.id === id);
  const [ativa, setAtiva] = useState(null);

  useEffect(() => {
    if (d && !d.lida) s.redacao.marcarLida(d.id).catch(() => {});
  }, [d, s]);

  if (!minhas) return <Carregando />;
  if (!d) return <Navigate to=".." relative="path" replace />;
  const nota = notaDevolutiva(d);
  const media = d.mediaTema || null;
  const marcacoes = d.marcacoes || [];
  const aulasRedacao = playlists.find((pl) => pl.categoria === "redacao");

  return (
    <>
      <Link to=".." relative="path" className="voltar"><ArrowLeft aria-hidden="true" />Todas as redações</Link>
      <header className="cabeca-redacao">
        <span className="eyebrow">{ind?.nomeVestibular(d.vestibularId) || "Redação"} · corrigida em {fmtDataLonga(d.enviadaEm)}</span>
        <h1>{d.tema}</h1>
      </header>

      <div className="correcao">
        <div className="correcao-folha">
          <FolhaCorrigida foto={d.foto} marcacoes={marcacoes} ativa={ativa} aoSelecionar={setAtiva} />
        </div>

        <aside className="correcao-painel" aria-label="Correção">
          <section className="cartao">
            <span className="eyebrow">Sua nota</span>
            <div className="nota-grande">{nota.texto}</div>
            {media && <p className="nota-media">Média do tema: <b className="num">{media.total}</b> pontos</p>}
            {d.rubrica === "enem" && <NotasCompetencias notas={d.notas} media={media} />}
          </section>

          {(d.proposta || aulasRedacao || d.anexos?.length > 0) && (
            <section className="cartao material">
              <span className="eyebrow">Material de apoio</span>
              {(d.anexos || []).map((a) => <AbrirPdf key={a.ref} arquivo={a} rotulo={a.nome} />)}
              {d.proposta && <a className="btn btn--vidro btn--sm" href={d.proposta} target="_blank" rel="noreferrer"><ExternalLink />Proposta de redação</a>}
              {aulasRedacao && <Link className="btn btn--vidro btn--sm" to={`/aluno/cursos/${aulasRedacao.id}`}><PlayCircle />{aulasRedacao.titulo}</Link>}
            </section>
          )}

          {marcacoes.length > 0 && (
            <section className="lista-marcacoes" aria-label="Marcações no texto">
              <span className="eyebrow">Marcações no texto</span>
              {marcacoes.map((m, i) => (
                <ItemMarcacao key={m.id} m={m} numero={i + 1} ativa={ativa === m.id} aoSelecionar={(mid) => setAtiva(ativa === mid ? null : mid)} />
              ))}
            </section>
          )}

          {(d.comentario || d.pontosFortes || d.aMelhorar) && (
            <section className="cartao comentarios">
              {d.comentario && <><span className="eyebrow">Comentário geral</span><p>{d.comentario}</p></>}
              {d.pontosFortes && <><span className="eyebrow">Pontos fortes</span><p>{d.pontosFortes}</p></>}
              {d.aMelhorar && <><span className="eyebrow">O que melhorar</span><p>{d.aMelhorar}</p></>}
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
