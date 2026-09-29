/* Materiais em áreas: o bloco colorido de cada área (ex.: "Listas de Física")
   e o cartão de cada material dentro dela. */

import { Link } from "react-router-dom";
import {
  Atom, BookOpen, Brain, Calculator, Dna, ExternalLink, FileQuestion, FlaskConical, FolderOpen, Globe2, Landmark, Languages, ListChecks, PenLine, Users,
} from "lucide-react";
import { useApp } from "../state/AppContext.jsx";
import { useArquivoUrl } from "../state/hooks.js";
import { AREA_DA_MATERIA, nomeTipoMaterial } from "../services/materiais.js";
import { NomeConteudo } from "./Conteudo.jsx";

export const ICONES_AREA = {
  calculadora: Calculator, atomo: Atom, dna: Dna, frasco: FlaskConical, idiomas: Languages, cerebro: Brain,
  pessoas: Users, globo: Globe2, coluna: Landmark, livro: BookOpen, caneta: PenLine, lista: ListChecks,
};

// materiais sem área (ou de uma área apagada) ficam juntos aqui
export const AREA_OUTROS = { id: "outros", nome: "Outros materiais", rotulo: "", cor: "#64748B", icone: "livro" };

export function IconeArea({ icone, ...resto }) {
  const Icone = ICONES_AREA[icone] || FolderOpen;
  return <Icone aria-hidden="true" {...resto} />;
}

/* O bloco da área: ícone grande, "LISTAS DE" pequeno e o nome em destaque. */
export function TileArea({ area, detalhe, to, onClick }) {
  const conteudo = (
    <>
      <span className="tile-area-icone"><IconeArea icone={area.icone} strokeWidth={1.6} /></span>
      {area.rotulo && <span className="tile-area-rotulo">{area.rotulo}</span>}
      <strong className="tile-area-nome">{area.nome}</strong>
      {detalhe && <small className="tile-area-detalhe">{detalhe}</small>}
    </>
  );
  const estilo = { "--cor": area.cor };
  if (to) return <Link to={to} className="tile-area" style={estilo}>{conteudo}</Link>;
  if (onClick) return <button type="button" className="tile-area" style={estilo} onClick={onClick}>{conteudo}</button>;
  return <div className="tile-area" style={estilo}>{conteudo}</div>;
}

// abre o PDF numa aba nova (o visualizador do navegador tem o "baixar")
export function BotaoAbrirPdf({ arquivo, rotulo = "Abrir" }) {
  const { url, carregando, faltando } = useArquivoUrl(arquivo?.ref);
  if (!arquivo) return null;
  if (carregando) return <span className="cartao-lista-acao" aria-busy="true">Carregando…</span>;
  if (faltando || !url) return <span className="cartao-lista-acao cartao-lista-acao--off">Arquivo indisponível neste aparelho</span>;
  return <a className="cartao-lista-acao" href={url} target="_blank" rel="noreferrer"><ExternalLink aria-hidden="true" />{rotulo}</a>;
}

/* Cartão de um material: faixa na cor da área com o ícone, matéria,
   título, orientação (tópico ou descrição), questões e as ações. */
export function CartaoLista({ m, area, extra, acoes }) {
  const { ind } = useApp();
  const sugestao = AREA_DA_MATERIA[m.materiaId];
  const cor = area && area.id !== "outros" ? area.cor : sugestao?.cor || area?.cor || "#64748B";
  const icone = area && area.id !== "outros" ? area.icone : sugestao?.icone || "livro";
  return (
    <article className="cartao-lista" style={{ "--cor": cor }}>
      <div className="cartao-lista-faixa"><IconeArea icone={icone} /></div>
      <div className="cartao-lista-corpo">
        {m.materiaId && <span className="cartao-lista-materia">{ind.nomeMateria(m.materiaId)}</span>}
        <h3>{m.titulo}</h3>
        <p className="cartao-lista-desc">
          {m.descricao || (m.topicoId ? <NomeConteudo materiaId={m.materiaId} topicoId={m.topicoId} subtopicoId={m.subtopicoId} semMateria /> : nomeTipoMaterial(m.tipo))}
        </p>
        <div className="cartao-lista-meta">
          {m.questoes ? <span className="cartao-lista-questoes"><FileQuestion aria-hidden="true" />{m.questoes} {m.questoes === 1 ? "questão" : "questões"}</span> : null}
          <span className="etiqueta">{nomeTipoMaterial(m.tipo)}</span>
          {m.publicado === false && <span className="etiqueta etiqueta--perigo">Rascunho</span>}
          {extra}
        </div>
        {acoes}
      </div>
    </article>
  );
}
