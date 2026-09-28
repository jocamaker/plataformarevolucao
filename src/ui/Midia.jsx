import { ExternalLink, PlayCircle, VideoOff } from "lucide-react";
import { CATEGORIAS_PLAYLIST } from "../core/nucleo.js";
import { analisarLink, RELEVANCIAS } from "../midia.js";
import { useArquivoUrl } from "../state/hooks.js";

export const nomeCategoria = (id) => CATEGORIAS_PLAYLIST.find((c) => c.id === id)?.nome || "Outros cursos";

/* Capa da playlist: a imagem enviada pelo moderador ou um bloco na cor da
   playlist com o título (no espírito das capas por matéria). */
export function CapaPlaylist({ playlist, grande = false }) {
  const { url } = useArquivoUrl(playlist.capa);
  if (url) return <div className="capa"><img src={url} alt="" /></div>;
  return (
    <div className={`capa capa--gerada${grande ? " capa--grande" : ""}`} style={{ "--cor": playlist.cor }} aria-hidden="true">
      <span className="capa-categoria">{nomeCategoria(playlist.categoria)}</span>
      <strong>{playlist.titulo}</strong>
      <PlayCircle className="capa-icone" />
    </div>
  );
}

export function MiniaturaVideo({ video, playlist, numero }) {
  const capaLink = video.fonte === "link" ? analisarLink(video.url)?.capa : null;
  const { url: capaArquivo } = useArquivoUrl(video.capa);
  const imagem = capaArquivo || capaLink;
  return (
    <div className="miniatura" style={{ "--cor": playlist.cor }} aria-hidden="true">
      {imagem ? <img src={imagem} alt="" loading="lazy" /> : (
        <>
          <span className="miniatura-num">{String(numero).padStart(2, "0")}</span>
          <span className="miniatura-lado">
            <small>{playlist.titulo}</small>
            <b>{video.titulo}</b>
          </span>
        </>
      )}
      <PlayCircle className="miniatura-play" />
    </div>
  );
}

export function Relevancia({ id }) {
  const r = RELEVANCIAS.find((x) => x.id === id);
  if (!r) return null;
  return (
    <span className="relevancia" title={`${r.nome} relevância`}>
      <span className="relevancia-barras" aria-hidden="true">
        {RELEVANCIAS.map((x) => <i key={x.id} data-on={x.nivel <= r.nivel} />)}
      </span>
      <span><b>{r.nome}</b> relevância</span>
    </span>
  );
}

function Aviso({ icone: Icone = PlayCircle, titulo, texto, children }) {
  return (
    <div className="player player--aviso">
      <Icone aria-hidden="true" />
      <strong>{titulo}</strong>
      {texto && <p>{texto}</p>}
      {children}
    </div>
  );
}

function ArquivoLocal({ video, aoTerminar }) {
  const { url, carregando, faltando } = useArquivoUrl(video.arquivo);
  if (carregando) return <Aviso titulo="Carregando o vídeo…" />;
  if (faltando || !url) {
    return <Aviso icone={VideoOff} titulo="Vídeo indisponível"
      texto="Não foi possível carregar o arquivo. No modo local (sem servidor), arquivos enviados só tocam no navegador onde foram anexados; links do YouTube, Vimeo ou Drive funcionam em qualquer aparelho." />;
  }
  return <video key={url} className="player" src={url} controls playsInline onEnded={aoTerminar} />;
}

/* Toca o vídeo dentro da plataforma: arquivo enviado, iframe do provedor ou
   arquivo online. Link sem player embutível vira um botão para abrir. */
export function PlayerVideo({ video, aoTerminar }) {
  if (!video) return <Aviso titulo="Esta playlist ainda não tem vídeos" />;
  if (video.fonte === "arquivo") return <ArquivoLocal video={video} aoTerminar={aoTerminar} />;
  if (video.fonte === "link") {
    const link = analisarLink(video.url);
    if (link?.tipo === "iframe") {
      return (
        <iframe key={link.src} className="player" src={link.src} title={video.titulo} loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
          referrerPolicy="strict-origin-when-cross-origin" allowFullScreen />
      );
    }
    if (link?.tipo === "video") return <video key={link.src} className="player" src={link.src} controls playsInline onEnded={aoTerminar} />;
    return (
      <Aviso icone={ExternalLink} titulo={link?.provedor || "Link"} texto="Este endereço não permite tocar aqui dentro.">
        <a className="btn btn--solido btn--sm" href={video.url} target="_blank" rel="noreferrer">Abrir o vídeo</a>
      </Aviso>
    );
  }
  return <Aviso titulo={video.titulo} texto="Esta aula ainda não tem arquivo nem link." />;
}
