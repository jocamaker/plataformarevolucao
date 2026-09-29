/* Provas para simulado: o moderador anexa o PDF de cada prova; a capa sai
   sozinha do alto da primeira página (ou de uma imagem enviada). O aluno
   escolhe a prova em Simulados, abre o PDF e registra o resultado. */

import { useEffect, useState } from "react";
import { Eye, EyeOff, FileText, FileUp, ImagePlus, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useApp } from "../../state/AppContext.jsx";
import { errosDeCampo, useAcao, useArquivoUrl, useModelos, useProvas } from "../../state/hooks.js";
import { PDF_MAX_MB, fmtTamanho } from "../../core/validacao.js";
import { capaDoPdf } from "../../state/capaPdf.js";
import { comprimirImagem } from "../../state/arquivos.js";
import { SeletorProgramas, nomesDosProgramas } from "../../ui/Conteudo.jsx";
import { CapaProva, CartaoProva } from "../../ui/Provas.jsx";
import { Botao, Campo, Carregando, Confirmar, Dialogo, MensagemErro, TituloPagina, Vazio } from "../../ui/ui.jsx";

const ESTADOS = { validando: "Conferindo o arquivo…", enviando: "Enviando", salvando: "Salvando…", pronto: "Pronto." };

// "enem-2018_dia2 prova verde.pdf" → "enem 2018 dia2 prova verde"
const tituloDoArquivo = (nome) => nome.replace(/\.pdf$/i, "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
const simples = (t) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// o exame cujo nome aparece no nome do arquivo ("ENEM Medicina" vence "ENEM")
function exameDoArquivo(nome, vestibulares) {
  const alvo = ` ${simples(nome.replace(/\.pdf$/i, "")).replace(/([a-z])(\d)/g, "$1 $2")} `; // "fuvest2024" também
  return [...vestibulares].sort((a, b) => b.nome.length - a.nome.length).find((v) => simples(v.nome) && alvo.includes(` ${simples(v.nome)} `)) || null;
}

// "enem 2018 dia 2 prova verde" → "ENEM 2018 Dia 2 Prova Verde"
function tituloSugerido(nome, exame) {
  const t = tituloDoArquivo(nome).replace(/(^|\s)(\p{L})/gu, (_, e, l) => e + l.toUpperCase());
  if (!exame) return t;
  const palavras = simples(exame.nome).split(" ").map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[\\s/]+");
  return t.replace(new RegExp(`(^|\\s)${palavras}(?=\\s|$)`, "i"), (_, e) => e + exame.nome);
}

function FormProva({ prova, programas, aoFechar }) {
  const { s, ind } = useApp();
  const [f, setF] = useState(() => ({
    titulo: prova?.titulo || "", vestibularId: prova?.vestibularId || "", ano: prova?.ano ?? "", descricao: prova?.descricao || "",
    programaIds: prova?.programaIds || [], publicado: prova?.publicado !== false,
  }));
  const [arquivo, setArquivo] = useState(null);
  const [capa, setCapa] = useState(null); // { blob, url, origem: "pdf" | "imagem" }
  const [gerando, setGerando] = useState(false);
  const [avisoCapa, setAvisoCapa] = useState("");
  const [estado, setEstado] = useState(null);
  const { executar, ocupado, erro } = useAcao();
  const erros = errosDeCampo(erro);
  useEffect(() => () => { if (capa?.url) URL.revokeObjectURL(capa.url); }, [capa]);

  const gerarCapa = async (pdf) => {
    setGerando(true);
    setAvisoCapa("");
    try {
      const blob = await capaDoPdf(pdf);
      setCapa({ blob, url: URL.createObjectURL(blob), origem: "pdf" });
    } catch (e) {
      console.warn("Capa do PDF:", e); // eslint-disable-line no-console
      setAvisoCapa("Não deu para desenhar a capa deste PDF aqui. Envie uma imagem da capa, ou salve assim: o cartão usa a cor do vestibular.");
    } finally { setGerando(false); }
  };
  const escolherPdf = (e) => {
    const a = e.target.files?.[0] || null;
    setArquivo(a);
    if (!a) return;
    const exame = exameDoArquivo(a.name, ind.vestibulares);
    if (!f.titulo) setF((x) => ({ ...x, titulo: tituloSugerido(a.name, exame) }));
    if (exame && !f.vestibularId) setF((x) => ({ ...x, vestibularId: exame.id }));
    const ano = a.name.match(/(19|20)\d{2}/)?.[0];
    if (ano && !f.ano) setF((x) => ({ ...x, ano: Number(ano) }));
    if (!capa || capa.origem === "pdf") gerarCapa(a);
  };
  const escolherImagem = async (e) => {
    const img = e.target.files?.[0];
    e.target.value = "";
    if (!img) return;
    const blob = await comprimirImagem(img, 1280, 0.86);
    setCapa({ blob, url: URL.createObjectURL(blob), origem: "imagem" });
    setAvisoCapa("");
  };
  const salvar = () => executar(async () => {
    await s.provas.salvar({ ...(prova ? { id: prova.id } : {}), ...f }, { arquivo, capa: capa?.blob, aoEstado: (e, p) => setEstado({ e, p }) });
    aoFechar();
  }).finally(() => setEstado((x) => (x?.e === "pronto" ? x : null)));

  return (
    <Dialogo aberto aoFechar={aoFechar} titulo={prova ? "Editar prova" : "Nova prova"} largura={680}>
      <div className="form-prova">
        <div className="form">
          <div className="campo">
            <span>PDF da prova {prova ? "(opcional: troca o atual)" : ""}</span>
            <label className="soltar soltar--compacto">
              <FileUp aria-hidden="true" />
              <strong>{arquivo ? `${arquivo.name} · ${fmtTamanho(arquivo.size)}` : prova?.arquivo ? `Atual: ${prova.arquivo.nome}` : `Escolher PDF (até ${PDF_MAX_MB} MB)`}</strong>
              <input type="file" accept="application/pdf,.pdf" className="sr-only" onChange={escolherPdf} />
            </label>
            {erros.arquivo && <small className="campo-erro" role="alert">{erros.arquivo}</small>}
            {estado && (
              <div className="progresso-envio" role="status">
                {estado.e === "enviando" && <span style={{ width: `${Math.round((estado.p || 0) * 100)}%` }} />}
                {ESTADOS[estado.e]}{estado.e === "enviando" ? ` ${Math.round((estado.p || 0) * 100)}%` : ""}
              </div>
            )}
          </div>
          <Campo rotulo="Nome da prova" erro={erros.titulo}>
            <input className="entrada" value={f.titulo} placeholder="ENEM 2018 · Dia 2 · Prova verde" onChange={(e) => setF({ ...f, titulo: e.target.value })} />
          </Campo>
          <div className="form-linha">
            <Campo rotulo="Exame" erro={erros.vestibularId}>
              <select className="entrada" value={f.vestibularId} onChange={(e) => setF({ ...f, vestibularId: e.target.value })}>
                <option value="">—</option>{ind.vestibulares.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
              </select>
            </Campo>
            <Campo rotulo="Ano" erro={erros.ano}><input className="entrada num" type="number" min="1990" max="2100" value={f.ano} placeholder="2018" onChange={(e) => setF({ ...f, ano: e.target.value })} /></Campo>
          </div>
          <Campo rotulo="Observação (opcional)"><input className="entrada" value={f.descricao} placeholder="Ex.: 90 questões, 5h" onChange={(e) => setF({ ...f, descricao: e.target.value })} /></Campo>
          <SeletorProgramas programas={programas} valor={f.programaIds} aoMudar={(programaIds) => setF({ ...f, programaIds })} />
          <label className="checagem"><input type="checkbox" checked={f.publicado} onChange={(e) => setF({ ...f, publicado: e.target.checked })} />Publicada (os alunos veem)</label>
          {!Object.keys(erros).length && <MensagemErro erro={erro} />}
        </div>

        <div className="form-prova-capa">
          <span className="eyebrow">Capa</span>
          <div className="cartao-prova cartao-prova--previa">
            {gerando ? <div className="capa-prova capa-prova--gerando">Desenhando a capa…</div>
              : capa ? <CapaProva prova={{ ...f, capa: null }} src={capa.url} />
                : <CapaProva prova={{ ...f, capa: prova?.capa || null }} />}
            <div className="cartao-prova-corpo"><strong className="cartao-prova-titulo">{f.titulo || "Nome da prova"}</strong></div>
          </div>
          {avisoCapa && <p className="previa-linha">{avisoCapa}</p>}
          {erros.capa && <small className="campo-erro" role="alert">{erros.capa}</small>}
          <div className="linha-acoes">
            <label className="btn btn--vidro btn--sm"><ImagePlus aria-hidden="true" />Enviar imagem
              <input type="file" accept="image/*" className="sr-only" onChange={escolherImagem} /></label>
            {arquivo && capa?.origem === "imagem" && <Botao variante="texto" tamanho="sm" icone={RefreshCw} onClick={() => gerarCapa(arquivo)}>Usar a do PDF</Botao>}
          </div>
          <p className="previa-linha">Sai sozinha do alto da primeira página do PDF.</p>
        </div>
      </div>
      <div className="dialogo-acoes">
        <Botao variante="vidro" onClick={aoFechar}>Cancelar</Botao>
        <Botao variante="solido" disabled={ocupado || gerando} onClick={salvar}>{ocupado ? "Enviando…" : prova ? "Salvar" : "Publicar prova"}</Botao>
      </div>
    </Dialogo>
  );
}

function AbrirProva({ prova }) {
  const { url } = useArquivoUrl(prova.arquivo?.ref);
  return url ? <a className="btn btn--vidro btn--sm" href={url} target="_blank" rel="noreferrer"><FileText aria-hidden="true" />Abrir</a> : null;
}

export default function ProvasModerador() {
  const { s } = useApp();
  const provas = useProvas();
  const jornadas = useModelos() || [];
  const programas = jornadas.filter((m) => !m.arquivado);
  const [form, setForm] = useState(null); // "nova" | prova
  const [apagar, setApagar] = useState(null);
  const { executar, ocupado, erro } = useAcao();
  if (!provas) return <Carregando />;
  return (
    <>
      <TituloPagina eyebrow="Conteúdo" frase="Provas para *simulado*"
        texto="Anexe o PDF de cada prova. O aluno escolhe a prova em Simulados, abre o PDF e depois registra o resultado."
        direita={<Botao variante="solido" icone={Plus} onClick={() => setForm("nova")}>Nova prova</Botao>} />
      <MensagemErro erro={erro} />
      {provas.length === 0
        ? <div className="cartao"><Vazio icone={FileText} titulo="Nenhuma prova ainda" texto="Anexe a primeira, por exemplo o caderno verde do 2º dia do ENEM 2018." /></div>
        : (
          <div className="grade-provas">
            {provas.map((p) => (
              <CartaoProva key={p.id} prova={p}
                selo={<span className="etiqueta">{p.publicado === false ? "Rascunho" : nomesDosProgramas(p.programaIds, jornadas)}</span>}
                acoes={(
                  <div className="linha-acoes cartao-prova-acoes">
                    <AbrirProva prova={p} />
                    <button type="button" className="icone-btn" title={p.publicado === false ? "Publicar" : "Despublicar"} aria-label={p.publicado === false ? `Publicar ${p.titulo}` : `Despublicar ${p.titulo}`} disabled={ocupado}
                      onClick={() => executar(() => s.provas.salvar({ ...p, publicado: p.publicado === false }))}>{p.publicado === false ? <Eye /> : <EyeOff />}</button>
                    <button type="button" className="icone-btn" aria-label={`Editar ${p.titulo}`} onClick={() => setForm(p)}><Pencil /></button>
                    <button type="button" className="icone-btn" aria-label={`Apagar ${p.titulo}`} onClick={() => setApagar(p)}><Trash2 /></button>
                  </div>
                )} />
            ))}
          </div>
        )}
      {form && <FormProva prova={form === "nova" ? null : form} programas={programas} aoFechar={() => setForm(null)} />}
      <Confirmar aberto={!!apagar} titulo="Apagar prova" rotulo="Apagar" perigo ocupado={ocupado} erro={erro} aoFechar={() => setApagar(null)}
        aoConfirmar={() => executar(async () => { await s.provas.remover(apagar.id); setApagar(null); })}>
        <p className="texto-dialogo">O PDF e a capa saem do armazenamento. Os simulados que os alunos já registraram com esta prova continuam no histórico deles.</p>
      </Confirmar>
    </>
  );
}
