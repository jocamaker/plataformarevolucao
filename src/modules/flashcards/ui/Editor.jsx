/* Editor de cartões: sempre Frente e Verso (o básico). Dois extras, dentro
   do mesmo formulário, sem precisar escolher "tipo":
   - Esconder trecho: selecione palavras na frente e toque em Esconder;
     cada trecho escondido vira um cartão (lacuna, o "cloze" do Anki) e o
     verso passa a ser opcional (explicação);
   - Imagem com partes escondidas: troque a frente por uma imagem e cubra o
     que quer lembrar (a "oclusão de imagem"); cada área vira um cartão.
   O banco continua com os três tipos (básico, cloze, oclusão).
   Adicionar mantém tópico e tags para o próximo; Ctrl+Enter salva. Também
   abre como diálogo (editar no estudo). */

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Eye, ImageOff, Layers, Pencil, Plus, Type, X } from "lucide-react";
import { useBase, useLoja, usePreferencia } from "../estado/hooks.js";
import { ordinaisDaNota, lacunasDoTexto, normalizarNota, textoDoHtml } from "../dados/modelo.js";
import { salvarNota, apagarNotas } from "../servicos/notas.js";
import { criarTopico } from "../servicos/arvore.js";
import { Botao, Carregando, Dialogo, Erro, PedirTexto, Vazio, avisar } from "./comum.jsx";
import { Cartao } from "./Cartao.jsx";
import { CampoRico } from "./CampoRico.jsx";
import { EditorOclusao } from "./EditorOclusao.jsx";
import { semEnderecos } from "./html.js";

const formularioVazio = () => ({ frente: "", verso: "", modoImagem: false, imagem: null, formas: [] });

// nota salva → formulário
function formularioDaNota(n) {
  const c = n.campos || {};
  if (n.tipo === "cloze") return { ...formularioVazio(), frente: c.texto || "", verso: c.extra || "" };
  if (n.tipo === "oclusao") return { ...formularioVazio(), modoImagem: true, imagem: c.imagem || null, formas: c.formas || [], verso: c.extra || "" };
  return { ...formularioVazio(), frente: c.frente || "", verso: c.verso || "" };
}

// formulário → nota (o tipo sai do que foi preenchido)
function notaDoFormulario(f, base) {
  if (f.modoImagem) return { ...base, tipo: "oclusao", campos: { imagem: f.imagem, formas: f.formas, extra: f.verso } };
  if (lacunasDoTexto(f.frente).length) return { ...base, tipo: "cloze", campos: { texto: f.frente, extra: f.verso } };
  return { ...base, tipo: "basico", campos: { frente: f.frente, verso: f.verso } };
}

// o banco guarda a referência da imagem, não o endereço (que muda)
function paraSalvar(campos) {
  return Object.fromEntries(Object.entries(campos).map(([k, v]) => [k, typeof v === "string" ? semEnderecos(v) : v]));
}

// erros da validação (por campo do banco) → campos do formulário
function errosDoFormulario(e) {
  const r = { ...e };
  if (e.texto) r.frente = e.texto.includes("lacuna") ? "Escreva a frente do cartão." : e.texto;
  if (e.extra) r.verso = e.extra;
  if (e.imagem || e.formas) r.imagem = e.imagem || e.formas;
  return r;
}

function CampoTags({ tags, aoMudar, conhecidas }) {
  const [texto, setTexto] = useState("");
  const adicionar = (t) => {
    const limpo = t.replace(/\s+/g, " ").trim().replace(/,$/, "");
    if (limpo && !tags.some((x) => x.toLocaleLowerCase("pt-BR") === limpo.toLocaleLowerCase("pt-BR"))) aoMudar([...tags, limpo]);
    setTexto("");
  };
  return (
    <div className="fc-campo">
      <span>Tags</span>
      <div className="fc-tags-entrada">
        {tags.map((t) => (
          <span key={t} className="fc-tag">{t}<button type="button" aria-label={`Tirar a tag ${t}`} onClick={() => aoMudar(tags.filter((x) => x !== t))}><X aria-hidden="true" /></button></span>
        ))}
        <input className="fc-tags-texto" value={texto} list="fc-tags-conhecidas" placeholder={tags.length ? "" : "revisar, banca FUVEST…"}
          onChange={(e) => { if (e.target.value.endsWith(",")) adicionar(e.target.value); else setTexto(e.target.value); }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && texto.trim()) { e.preventDefault(); adicionar(texto); }
            if (e.key === "Backspace" && !texto && tags.length) aoMudar(tags.slice(0, -1));
          }}
          onBlur={() => texto.trim() && adicionar(texto)} aria-label="Nova tag" />
        <datalist id="fc-tags-conhecidas">{conhecidas.filter((t) => !tags.includes(t)).map((t) => <option key={t} value={t} />)}</datalist>
      </div>
      <small>Livres, para estudar e filtrar por fora das matérias. Enter ou vírgula para adicionar.</small>
    </div>
  );
}

