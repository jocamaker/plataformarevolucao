/* Materiais do moderador: as áreas (blocos coloridos que o aluno vê) e, dentro
   de cada uma, as listas e PDFs, cada um ligado à matéria, ao tópico e ao
   subtópico. */

import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Eye, EyeOff, FileUp, Layers, Library, Pencil, Plus, Trash2 } from "lucide-react";
import { useApp } from "../../state/AppContext.jsx";
import { errosDeCampo, useAcao, useAreasMateriais, useMateriais, useModelos } from "../../state/hooks.js";
import { PDF_MAX_MB, fmtTamanho } from "../../core/validacao.js";
import { AREA_DA_MATERIA, CORES_AREA, ICONES_AREA as IDS_ICONES, TIPOS_MATERIAL } from "../../services/materiais.js";
import { AREA_OUTROS, BotaoAbrirPdf, CartaoLista, IconeArea, TileArea } from "../../ui/Areas.jsx";
import { BarraFiltros, useFiltros } from "../../ui/Filtros.jsx";
import { SeletorConteudo, SeletorProgramas, nomesDosProgramas } from "../../ui/Conteudo.jsx";
import { Botao, Campo, Carregando, Confirmar, Dialogo, MensagemErro, TituloPagina, Vazio } from "../../ui/ui.jsx";
import { agruparPorArea, filtrarMateriais } from "../aluno/Materiais.jsx";

const ESTADOS = { validando: "Conferindo o arquivo…", enviando: "Enviando", salvando: "Salvando…", pronto: "Pronto." };

/* ---------- Área ---------- */

