import { useMemo, useState } from "react";
import { Eye, EyeOff, FileUp, Library, Pencil, Plus, Trash2 } from "lucide-react";
import { useApp } from "../../state/AppContext.jsx";
import { errosDeCampo, useAcao, useMateriais, useModelos } from "../../state/hooks.js";
import { PDF_MAX_MB, fmtTamanho } from "../../core/validacao.js";
import { TIPOS_MATERIAL } from "../../services/materiais.js";
import { BarraFiltros, useFiltros } from "../../ui/Filtros.jsx";
import { SeletorConteudo, SeletorProgramas } from "../../ui/Conteudo.jsx";
import { Botao, Campo, Carregando, Confirmar, Dialogo, MensagemErro, TituloPagina, Vazio } from "../../ui/ui.jsx";
import { AbrirPdf, CartaoMaterial, filtrarMateriais } from "../aluno/Materiais.jsx";

const ESTADOS = { validando: "Conferindo o arquivo…", enviando: "Enviando", salvando: "Salvando…", pronto: "Pronto." };

function FormMaterial({ material, aoFechar, programas }) {
  const { s, hoje } = useApp();
  const [f, setF] = useState(() => ({
    titulo: material?.titulo || "", descricao: material?.descricao || "", materiaId: material?.materiaId || "", topicoId: material?.topicoId || "",
    subtopicoId: material?.subtopicoId || "", programaIds: material?.programaIds || [], tipo: material?.tipo || "resumo",
    data: material?.data || hoje, tags: (material?.tags || []).join(", "), publicado: material?.publicado !== false,
  }));
  const [arquivo, setArquivo] = useState(null);
  const [estado, setEstado] = useState(null); // { e, p }
  const { executar, ocupado, erro } = useAcao();
  const erros = errosDeCampo(erro);
  const salvar = () => executar(async () => {
    await s.materiais.salvar({ ...(material ? { id: material.id } : {}), ...f }, { arquivo, aoEstado: (e, p) => setEstado({ e, p }) });
    aoFechar();
  }).finally(() => setEstado((x) => (x?.e === "pronto" ? x : null)));

  return (
    <Dialogo aberto aoFechar={aoFechar} titulo={material ? "Editar material" : "Novo material"} largura={600}>
      <div className="form">
        <div className="campo">
          <span>Arquivo PDF {material ? "(opcional: troca o atual)" : ""}</span>
          <label className="soltar soltar--compacto">
            <FileUp aria-hidden="true" />
            <strong>{arquivo ? `${arquivo.name} · ${fmtTamanho(arquivo.size)}` : material?.arquivo ? `Atual: ${material.arquivo.nome}` : `Escolher PDF (até ${PDF_MAX_MB} MB)`}</strong>
            <input type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(e) => {
              const a = e.target.files?.[0] || null;
              setArquivo(a);
              if (a && !f.titulo) setF({ ...f, titulo: a.name.replace(/\.pdf$/i, "").replace(/[-_]+/g, " ") });
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
        <Campo rotulo="Título" erro={erros.titulo}><input className="entrada" value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} /></Campo>
        <Campo rotulo="Descrição (opcional)"><textarea className="entrada" rows={2} value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} /></Campo>
        <div className="form-linha">
          <Campo rotulo="Tipo" erro={erros.tipo}>
            <select className="entrada" value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>
              {TIPOS_MATERIAL.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Data" erro={erros.data}><input className="entrada" type="date" value={f.data} onChange={(e) => setF({ ...f, data: e.target.value })} /></Campo>
        </div>
        <SeletorConteudo valor={f} erros={erros} obrigatorio={{}} aoMudar={(v) => setF({ ...f, ...v })} />
        <SeletorProgramas programas={programas} valor={f.programaIds} aoMudar={(programaIds) => setF({ ...f, programaIds })} />
        <Campo rotulo="Tags (opcional)" ajuda="Separadas por vírgula."><input className="entrada" value={f.tags} placeholder="citologia, membrana" onChange={(e) => setF({ ...f, tags: e.target.value })} /></Campo>
        <label className="checagem"><input type="checkbox" checked={f.publicado} onChange={(e) => setF({ ...f, publicado: e.target.checked })} />Publicado (os alunos veem)</label>
        {!Object.keys(erros).length && <MensagemErro erro={erro} />}
        <div className="dialogo-acoes">
          <Botao variante="vidro" onClick={aoFechar}>Cancelar</Botao>
          <Botao variante="solido" disabled={ocupado} onClick={salvar}>{ocupado ? "Enviando…" : material ? "Salvar" : "Publicar material"}</Botao>
        </div>
      </div>
    </Dialogo>
  );
}