function Previa({ nota }) {
  const [lado, setLado] = useState("frente");
  const ordinais = useMemo(() => {
    try { return ordinaisDaNota(nota); } catch { return []; }
  }, [nota]);
  const [ordinal, setOrdinal] = useState(null);
  const atual = ordinais.includes(ordinal) ? ordinal : ordinais[0];
  // sem conteúdo ainda: só a dica (nada de cartão em branco)
  const c = nota.campos;
  const semConteudo = nota.tipo === "oclusao" ? !c.imagem?.ref : nota.tipo === "basico" && !textoDoHtml(c.frente) && !/<img/i.test(c.frente || "") && !textoDoHtml(c.verso);
  return (
    <aside className="fc-previa" aria-label="Pré-visualização">
      <div className="fc-previa-topo">
        <span className="fc-rico-rotulo"><Eye aria-hidden="true" />Como fica na revisão</span>
        <div className="fc-escolhas fc-escolhas--compactas" role="radiogroup" aria-label="Lado">
          {["frente", "verso"].map((l) => <button key={l} type="button" role="radio" aria-checked={lado === l} className="fc-escolha" onClick={() => setLado(l)}>{l === "frente" ? "Frente" : "Verso"}</button>)}
        </div>
      </div>
      {ordinais.length > 1 && (
        <div className="fc-escolhas fc-escolhas--compactas" role="radiogroup" aria-label="Qual cartão">
          {ordinais.map((o, i) => <button key={o} type="button" role="radio" aria-checked={atual === o} className="fc-escolha" onClick={() => setOrdinal(o)}>Cartão {i + 1}</button>)}
        </div>
      )}
      <div className={`fc-previa-cartao${semConteudo || !atual ? " fc-previa-cartao--vazia" : ""}`}>
        {atual && !semConteudo ? <Cartao nota={nota} ordinal={atual} lado={lado} /> : <p className="fc-dica">Escreva a frente para ver como o cartão aparece na revisão.</p>}
      </div>
      {!semConteudo && ordinais.length > 1 && <p className="fc-dica">{ordinais.length} cartões saem desta nota, um para cada {nota.tipo === "oclusao" ? "área escondida" : "trecho escondido"}.</p>}
    </aside>
  );
}

/* notaId: editar uma nota; sem ele, adicionar (inicial: { topicoId, materiaId }).
   emDialogo: abre por cima (editar durante o estudo). */
