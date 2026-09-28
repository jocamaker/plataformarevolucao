import { useMemo, useRef, useState } from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Check, ChevronRight, Video } from "lucide-react";
import { CATEGORIAS_PLAYLIST } from "../../core/nucleo.js";
import { useApp } from "../../state/AppContext.jsx";
import { useAcao, useAluno, useAssistidos, useEu, useFrases, usePlano, usePlaylists } from "../../state/hooks.js";
import { progressoPlaylist } from "../../midia.js";
import { playlistVisivelPara } from "../../services/conteudo.js";
import { CapaPlaylist, MiniaturaVideo, PlayerVideo, Relevancia, nomeCategoria } from "../../ui/Midia.jsx";
import { Barra, Botao, Carregando, MensagemErro, TituloPagina, Vazio } from "../../ui/ui.jsx";

// playlists publicadas que valem para o programa (jornada) do aluno e as matérias visíveis do edital
function usePlaylistsDoAluno() {
  const eu = useEu();
  const aluno = useAluno(eu.id);
  const plano = usePlano(eu.id);
  const todas = usePlaylists();
  const assistidos = useAssistidos(eu.id) || {};
  const playlists = useMemo(() => {
    if (!todas || plano === undefined) return null;
    const materias = plano ? plano.materias.filter((m) => m.ativa !== false).map((m) => m.materiaId) : null;
    return todas.filter((pl) => playlistVisivelPara(pl, plano?.modeloId || null, materias));
  }, [todas, plano]);
  return { playlists, assistidos, aluno: aluno || eu };
}

function CartaoPlaylist({ playlist, assistidos }) {
  const p = progressoPlaylist(playlist, assistidos);
  return (
    <Link to={playlist.id} className="cartao-curso">
      <CapaPlaylist playlist={playlist} />
      <div className="cartao-curso-corpo">
        <strong>{playlist.titulo}</strong>
        <span className="pilula" style={{ "--cor": playlist.cor }}>{p.total} {p.total === 1 ? "aula" : "aulas"}</span>
        <span className="cartao-curso-meta"><b className="num">{p.feitos} de {p.total}</b> aulas concluídas</span>
        <div className="cartao-curso-barra">
          <Barra valor={p.pct} cor={playlist.cor} />
          <span className="num">{p.pct}%</span>
        </div>
      </div>
    </Link>
  );
}

export function CursosAluno() {
  const { playlists, assistidos, aluno } = usePlaylistsDoAluno();
  const t = useFrases(aluno);
  const [params, setParams] = useSearchParams();
  if (!playlists) return <Carregando />;
  const categoria = params.get("categoria") || "todas";
  const usadas = CATEGORIAS_PLAYLIST.filter((c) => playlists.some((pl) => pl.categoria === c.id));
  const lista = categoria === "todas" ? playlists : playlists.filter((pl) => pl.categoria === categoria);

  return (
    <>
      <TituloPagina eyebrow="Aulas do seu professor" frase={t("painel.cursos.titulo")} />
      {usadas.length > 1 && (
        <div className="filtros" role="tablist" aria-label="Categorias">
          {[{ id: "todas", nome: "Todas" }, ...usadas].map((c) => (
            <button key={c.id} type="button" role="tab" aria-selected={categoria === c.id} className="filtro"
              onClick={() => setParams(c.id === "todas" ? {} : { categoria: c.id })}>{c.nome}</button>
          ))}
        </div>
      )}
      {lista.length === 0 ? (
        <div className="cartao"><Vazio icone={Video} titulo="Nenhum curso publicado ainda" texto="Quando o professor publicar uma playlist, ela aparece aqui." /></div>
      ) : (
        <div className="grade-cursos">
          {lista.map((pl) => <CartaoPlaylist key={pl.id} playlist={pl} assistidos={assistidos} />)}
        </div>
      )}
    </>
  );
}

export function PlaylistAluno() {
  const { id } = useParams();
  const { s, usuario } = useApp();
  const { playlists, assistidos } = usePlaylistsDoAluno();
  const { executar, erro } = useAcao();
  const playlist = playlists?.find((pl) => pl.id === id);
  const [videoId, setVideoId] = useState(null);
  const topo = useRef(null);
  const atual = useMemo(() => {
    if (!playlist) return null;
    return playlist.videos.find((v) => v.id === videoId) || playlist.videos.find((v) => !assistidos[v.id]) || playlist.videos[0];
  }, [playlist, videoId, assistidos]);

  if (!playlists) return <Carregando />;
  if (!playlist) return <Navigate to=".." relative="path" replace />;
  const p = progressoPlaylist(playlist, assistidos);
  const idx = atual ? playlist.videos.indexOf(atual) : -1;
  const proximo = playlist.videos[idx + 1];

  const marcar = (video, valor) => executar(() => s.playlists.marcarAssistido(usuario.uid, video.id, valor));
  const abrir = (v) => {
    setVideoId(v.id);
    topo.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const concluirEAvancar = () => {
    marcar(atual, true);
    if (proximo) abrir(proximo);
  };

  return (
    <>
      <Link to=".." relative="path" className="voltar"><ArrowLeft aria-hidden="true" />Todos os cursos</Link>
      <header className="cabeca-playlist" ref={topo}>
        <div>
          <span className="eyebrow">{nomeCategoria(playlist.categoria)}</span>
          <h1>{playlist.titulo}</h1>
          {playlist.descricao && <p>{playlist.descricao}</p>}
        </div>
        <div className="progresso-dia">
          <div className="num">{p.feitos} de {p.total} aulas concluídas</div>
          <Barra valor={p.pct} cor={playlist.cor} />
        </div>
      </header>

      <MensagemErro erro={erro} />
      <section className="palco" aria-label="Aula atual">
        <PlayerVideo video={atual} aoTerminar={() => atual && !assistidos[atual.id] && concluirEAvancar()} />
        {atual && (
          <div className="palco-info">
            <div>
              <span className="eyebrow">Aula {idx + 1} de {p.total}{atual.duracao ? ` · ${atual.duracao}` : ""}</span>
              <h2>{atual.titulo}</h2>
              {atual.descricao && <p>{atual.descricao}</p>}
            </div>
            <div className="palco-acoes">
              {assistidos[atual.id]
                ? <Botao variante="vidro" icone={Check} onClick={() => marcar(atual, false)}>Concluída</Botao>
                : <Botao variante="solido" icone={Check} onClick={concluirEAvancar}>{proximo ? "Concluir e ir para a próxima" : "Marcar como concluída"}</Botao>}
              {proximo && assistidos[atual.id] && <Botao variante="vidro" icone={ChevronRight} onClick={() => abrir(proximo)}>Próxima aula</Botao>}
            </div>
          </div>
        )}
      </section>

      <h2 className="subtitulo">Aulas</h2>
      <div className="grade-aulas">
        {playlist.videos.map((v, i) => {
          const feito = !!assistidos[v.id];
          return (
            <article key={v.id} className={`aula${atual?.id === v.id ? " aula--atual" : ""}`}>
              <button type="button" className="aula-abrir" onClick={() => abrir(v)} aria-label={`Assistir ${v.titulo}`}>
                <MiniaturaVideo video={v} playlist={playlist} numero={i + 1} />
              </button>
              <div className="aula-corpo">
                <strong>{v.titulo}</strong>
                <span className="aula-meta"><span className="etiqueta">Aula</span>{v.duracao && <span className="num">{v.duracao}</span>}</span>
                <Relevancia id={v.relevancia} />
                <label className="concluido">
                  <input type="checkbox" checked={feito} onChange={(e) => marcar(v, e.target.checked)} />
                  Concluído
                </label>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
