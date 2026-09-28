import { useMemo } from "react";
import { FileDown, Library } from "lucide-react";
import { useAluno, useArquivoUrl, useEu, useFrases, useMateriais, usePlano } from "../../state/hooks.js";
import { fmtDataLonga } from "../../core/datas.js";
import { fmtTamanho } from "../../core/validacao.js";
import { TIPOS_MATERIAL, nomeTipoMaterial } from "../../services/materiais.js";
import { BarraFiltros, useFiltros } from "../../ui/Filtros.jsx";
import { NomeConteudo, PontoMateria, nomesDosProgramas } from "../../ui/Conteudo.jsx";
import { materialDoPrograma } from "../../midia.js";
import { Carregando, TituloPagina, Vazio } from "../../ui/ui.jsx";

const sem = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function filtrarMateriais(lista, f) {
  const busca = sem(f.busca).trim();
  return lista.filter((m) =>
    (!f.materiaId || m.materiaId === f.materiaId)
    && (!f.topicoId || m.topicoId === f.topicoId)
    && (!f.subtopicoId || m.subtopicoId === f.subtopicoId)
    && (!f.programaId || materialDoPrograma(m, f.programaId))
    && (!f.tipo || m.tipo === f.tipo)
    && (!busca || sem(`${m.titulo} ${m.descricao} ${(m.tags || []).join(" ")}`).includes(busca)));
}

export function AbrirPdf({ arquivo, rotulo = "Abrir PDF" }) {
  const { url, carregando, faltando } = useArquivoUrl(arquivo?.ref);
  if (!arquivo) return null;
  if (carregando) return <span className="btn btn--vidro btn--sm" aria-busy="true">Carregando…</span>;
  if (faltando || !url) return <span className="previa-linha">Arquivo indisponível neste aparelho</span>;
  return <a className="btn btn--solido btn--sm" href={url} target="_blank" rel="noreferrer" download={arquivo.nome}><FileDown aria-hidden="true" />{rotulo}</a>;
}

export function CartaoMaterial({ m, acoes, programas }) {
  return (
    <article className="cartao cartao-material">
      <div className="cartao-material-topo">
        <span className="etiqueta">{nomeTipoMaterial(m.tipo)}</span>
        {programas && <span className="etiqueta">{nomesDosProgramas(m.programaIds, programas)}</span>}
        {m.publicado === false && <span className="etiqueta etiqueta--perigo">Rascunho</span>}
      </div>
      <h3>{m.titulo}</h3>
      {m.materiaId && <p className="celula-conteudo"><PontoMateria materiaId={m.materiaId} /><NomeConteudo materiaId={m.materiaId} topicoId={m.topicoId} subtopicoId={m.subtopicoId} /></p>}
      {m.descricao && <p className="cartao-material-desc">{m.descricao}</p>}
      {m.tags?.length > 0 && <p className="tags">{m.tags.map((t) => <span key={t}>#{t}</span>)}</p>}
      <div className="cartao-material-rodape">
        <small className="num">{fmtDataLonga(m.data)}{m.arquivo?.tamanho ? ` · ${fmtTamanho(m.arquivo.tamanho)}` : ""}</small>
        {acoes || <AbrirPdf arquivo={m.arquivo} />}
      </div>
    </article>
  );
}

/* Materiais do programa (jornada) do aluno, filtráveis por matéria, tópico,
   subtópico e tipo. */
export default function MateriaisAluno() {
  const eu = useEu();
  const aluno = useAluno(eu.id);
  const plano = usePlano(eu.id);
  const materiais = useMateriais();
  const t = useFrases(aluno || eu);
  const filtros = useFiltros();
  const lista = useMemo(() => {
    if (!materiais || plano === undefined) return [];
    return filtrarMateriais(materiais, filtros.f).filter((m) => materialDoPrograma(m, plano?.modeloId || null));
  }, [materiais, filtros.f, plano]);
  if (!materiais || plano === undefined) return <Carregando />;
  return (
    <>
      <TituloPagina eyebrow="PDFs do professor" frase={t("painel.materiais.titulo")} />
      <BarraFiltros filtros={filtros} campos={["busca", "conteudo", "tipo"]} tipos={TIPOS_MATERIAL} rotuloBusca="Buscar por título ou tag" />
      {lista.length === 0
        ? <div className="cartao"><Vazio icone={Library} titulo={filtros.ativo ? "Nenhum material com esses filtros" : "Nenhum material publicado ainda"} texto={filtros.ativo ? "Limpe os filtros para ver todos." : "Quando o professor publicar um PDF, ele aparece aqui."} /></div>
        : <div className="grade-materiais">{lista.map((m) => <CartaoMaterial key={m.id} m={m} />)}</div>}
    </>
  );
}