function FormArea({ area, aoFechar, aoCriar }) {
  const { s, ind } = useApp();
  const [f, setF] = useState(() => ({
    rotulo: area?.rotulo ?? "Listas de", nome: area?.nome || "", materiaId: area?.materiaId || "",
    cor: area?.cor || CORES_AREA[0].cor, icone: area?.icone || "livro",
  }));
  const { executar, ocupado, erro } = useAcao();
  const erros = errosDeCampo(erro);
  // escolher a matéria sugere nome, ícone e cor (dá para trocar depois)
  const escolherMateria = (materiaId) => {
    const sugestao = AREA_DA_MATERIA[materiaId];
    setF((x) => ({ ...x, materiaId, ...(materiaId && !area ? { nome: x.nome || ind.nomeMateria(materiaId), ...(sugestao || {}) } : {}) }));
  };
  const salvar = () => executar(async () => {
    const id = await s.materiais.salvarArea({ ...(area ? { id: area.id } : {}), ...f });
    aoFechar();
    if (!area) aoCriar?.(id);
  });
  return (
    <Dialogo aberto aoFechar={aoFechar} titulo={area ? "Editar área" : "Nova área"} largura={620}>
      <div className="form-area">
        <div className="form">
          <Campo rotulo="Matéria (opcional)" ajuda="Sugere o nome, o ícone e a cor.">
            <select className="entrada" value={f.materiaId} onChange={(e) => escolherMateria(e.target.value)}>
              <option value="">Nenhuma (área geral)</option>
              {ind.materias.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
            </select>
          </Campo>
          <div className="form-linha">
            <Campo rotulo="Linha de cima"><input className="entrada" value={f.rotulo} placeholder="Listas de" onChange={(e) => setF({ ...f, rotulo: e.target.value })} /></Campo>
            <Campo rotulo="Nome" erro={erros.nome}><input className="entrada" value={f.nome} placeholder="Física" onChange={(e) => setF({ ...f, nome: e.target.value })} /></Campo>
          </div>
          <div className="campo">
            <span>Cor</span>
            <div className="cores">
              {CORES_AREA.map((c) => (
                <button key={c.cor} type="button" className="cor-amostra" style={{ background: c.cor }} aria-label={c.nome} title={c.nome}
                  aria-pressed={f.cor.toLowerCase() === c.cor.toLowerCase()} onClick={() => setF({ ...f, cor: c.cor })} />
              ))}
              <input type="color" className="entrada cor-livre" value={f.cor} aria-label="Outra cor" onChange={(e) => setF({ ...f, cor: e.target.value })} />
            </div>
          </div>
          <div className="campo">
            <span>Ícone</span>
            <div className="icones-area" role="radiogroup" aria-label="Ícone">
              {IDS_ICONES.map((i) => (
                <button key={i} type="button" role="radio" aria-checked={f.icone === i} aria-label={i} className="icone-btn" onClick={() => setF({ ...f, icone: i })}>
                  <IconeArea icone={i} />
                </button>
              ))}
            </div>
          </div>
          {!Object.keys(erros).length && <MensagemErro erro={erro} />}
        </div>
        <div className="form-area-previa" aria-label="Prévia"><TileArea area={{ ...f, nome: f.nome || "Nome da área" }} /></div>
      </div>
      <div className="dialogo-acoes">
        <Botao variante="vidro" onClick={aoFechar}>Cancelar</Botao>
        <Botao variante="solido" disabled={ocupado} onClick={salvar}>{area ? "Salvar" : "Criar área"}</Botao>
      </div>
    </Dialogo>
  );
}

/* ---------- Material ---------- */

function FormMaterial({ material, areaPadrao, areas, programas, aoFechar }) {
  const { s, hoje } = useApp();
  const [f, setF] = useState(() => ({
    titulo: material?.titulo || "", descricao: material?.descricao || "",
    // novo material dentro de uma área de matéria já nasce com a matéria dela
    materiaId: material ? material.materiaId || "" : areas.find((a) => a.id === areaPadrao)?.materiaId || "", topicoId: material?.topicoId || "",
    subtopicoId: material?.subtopicoId || "", programaIds: material?.programaIds || [], tipo: material?.tipo || "lista",
    data: material?.data || hoje, tags: (material?.tags || []).join(", "), publicado: material?.publicado !== false,
    areaId: material ? material.areaId || "" : areaPadrao || "", questoes: material?.questoes ?? "",
  }));
  const [arquivo, setArquivo] = useState(null);
  const [estado, setEstado] = useState(null); // { e, p }
  const { executar, ocupado, erro } = useAcao();
  const erros = errosDeCampo(erro);
  const area = areas.find((a) => a.id === f.areaId);
  const salvar = () => executar(async () => {
    await s.materiais.salvar({ ...(material ? { id: material.id } : {}), ...f }, { arquivo, aoEstado: (e, p) => setEstado({ e, p }) });
    aoFechar();
  }).finally(() => setEstado((x) => (x?.e === "pronto" ? x : null)));
  // a área da matéria sugere a matéria do material
  const trocarArea = (areaId) => {
    const nova = areas.find((a) => a.id === areaId);
    setF((x) => ({ ...x, areaId, ...(nova?.materiaId && !x.materiaId ? { materiaId: nova.materiaId, topicoId: "", subtopicoId: "" } : {}) }));
  };

  return (
    <Dialogo aberto aoFechar={aoFechar} titulo={material ? "Editar material" : "Novo material"} largura={620}>
      <div className="form">
        <div className="campo">
          <span>Arquivo PDF {material ? "(opcional: troca o atual)" : ""}</span>
          <label className="soltar soltar--compacto">
            <FileUp aria-hidden="true" />
            <strong>{arquivo ? `${arquivo.name} · ${fmtTamanho(arquivo.size)}` : material?.arquivo ? `Atual: ${material.arquivo.nome}` : `Escolher PDF (até ${PDF_MAX_MB} MB)`}</strong>
            <input type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(e) => {
              const a = e.target.files?.[0] || null;
              setArquivo(a);
              if (a && !f.titulo) setF((x) => ({ ...x, titulo: a.name.replace(/\.pdf$/i, "").replace(/[-_]+/g, " ") }));
            }} />
          </label>
          {erros.arquivo && <small className="campo-erro" role="alert">{erros.arquivo}</small>}
          {estado && (
            <div className="progresso-envio" role="status">
              {estado.e === "enviando" && <span style={{ width: `${Math.round((estado.p || 0) * 100)}%` }} />}
              {ESTADOS[estado.e]}{estado.e === "enviando" ? ` ${Math.round((estado.p || 0) * 100)}%` : ""}
            </div>
          )}
        </div>
        <div className="form-linha">
          <Campo rotulo="Área" erro={erros.areaId}>
            <select className="entrada" value={f.areaId} onChange={(e) => trocarArea(e.target.value)}>
              <option value="">Sem área (Outros materiais)</option>
              {areas.map((a) => <option key={a.id} value={a.id}>{[a.rotulo, a.nome].filter(Boolean).join(" ")}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Tipo" erro={erros.tipo}>
            <select className="entrada" value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>
              {TIPOS_MATERIAL.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </select>
          </Campo>
        </div>
        <Campo rotulo="Título" erro={erros.titulo}><input className="entrada" value={f.titulo} placeholder="Ex.: Eletrostática" onChange={(e) => setF({ ...f, titulo: e.target.value })} /></Campo>
        <Campo rotulo="Descrição (opcional)" ajuda="Sem descrição, o cartão mostra o tópico e o subtópico.">
          <textarea className="entrada" rows={2} value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} />
        </Campo>
        <SeletorConteudo valor={f} erros={erros} obrigatorio={{}} aoMudar={(v) => setF({ ...f, ...v })} />
        <div className="form-linha">
          <Campo rotulo="Questões na lista (opcional)" erro={erros.questoes}>
            <input className="entrada num" type="number" min="1" value={f.questoes} placeholder="24" onChange={(e) => setF({ ...f, questoes: e.target.value })} />
          </Campo>
          <Campo rotulo="Data" erro={erros.data}><input className="entrada" type="date" value={f.data} onChange={(e) => setF({ ...f, data: e.target.value })} /></Campo>
        </div>
        <SeletorProgramas programas={programas} valor={f.programaIds} aoMudar={(programaIds) => setF({ ...f, programaIds })} />
        <Campo rotulo="Tags (opcional)" ajuda="Separadas por vírgula."><input className="entrada" value={f.tags} placeholder="citologia, membrana" onChange={(e) => setF({ ...f, tags: e.target.value })} /></Campo>
        <label className="checagem"><input type="checkbox" checked={f.publicado} onChange={(e) => setF({ ...f, publicado: e.target.checked })} />Publicado (os alunos veem)</label>
        {area && <p className="previa-linha">Vai aparecer em <b>{[area.rotulo, area.nome].filter(Boolean).join(" ")}</b>.</p>}
        {!Object.keys(erros).length && <MensagemErro erro={erro} />}
        <div className="dialogo-acoes">
          <Botao variante="vidro" onClick={aoFechar}>Cancelar</Botao>
          <Botao variante="solido" disabled={ocupado} onClick={salvar}>{ocupado ? "Enviando…" : material ? "Salvar" : "Publicar material"}</Botao>
        </div>
      </div>
    </Dialogo>
  );
}

function useDados() {
  const materiais = useMateriais();
  const areas = useAreasMateriais();
  const jornadas = useModelos() || [];
  return { materiais, areas, jornadas, programas: jornadas.filter((m) => !m.arquivado) };
}

/* ---------- Todas as áreas ---------- */

export default function MateriaisModerador() {
  const { s } = useApp();
  const navigate = useNavigate();
  const { materiais, areas } = useDados();
  const [nova, setNova] = useState(false);
  const { executar, ocupado, erro } = useAcao();
  if (!materiais || !areas) return <Carregando />;
  const grupos = agruparPorArea(materiais, areas);
  const contagem = (id) => { const n = grupos[id]?.length || 0; return n ? `${n} ${n === 1 ? "material" : "materiais"}` : "vazia"; };

  return (
    <>
      <TituloPagina eyebrow="Conteúdo" frase="*Materiais* por área"
        texto="Cada área é um bloco que o aluno vê em Materiais (ex.: Listas de Física). Dentro dela ficam as listas e PDFs, cada um ligado ao tópico."
        direita={<Botao variante="solido" icone={Plus} onClick={() => setNova(true)}>Nova área</Botao>} />
      <MensagemErro erro={erro} />
      {areas.length === 0 && (
        <div className="cartao">
          <Vazio icone={Layers} titulo="Nenhuma área ainda" texto="Crie uma área por matéria de uma vez (Listas de Biologia, Listas de Física…) ou monte as suas. Os materiais que já existem entram na área da matéria deles." />
          <Botao variante="solido" icone={Layers} disabled={ocupado} onClick={() => executar(() => s.materiais.criarAreasDasMaterias())}>Criar as áreas das matérias</Botao>
        </div>
      )}
      <div className="grade-areas">
        {areas.map((a) => <TileArea key={a.id} area={a} to={a.id} detalhe={contagem(a.id)} />)}
        {grupos.outros?.length > 0 && <TileArea area={AREA_OUTROS} to={AREA_OUTROS.id} detalhe={contagem(AREA_OUTROS.id)} />}
        {areas.length > 0 && <button type="button" className="tile-area tile-area--nova" onClick={() => setNova(true)}><Plus aria-hidden="true" /><strong>Nova área</strong></button>}
      </div>
      {nova && <FormArea aoFechar={() => setNova(false)} aoCriar={(id) => navigate(id)} />}
    </>
  );
}

/* ---------- Uma área ---------- */

export function AreaMateriaisModerador() {
  const { areaId } = useParams();
  const { s } = useApp();
  const navigate = useNavigate();
  const { materiais, areas, jornadas, programas } = useDados();
  const filtros = useFiltros();
  const [form, setForm] = useState(null); // "novo" | material
  const [editarArea, setEditarArea] = useState(false);
  const [apagarArea, setApagarArea] = useState(false);
  const [apagar, setApagar] = useState(null);
  const { executar, ocupado, erro } = useAcao();
  const area = areaId === AREA_OUTROS.id ? AREA_OUTROS : areas?.find((a) => a.id === areaId);
  const lista = useMemo(() => (materiais && areas ? filtrarMateriais(agruparPorArea(materiais, areas)[areaId] || [], filtros.f) : []), [materiais, areas, areaId, filtros.f]);
  if (!materiais || !areas) return <Carregando />;
  if (!area) return <><Link to="/moderador/materiais" className="voltar"><ArrowLeft aria-hidden="true" />Materiais</Link><div className="cartao"><Vazio icone={Library} titulo="Área não encontrada" /></div></>;
  const real = area.id !== AREA_OUTROS.id;

  return (
    <>
      <Link to="/moderador/materiais" className="voltar"><ArrowLeft aria-hidden="true" />Todas as áreas</Link>
      <header className="cabeca-area" style={{ "--cor": area.cor }}>
        <span className="cabeca-area-icone"><IconeArea icone={area.icone} /></span>
        <div>
          {area.rotulo && <span className="eyebrow">{area.rotulo}</span>}
          <h1>{area.nome}</h1>
        </div>
        <div className="titulo-direita">
          {real && <Botao variante="vidro" tamanho="sm" icone={Pencil} onClick={() => setEditarArea(true)}>Editar área</Botao>}
          {real && <Botao variante="texto" tamanho="sm" icone={Trash2} onClick={() => setApagarArea(true)}>Apagar área</Botao>}
          <Botao variante="solido" icone={Plus} onClick={() => setForm("novo")}>Novo material</Botao>
        </div>
      </header>
      <BarraFiltros filtros={filtros} campos={["busca", "conteudo", "programa", "tipo"]} tipos={TIPOS_MATERIAL} programas={programas} rotuloBusca="Buscar por título ou tag" />
      <MensagemErro erro={erro} />
      {lista.length === 0
        ? <div className="cartao"><Vazio icone={Library} titulo={filtros.ativo ? "Nada com esses filtros" : "Nenhum material nesta área"} texto={filtros.ativo ? null : "Use “Novo material” para anexar a primeira lista."} /></div>
        : (
          <div className="grade-listas">
            {lista.map((m) => (
              <CartaoLista key={m.id} m={m} area={area}
                extra={<span className="etiqueta">{nomesDosProgramas(m.programaIds, jornadas)}</span>}
                acoes={(
                  <div className="cartao-lista-acoes">
                    <BotaoAbrirPdf arquivo={m.arquivo} />
                    <span className="linha-video-acoes">
                      <button type="button" className="icone-btn" title={m.publicado === false ? "Publicar" : "Despublicar"} aria-label={m.publicado === false ? `Publicar ${m.titulo}` : `Despublicar ${m.titulo}`} disabled={ocupado}
                        onClick={() => executar(() => s.materiais.salvar({ ...m, publicado: m.publicado === false }))}>{m.publicado === false ? <Eye /> : <EyeOff />}</button>
                      <button type="button" className="icone-btn" aria-label={`Editar ${m.titulo}`} onClick={() => setForm(m)}><Pencil /></button>
                      <button type="button" className="icone-btn" aria-label={`Apagar ${m.titulo}`} onClick={() => setApagar(m)}><Trash2 /></button>
                    </span>
                  </div>
                )} />
            ))}
          </div>
        )}
      {form && <FormMaterial material={form === "novo" ? null : form} areaPadrao={real ? area.id : ""} areas={areas} programas={programas} aoFechar={() => setForm(null)} />}
      {editarArea && <FormArea area={area} aoFechar={() => setEditarArea(false)} />}
      <Confirmar aberto={apagarArea} titulo="Apagar a área" rotulo="Apagar área" perigo ocupado={ocupado} erro={erro} aoFechar={() => setApagarArea(false)}
        aoConfirmar={() => executar(async () => { await s.materiais.removerArea(area.id); setApagarArea(false); navigate("/moderador/materiais"); })}>
        <p className="texto-dialogo">Os materiais desta área não são apagados: passam para “Outros materiais”, onde você pode movê-los para outra área.</p>
      </Confirmar>
      <Confirmar aberto={!!apagar} titulo="Apagar material" rotulo="Apagar" perigo ocupado={ocupado} erro={erro} aoFechar={() => setApagar(null)}
        aoConfirmar={() => executar(async () => { await s.materiais.remover(apagar.id); setApagar(null); })}>
        <p className="texto-dialogo">O PDF <b>{apagar?.arquivo?.nome}</b> sai do armazenamento e os alunos deixam de ver o material.</p>
      </Confirmar>
    </>
  );
}