export function EditorNota({ notaId = null, inicial = {}, emDialogo = false, aoFechar, aoSalvar }) {
  const { estado, repo, loja } = useLoja();
  const [ultimo, setUltimo] = usePreferencia(`fc:ultimo:${estado.uid}`, {});
  const primeiroTopico = () => {
    const t = estado.topicos.find((x) => x.id === (inicial.topicoId || ultimo.topicoId)) || (inicial.materiaId ? estado.topicos.find((x) => x.materiaId === inicial.materiaId) : null) || estado.topicos[0];
    return t ? { materiaId: t.materiaId, topicoId: t.id } : { materiaId: inicial.materiaId || estado.materias[0]?.id || "", topicoId: "" };
  };
  const [lugar, setLugar] = useState(() => (notaId ? null : { ...primeiroTopico(), tags: ultimo.tags || [] }));
  const [f, setF] = useState(() => (notaId ? null : formularioVazio()));
  const [original, setOriginal] = useState(null);
  const [erros, setErros] = useState({});
  const [erroGeral, setErroGeral] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [novoTopico, setNovoTopico] = useState(false);
  const [aba, setAba] = useState("editar"); // no celular: editar | previa
  const [versao, setVersao] = useState(0); // recria os campos depois de adicionar
  const raiz = useRef(null);

  // carrega a nota a editar (com os endereços das imagens para o editor)
  useEffect(() => {
    if (!notaId) return undefined;
    let vivo = true;
    repo.obter("notas", notaId).then(async (n) => {
      if (!vivo) return;
      if (!n) { setErroGeral(new Error("Esta nota não existe mais.")); return; }
      const campos = { ...n.campos };
      for (const [k, v] of Object.entries(campos)) {
        if (typeof v !== "string" || !v.includes("data-fc-img")) continue;
        const t = document.createElement("template");
        t.innerHTML = v;
        await Promise.all([...t.content.querySelectorAll("img[data-fc-img]")].map(async (img) => {
          const url = await repo.urlImagem(img.getAttribute("data-fc-img")).catch(() => null);
          if (url) img.setAttribute("src", url);
        }));
        campos[k] = t.innerHTML;
      }
      if (vivo) {
        setOriginal(n);
        setLugar({ materiaId: n.materiaId, topicoId: n.topicoId, tags: n.tags || [] });
        setF(formularioDaNota({ ...n, campos }));
      }
    });
    return () => { vivo = false; };
  }, [repo, notaId]);

  const topicosDaMateria = estado.topicos.filter((t) => t.materiaId === lugar?.materiaId);
  const mudar = (patch) => {
    setF((x) => ({ ...x, ...patch }));
    setErros((e) => { const r = { ...e }; Object.keys(patch).forEach((k) => delete r[k]); if (patch.formas || patch.imagem) delete r.imagem; return r; });
  };
  const nota = f && lugar ? notaDoFormulario(f, lugar) : null;

  const salvar = async () => {
    if (salvando || !nota) return;
    setSalvando(true);
    setErros({});
    setErroGeral(null);
    try {
      const dados = { ...nota, campos: paraSalvar(nota.campos) };
      try { normalizarNota(dados); } catch (e) { if (e.campos) { setErros(errosDoFormulario(e.campos)); return; } throw e; }
      const r = await salvarNota(repo, { ...dados, id: notaId || undefined }, { tagsConhecidas: estado.tagsConhecidas });
      loja.recontar();
      if (notaId) {
        avisar(r.criados || r.removidos ? `Salvo: ${r.criados} ${r.criados === 1 ? "cartão novo" : "cartões novos"}, ${r.removidos} ${r.removidos === 1 ? "removido" : "removidos"}.` : "Alterações salvas.");
        aoSalvar?.({ ...dados, id: notaId });
        return;
      }
      setUltimo({ topicoId: lugar.topicoId, tags: lugar.tags });
      avisar(`${r.cartoes === 1 ? "Cartão adicionado" : `${r.cartoes} cartões adicionados`}.`, {
        acao: { rotulo: "Desfazer", fn: async () => { await apagarNotas(repo, [{ id: r.id, imagens: [] }]); loja.recontar(); } },
      });
      setF(formularioVazio());
      setVersao((v) => v + 1);
      aoSalvar?.({ ...dados, id: r.id });
      setTimeout(() => raiz.current?.querySelector(".fc-rico-area")?.focus(), 60);
    } catch (e) {
      setErroGeral(e);
    } finally { setSalvando(false); }
  };

  // Ctrl+Enter salva
  useEffect(() => {
    const tecla = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && raiz.current?.contains(document.activeElement)) { e.preventDefault(); salvar(); }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  });

  if (erroGeral && !f) return <Vazio titulo="Não foi possível abrir" texto={erroGeral.message} />;
  if (!f || !lugar) return <Carregando />;
  if (!estado.materias.length) {
    return <Vazio icone={Layers} titulo="Crie uma matéria primeiro" texto="Os cartões moram dentro de um tópico de uma matéria. Crie na aba Baralhos." />;
  }

  const escondidos = f.modoImagem ? 0 : lacunasDoTexto(f.frente).length;
  const versoOpcional = f.modoImagem || escondidos > 0;
  const corpo = (
    <div ref={raiz} className={`fc-editor${emDialogo ? " fc-editor--dialogo" : ""}`} data-aba={aba}>
      <div className="fc-editor-abas-cel" role="tablist" aria-label="Editor">
        <button type="button" role="tab" aria-selected={aba === "editar"} onClick={() => setAba("editar")}><Pencil aria-hidden="true" />Editar</button>
        <button type="button" role="tab" aria-selected={aba === "previa"} onClick={() => setAba("previa")}><Eye aria-hidden="true" />Pré-visualizar</button>
      </div>
      <div className="fc-editor-form">
        <div className="fc-editor-lugar">
          <label className="fc-campo"><span>Matéria</span>
            <select className="fc-entrada" value={lugar.materiaId} onChange={(e) => {
              const materiaId = e.target.value;
              setLugar((l) => ({ ...l, materiaId, topicoId: estado.topicos.find((t) => t.materiaId === materiaId)?.id || "" }));
            }}>
              {estado.materias.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
            </select>
          </label>
          <label className="fc-campo"><span>Tópico</span>
            <select className="fc-entrada" value={lugar.topicoId} onChange={(e) => (e.target.value === "__novo" ? setNovoTopico(true) : setLugar((l) => ({ ...l, topicoId: e.target.value })))}>
              {!topicosDaMateria.length && <option value="">Crie um tópico…</option>}
              {topicosDaMateria.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
              <option value="__novo">+ Novo tópico</option>
            </select>
            {erros.topicoId && <small className="fc-campo-erro" role="alert">{erros.topicoId}</small>}
          </label>
        </div>

        {f.modoImagem ? (
          <div className="fc-frente-imagem">
            <div className="fc-rico-topo">
              <span className="fc-rico-rotulo">Frente · imagem com partes escondidas</span>
              <button type="button" className="fc-link-discreto" onClick={() => mudar({ modoImagem: false })}><Type aria-hidden="true" />Usar texto</button>
            </div>
            <EditorOclusao campos={{ imagem: f.imagem, formas: f.formas }} aoMudar={({ imagem, formas }) => mudar({ imagem, formas })} erro={erros.imagem} />
          </div>
        ) : (
          <CampoRico key={`f${versao}-${notaId}`} lacunas rotulo="Frente" valor={f.frente} aoMudar={(frente) => mudar({ frente })} placeholder="A pergunta" erro={erros.frente} autoFocus={!emDialogo}
            rodape={(
              <div className="fc-frente-rodape">
                <span className="fc-dica fc-dica--linha">
                  {escondidos ? `${escondidos} ${escondidos === 1 ? "trecho escondido → 1 cartão" : `trechos escondidos → ${escondidos} cartões`}. O verso fica opcional.`
                    : "Dica: selecione palavras e toque em Esconder para completar a lacuna na revisão."}
                </span>
                <button type="button" className="fc-link-discreto" onClick={() => mudar({ modoImagem: true })}><ImageOff aria-hidden="true" />Esconder partes de uma imagem</button>
              </div>
            )} />
        )}
        <CampoRico key={`v${versao}-${notaId}`} rotulo={versoOpcional ? "Verso (opcional)" : "Verso"} valor={f.verso} aoMudar={(verso) => mudar({ verso })}
          placeholder={versoOpcional ? "Explicação, fonte, mnemônico… aparece depois de revelar" : "A resposta"} erro={erros.verso} />

        <CampoTags tags={lugar.tags} aoMudar={(tags) => setLugar((l) => ({ ...l, tags }))} conhecidas={estado.tagsConhecidas} />
        <Erro erro={erroGeral} />
        <div className="fc-editor-acoes">
          {aoFechar && <Botao onClick={aoFechar}>{notaId ? "Cancelar" : "Fechar"}</Botao>}
          <Botao variante="primario" icone={notaId ? undefined : Plus} disabled={salvando} onClick={salvar}>
            {salvando ? "Salvando…" : notaId ? "Salvar" : "Adicionar"}<kbd className="fc-kbd-botao">Ctrl+Enter</kbd>
          </Botao>
        </div>
        {notaId && original && <p className="fc-dica">Editar mantém o progresso dos cartões que continuam. Trechos ou áreas removidos apagam os cartões deles.</p>}
      </div>
      <Previa nota={nota} />
      <PedirTexto aberto={novoTopico} titulo="Novo tópico" rotulo="Nome do tópico" confirmar="Criar" aoFechar={() => setNovoTopico(false)}
        aoSalvar={async (nome) => {
          const id = await criarTopico(repo, { materiaId: lugar.materiaId, nome }, topicosDaMateria);
          setLugar((l) => ({ ...l, topicoId: id }));
        }} />
    </div>
  );

  if (emDialogo) {
    return <Dialogo aberto aoFechar={aoFechar} titulo="Editar cartão" largura={1080} className="fc-dialogo--editor">{corpo}</Dialogo>;
  }
  return corpo;
}

// páginas: /novo (adicionar) e /nota/:id (editar)
export default function Editor() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const base = useBase();
  const inicial = { topicoId: params.get("topico") || undefined, materiaId: params.get("materia") || undefined };
  return (
    <div className="fc-pagina-editor">
      <header className="fc-pagina-topo"><h1>{id ? "Editar cartão" : "Novo cartão"}</h1></header>
      <EditorNota key={id || "novo"} notaId={id || null} inicial={inicial}
        aoFechar={id ? () => navigate(-1) : undefined}
        aoSalvar={id ? () => navigate(-1) : undefined} />
      {!id && <p className="fc-dica">Depois de adicionar, os campos se esvaziam e o tópico e as tags ficam, para você emendar o próximo. Para estudar, volte em <a href={`#${base}`}>Baralhos</a>.</p>}
    </div>
  );
}
