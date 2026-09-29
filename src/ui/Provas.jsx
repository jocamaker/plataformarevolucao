/* Cartão de prova para simulado: o recorte da capa do caderno em cima e,
   embaixo, o nome da prova, o exame e (para o aluno) o resultado dele. */

import { FileText } from "lucide-react";
import { useApp } from "../state/AppContext.jsx";
import { useArquivoUrl } from "../state/hooks.js";

export function CapaProva({ prova, src }) {
  const { ind } = useApp();
  const { url } = useArquivoUrl(src ? null : prova.capa?.ref);
  const imagem = src || url;
  if (imagem) return <div className="capa-prova"><img src={imagem} alt="" loading="lazy" /></div>;
  // sem capa: um cartão na cor do vestibular
  const v = ind?.vestibular(prova.vestibularId);
  return (
    <div className="capa-prova capa-prova--gerada" style={{ "--cor": v?.cor || "var(--acento)" }} aria-hidden="true">
      <FileText />
      <span>{v?.nome || "Prova"}{prova.ano ? ` · ${prova.ano}` : ""}</span>
    </div>
  );
}

// abrir: a capa leva ao PDF quando `urlPdf` existe
export function CartaoProva({ prova, urlPdf, resultado, selo, acoes }) {
  const { ind } = useApp();
  const capa = <CapaProva prova={prova} />;
  return (
    <article className="cartao-prova">
      {urlPdf ? <a href={urlPdf} target="_blank" rel="noreferrer" aria-label={`Abrir a prova ${prova.titulo}`}>{capa}</a> : capa}
      <div className="cartao-prova-corpo">
        <strong className="cartao-prova-titulo">{prova.titulo}</strong>
        <div className="cartao-prova-rodape">
          <span>
            Exame: <b>{ind?.nomeVestibular(prova.vestibularId) || "—"}</b>
            {prova.ano ? <><br />Ano: <b>{prova.ano}</b></> : null}
          </span>
          {resultado ? <span className="nota-cartao"><small>Seu resultado</small><b>{resultado}</b></span> : selo}
        </div>
        {acoes}
      </div>
    </article>
  );
}
