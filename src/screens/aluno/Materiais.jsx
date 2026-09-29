import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, FileDown, Library, ListChecks } from "lucide-react";
import { useAreasMateriais, useArquivoUrl, useEu, useFrases, useMateriais, usePlano } from "../../state/hooks.js";
import { TIPOS_MATERIAL } from "../../services/materiais.js";
import { materialDoPrograma } from "../../midia.js";
import { AREA_OUTROS, BotaoAbrirPdf, CartaoLista, IconeArea, TileArea } from "../../ui/Areas.jsx";
import { BarraFiltros, useFiltros } from "../../ui/Filtros.jsx";
import { Botao, Carregando, Dialogo, TituloPagina, Vazio } from "../../ui/ui.jsx";
import { FormQuestoes } from "../comum/Registros.jsx";

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

// materiais agrupados por área; os sem área (ou de área apagada) vão para "outros"
export function agruparPorArea(materiais, areas) {
  const ids = new Set(areas.map((a) => a.id));
  const grupos = {};
  materiais.forEach((m) => { const k = m.areaId && ids.has(m.areaId) ? m.areaId : AREA_OUTROS.id; (grupos[k] ||= []).push(m); });
  return grupos;
}

export function AbrirPdf({ arquivo, rotulo = "Abrir PDF" }) {
  const { url, carregando, faltando } = useArquivoUrl(arquivo?.ref);
  if (!arquivo) return null;
  if (carregando) return <span className="btn btn--vidro btn--sm" aria-busy="true">Carregando…</span>;
  if (faltando || !url) return <span className="previa-linha">Arquivo indisponível neste aparelho</span>;
  return <a className="btn btn--solido btn--sm" href={url} target="_blank" rel="noreferrer" download={arquivo.nome}><FileDown aria-hidden="true" />{rotulo}</a>;
}

// materiais publicados que valem para o programa (jornada) do aluno
function useMateriaisDoAluno() {
  const eu = useEu();
  const plano = usePlano(eu.id);
  const materiais = useMateriais();
  const areas = useAreasMateriais();
  const visiveis = useMemo(() => (materiais && plano !== undefined ? materiais.filter((m) => materialDoPrograma(m, plano?.modeloId || null)) : null), [materiais, plano]);
  return { eu, visiveis, areas };
}

/* Materiais: um bloco por área que tem algo para o aluno. */
export default function MateriaisAluno() {
  const { eu, visiveis, areas } = useMateriaisDoAluno();
  const t = useFrases(eu);
  if (!visiveis || !areas) return <Carregando />;
  const grupos = agruparPorArea(visiveis, areas);
  const blocos = [...areas.filter((a) => grupos[a.id]?.length), ...(grupos.outros?.length ? [AREA_OUTROS] : [])];
  return (
    <>
      <TituloPagina eyebrow="Listas e PDFs do professor" frase={t("painel.materiais.titulo")} texto="Escolha a área para ver as listas e os materiais de cada tópico." />
      {blocos.length === 0
        ? <div className="cartao"><Vazio icone={Library} titulo="Nenhum material publicado ainda" texto="Quando o professor publicar uma lista ou um PDF, ele aparece aqui." /></div>
        : (
          <div className="grade-areas">
            {blocos.map((a) => <TileArea key={a.id} area={a} to={a.id} detalhe={`${grupos[a.id].length} ${grupos[a.id].length === 1 ? "material" : "materiais"}`} />)}
          </div>
        )}
    </>
  );
}

/* Uma área: os materiais dela, com filtros e, para listas, o registro dos acertos. */
export function AreaMateriaisAluno() {
  const { areaId } = useParams();
  const { eu, visiveis, areas } = useMateriaisDoAluno();
  const filtros = useFiltros();
  const [registrar, setRegistrar] = useState(null); // material
  const [retorno, setRetorno] = useState("");
  const area = areaId === AREA_OUTROS.id ? AREA_OUTROS : areas?.find((a) => a.id === areaId);
  const lista = useMemo(() => {
    if (!visiveis || !areas) return [];
    return filtrarMateriais(agruparPorArea(visiveis, areas)[areaId] || [], filtros.f);
  }, [visiveis, areas, areaId, filtros.f]);
  if (!visiveis || !areas) return <Carregando />;
  if (!area) return <><Link to="/aluno/materiais" className="voltar"><ArrowLeft aria-hidden="true" />Materiais</Link><div className="cartao"><Vazio icone={Library} titulo="Área não encontrada" /></div></>;

  return (
    <>
      <Link to="/aluno/materiais" className="voltar"><ArrowLeft aria-hidden="true" />Todas as áreas</Link>
      <header className="cabeca-area" style={{ "--cor": area.cor }}>
        <span className="cabeca-area-icone"><IconeArea icone={area.icone} /></span>
        <div>
          {area.rotulo && <span className="eyebrow">{area.rotulo}</span>}
          <h1>{area.nome}</h1>
        </div>
      </header>
      <BarraFiltros filtros={filtros} campos={["busca", "conteudo", "tipo"]} tipos={TIPOS_MATERIAL} rotuloBusca="Buscar por título ou tag" />
      {lista.length === 0
        ? <div className="cartao"><Vazio icone={Library} titulo="Nada com esses filtros" texto="Limpe os filtros para ver todos." /></div>
        : (
          <div className="grade-listas">
            {lista.map((m) => (
              <CartaoLista key={m.id} m={m} area={area} acoes={(
                <div className="cartao-lista-acoes">
                  <BotaoAbrirPdf arquivo={m.arquivo} rotulo={m.tipo === "lista" ? "Abrir lista" : "Abrir PDF"} />
                  {m.materiaId && m.topicoId && <Botao variante="texto" tamanho="sm" icone={ListChecks} onClick={() => { setRetorno(""); setRegistrar(m); }}>Registrar acertos</Botao>}
                </div>
              )} />
            ))}
          </div>
        )}
      <Dialogo aberto={!!registrar} aoFechar={() => setRegistrar(null)} titulo={registrar ? `Acertos · ${registrar.titulo}` : ""} largura={520}>
        {registrar && (retorno ? (
          <div className="form">
            <p className="retorno" role="status">{retorno}</p>
            <div className="dialogo-acoes"><Botao variante="solido" onClick={() => setRegistrar(null)}>Fechar</Botao></div>
          </div>
        ) : (
          <FormQuestoes alunoId={eu.id} aoConcluir={setRetorno} aoCancelar={() => setRegistrar(null)}
            inicial={{ materiaId: registrar.materiaId, topicoId: registrar.topicoId, subtopicoId: registrar.subtopicoId || "", total: registrar.questoes ?? "" }} />
        ))}
      </Dialogo>
    </>
  );
}