export default function MateriaisModerador() {
  const { s } = useApp();
  const materiais = useMateriais();
  const jornadas = useModelos() || [];
  const programas = jornadas.filter((m) => !m.arquivado);
  const filtros = useFiltros();
  const [form, setForm] = useState(null); // "novo" | material
  const [apagar, setApagar] = useState(null);
  const { executar, ocupado, erro } = useAcao();
  const lista = useMemo(() => (materiais ? filtrarMateriais(materiais, filtros.f) : []), [materiais, filtros.f]);
  if (!materiais) return <Carregando />;
  return (
    <>
      <TituloPagina eyebrow="Conteúdo" frase="*Materiais* em PDF"
        texto="Blocos em PDF por matéria, tópico e subtópico. Marque os programas (jornadas) que devem ver; sem marcar, vale para todos."
        direita={<Botao variante="solido" icone={Plus} onClick={() => setForm("novo")}>Novo material</Botao>} />
      <BarraFiltros filtros={filtros} campos={["busca", "conteudo", "programa", "tipo"]} tipos={TIPOS_MATERIAL} programas={programas} rotuloBusca="Buscar por título ou tag" />
      <MensagemErro erro={erro} />
      {lista.length === 0
        ? <div className="cartao"><Vazio icone={Library} titulo={materiais.length ? "Nenhum material com esses filtros" : "Nenhum material ainda"} texto={materiais.length ? null : "Envie o primeiro PDF."} /></div>
        : (
          <div className="grade-materiais">
            {lista.map((m) => (
              <CartaoMaterial key={m.id} m={m} programas={jornadas} acoes={(
                <span className="linha-video-acoes">
                  <AbrirPdf arquivo={m.arquivo} rotulo="Abrir" />
                  <button type="button" className="icone-btn" title={m.publicado === false ? "Publicar" : "Despublicar"} aria-label={m.publicado === false ? `Publicar ${m.titulo}` : `Despublicar ${m.titulo}`} disabled={ocupado}
                    onClick={() => executar(() => s.materiais.salvar({ ...m, tags: m.tags, publicado: m.publicado === false }))}>{m.publicado === false ? <Eye /> : <EyeOff />}</button>
                  <button type="button" className="icone-btn" aria-label={`Editar ${m.titulo}`} onClick={() => setForm(m)}><Pencil /></button>
                  <button type="button" className="icone-btn" aria-label={`Apagar ${m.titulo}`} onClick={() => setApagar(m)}><Trash2 /></button>
                </span>
              )} />
            ))}
          </div>
        )}
      {form && <FormMaterial material={form === "novo" ? null : form} programas={programas} aoFechar={() => setForm(null)} />}
      <Confirmar aberto={!!apagar} titulo="Apagar material" rotulo="Apagar" perigo ocupado={ocupado} erro={erro} aoFechar={() => setApagar(null)}
        aoConfirmar={() => executar(async () => { await s.materiais.remover(apagar.id); setApagar(null); })}>
        <p className="texto-dialogo">O PDF <b>{apagar?.arquivo?.nome}</b> sai do armazenamento e os alunos deixam de ver o material.</p>
      </Confirmar>
    </>
  );
}
