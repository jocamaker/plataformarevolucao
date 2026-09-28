import { ImageIcon } from "lucide-react";
import { useAluno, useArquivoUrl, useBoasVindas, useEu, useFrases } from "../state/hooks.js";
import { BOAS_VINDAS_PADRAO } from "../data/semente.js";
import { Carregando, TituloPagina } from "../ui/ui.jsx";

function Foto({ refArquivo, legenda }) {
  const { url, carregando } = useArquivoUrl(refArquivo);
  if (carregando) return <Carregando />;
  return url ? <figure className="bloco-foto"><img src={url} alt={legenda || ""} /></figure> : <div className="cartao vazio"><ImageIcon aria-hidden="true" /></div>;
}

export function Bloco({ bloco }) {
  switch (bloco.tipo) {
    case "titulo": return <h2 className="bloco-titulo">{bloco.texto}</h2>;
    case "texto": return <p className="bloco-texto">{bloco.texto}</p>;
    case "divisor": return <div className="bloco-divisor" />;
    case "foto": return <Foto refArquivo={bloco.url} legenda={bloco.legenda} />;
    case "destaque":
      return (
        <div className="bloco-destaque">
          {(bloco.itens || []).map((d) => (
            <div key={d.label} className="stat-cartao"><strong>{d.valor}</strong><span>{d.label}</span></div>
          ))}
        </div>
      );
    default: return null;
  }
}

export function AvatarProfessor({ hero }) {
  const { url } = useArquivoUrl(hero.foto);
  return <span className="avatar" style={{ "--cor": hero.cor }}>{url ? <img src={url} alt="" /> : (hero.nome || "?").charAt(0)}</span>;
}

/* Página de boas-vindas dentro da plataforma (o conteúdo é do moderador). */
export function BoasVindasPagina() {
  const eu = useEu();
  const aluno = useAluno(eu.id);
  const conteudo = useBoasVindas();
  const t = useFrases(aluno || eu);
  if (conteudo === undefined) return <Carregando />;
  const { hero = {}, blocos = [] } = conteudo || BOAS_VINDAS_PADRAO;
  return (
    <>
      <TituloPagina eyebrow={hero.nome} frase={t("painel.boasvindas.titulo")} />
      <div className="cartao professor">
        <AvatarProfessor hero={hero} />
        <div>
          <span className="eyebrow">Seus professores</span>
          <strong>{hero.nome}</strong>
          {hero.subtitulo && <p>{hero.subtitulo}</p>}
        </div>
      </div>
      <div className="cartao blocos">
        {blocos.map((b) => <Bloco key={b.id} bloco={b} />)}
      </div>
    </>
  );
}
