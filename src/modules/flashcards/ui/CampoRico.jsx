/* Campo de texto formatado (TipTap): negrito, itálico, sublinhado, listas,
   sub/sobrescrito (fórmulas), imagens (comprimidas; também coladas) e, com
   `lacunas`, o botão "Esconder": o trecho selecionado fica destacado e vira
   uma lacuna (cada uma, um cartão). Atalhos do Anki:
     Ctrl+Shift+C      esconder (nova lacuna)
     Ctrl+Alt+Shift+C  esconder junto com a anterior (mesmo cartão)
   O valor emitido usa o formato salvo, {{c1::…}} (ver html.js). */

import { useEffect, useRef } from "react";
import { EditorContent, Mark, mergeAttributes, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import Image from "@tiptap/extension-image";
import { Placeholder } from "@tiptap/extensions";
import { Bold, Eye, EyeOff, ImagePlus, Italic, List, ListOrdered, RemoveFormatting, Subscript as IconeSub, Superscript as IconeSup, Underline } from "lucide-react";
import { useLoja } from "../estado/hooks.js";
import { lacunasDoTexto } from "../dados/modelo.js";
import { comprimirImagem } from "./imagens.js";
import { guardarEndereco } from "./Cartao.jsx";
import { lacunasParaMarcas, marcasParaLacunas } from "./html.js";
import { avisar } from "./comum.jsx";

// imagem com a referência do armazenamento (data-fc-img) além do endereço
const ImagemFc = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      "data-fc-img": { default: null, parseHTML: (el) => el.getAttribute("data-fc-img"), renderHTML: (a) => (a["data-fc-img"] ? { "data-fc-img": a["data-fc-img"] } : {}) },
    };
  },
});

// a lacuna no editor: um trecho marcado (por fora das outras marcas, para não se partir)
const Lacuna = Mark.create({
  name: "lacuna",
  priority: 1000,
  inclusive: false,
  excludes: "lacuna",
  addAttributes() {
    return {
      n: { default: 1, parseHTML: (el) => Number(el.getAttribute("data-lacuna")) || 1, renderHTML: (a) => ({ "data-lacuna": String(a.n) }) },
      dica: { default: null, parseHTML: (el) => el.getAttribute("data-dica"), renderHTML: (a) => (a.dica ? { "data-dica": a.dica } : {}) },
    };
  },
  parseHTML: () => [{ tag: "span[data-lacuna]" }],
  renderHTML: ({ HTMLAttributes }) => ["span", mergeAttributes(HTMLAttributes, { class: "fc-lacuna-ed" }), 0],
});

// números das lacunas já usadas (marcadas ou digitadas como {{cN::…}})
function numerosUsados(editor) {
  const nums = new Set(lacunasDoTexto(editor.getText()));
  editor.state.doc.descendants((no) => { no.marks.forEach((m) => { if (m.type.name === "lacuna") nums.add(m.attrs.n); }); });
  return [...nums];
}

// o cursor está num trecho escondido (dentro ou encostado nele)
function naLacuna(editor) {
  if (editor.isActive("lacuna")) return true;
  const { $from, empty } = editor.state.selection;
  if (!empty) return false;
  const tem = (no) => Boolean(no?.marks.some((m) => m.type.name === "lacuna"));
  return tem($from.nodeBefore) || tem($from.nodeAfter);
}

function BotaoFerramenta({ ativo, icone: Icone, rotulo, onClick, desativado }) {
  return (
    <button type="button" className={`fc-ferramenta${ativo ? " fc-ferramenta--ativa" : ""}`} aria-label={rotulo} title={rotulo} aria-pressed={ativo}
      disabled={desativado} onMouseDown={(e) => e.preventDefault()} onClick={onClick}>
      <Icone aria-hidden="true" />
    </button>
  );
}

export function CampoRico({ rotulo, valor, aoMudar, lacunas = false, placeholder = "", erro, autoFocus = false, id, rodape }) {
  const { repo } = useLoja();
  const arquivo = useRef(null);
  const ultimoEmitido = useRef(valor);
  const textoGuia = useRef(placeholder);
  textoGuia.current = placeholder;

  const enviarImagens = async (editor, arquivos) => {
    for (const f of arquivos) {
      try {
        const { blob } = await comprimirImagem(f);
        const ref = await repo.enviarImagem(blob);
        const url = URL.createObjectURL(blob);
        guardarEndereco(ref, url);
        editor.chain().focus().setImage({ src: url, "data-fc-img": ref, alt: "" }).run();
      } catch (e) {
        avisar(e.message || "Não foi possível enviar a imagem.", { tipo: "erro" });
      }
    }
  };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false, codeBlock: false, horizontalRule: false, link: false, blockquote: false }),
      Subscript, Superscript, ImagemFc.configure({ inline: false }), ...(lacunas ? [Lacuna] : []),
      Placeholder.configure({ placeholder: () => textoGuia.current }),
    ],
    content: lacunasParaMarcas(valor || ""),
    autofocus: autoFocus ? "end" : false,
    editorProps: {
      attributes: { class: "fc-rico-area", "aria-label": rotulo, ...(id ? { id } : {}) },
      handlePaste: (view, e) => {
        const imgs = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith("image/"));
        if (!imgs.length) return false;
        e.preventDefault();
        enviarImagens(editorRef.current, imgs);
        return true;
      },
      handleDrop: (view, e) => {
        const imgs = [...(e.dataTransfer?.files || [])].filter((f) => f.type.startsWith("image/"));
        if (!imgs.length) return false;
        e.preventDefault();
        enviarImagens(editorRef.current, imgs);
        return true;
      },
    },
    onUpdate: ({ editor: ed }) => {
      const html = ed.isEmpty ? "" : marcasParaLacunas(ed.getHTML());
      ultimoEmitido.current = html;
      aoMudar(html);
    },
  });
  const editorRef = useRef(null);
  editorRef.current = editor;

  // valor trocado de fora (ex.: limpar depois de adicionar, abrir outra nota)
  useEffect(() => {
    if (!editor || valor === ultimoEmitido.current) return;
    ultimoEmitido.current = valor;
    editor.commands.setContent(lacunasParaMarcas(valor || ""), { emitUpdate: false });
  }, [editor, valor]);

  // o texto-guia mudou (ex.: verso que passou a ser opcional): redesenha
  useEffect(() => {
    if (editor && !editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta("addToHistory", false));
  }, [editor, placeholder]);

  const marcas = useEditorState({
    editor,
    selector: ({ editor: ed }) => (ed ? {
      bold: ed.isActive("bold"), italic: ed.isActive("italic"), underline: ed.isActive("underline"),
      bulletList: ed.isActive("bulletList"), orderedList: ed.isActive("orderedList"),
      subscript: ed.isActive("subscript"), superscript: ed.isActive("superscript"),
      lacuna: lacunas && naLacuna(ed),
    } : {}),
  }) || {};

  // esconder o trecho selecionado (ou mostrar de novo, se o cursor já está numa lacuna)
  const lacuna = (mesma) => {
    if (!editor || editor.isDestroyed) return;
    // a seleção do navegador chega ao editor de forma assíncrona: sincroniza antes de ler
    editor.view.domObserver?.flush?.();
    if (naLacuna(editor)) {
      // estende até o trecho inteiro (também com o cursor encostado no fim dele)
      const { $from } = editor.state.selection;
      const tem = (no) => Boolean(no?.marks.some((m) => m.type.name === "lacuna"));
      const pos = !tem($from.nodeAfter) && tem($from.nodeBefore) ? $from.pos - 1 : $from.pos;
      editor.chain().focus().setTextSelection(pos).extendMarkRange("lacuna").unsetMark("lacuna").run();
      return;
    }
    if (editor.state.selection.empty) { avisar("Selecione a palavra ou o trecho que quer esconder."); editor.commands.focus(); return; }
    const nums = numerosUsados(editor);
    const n = mesma && nums.length ? Math.max(...nums) : (nums.length ? Math.max(...nums) + 1 : 1);
    editor.chain().focus().setMark("lacuna", { n }).run();
  };

  useEffect(() => {
    if (!editor || !lacunas) return undefined;
    const tecla = (e) => {
      if (!editor.isFocused) return;
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "C" || e.key === "c")) { e.preventDefault(); lacuna(e.altKey); }
    };
    window.addEventListener("keydown", tecla, true);
    return () => window.removeEventListener("keydown", tecla, true);
  }, [editor, lacunas]); // eslint-disable-line react-hooks/exhaustive-deps

  const c = () => editor.chain(); // chamar como método (usa o próprio editor)
  return (
    <div className={`fc-rico${erro ? " fc-rico--erro" : ""}`}>
      <div className="fc-rico-topo">
        <span className="fc-rico-rotulo">{rotulo}</span>
        <div className="fc-ferramentas" role="toolbar" aria-label={`Formatação de ${rotulo}`}>
          {lacunas && (
            <button type="button" className={`fc-ferramenta fc-ferramenta--lacuna${marcas.lacuna ? " fc-ferramenta--ativa" : ""}`} aria-pressed={!!marcas.lacuna}
              title={marcas.lacuna ? "Mostrar de novo este trecho" : "Esconder o trecho selecionado: vira uma lacuna para completar (Ctrl+Shift+C)"}
              onMouseDown={(e) => e.preventDefault()} onClick={() => lacuna(false)}>
              {marcas.lacuna ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />}{marcas.lacuna ? "Mostrar" : "Esconder"}
            </button>
          )}
          <BotaoFerramenta icone={Bold} rotulo="Negrito (Ctrl+B)" ativo={marcas.bold} onClick={() => c().focus().toggleBold().run()} />
          <BotaoFerramenta icone={Italic} rotulo="Itálico (Ctrl+I)" ativo={marcas.italic} onClick={() => c().focus().toggleItalic().run()} />
          <BotaoFerramenta icone={Underline} rotulo="Sublinhado (Ctrl+U)" ativo={marcas.underline} onClick={() => c().focus().toggleUnderline().run()} />
          <BotaoFerramenta icone={IconeSub} rotulo="Subscrito (H₂O)" ativo={marcas.subscript} onClick={() => c().focus().toggleSubscript().run()} />
          <BotaoFerramenta icone={IconeSup} rotulo="Sobrescrito (10²³)" ativo={marcas.superscript} onClick={() => c().focus().toggleSuperscript().run()} />
          <BotaoFerramenta icone={List} rotulo="Lista" ativo={marcas.bulletList} onClick={() => c().focus().toggleBulletList().run()} />
          <BotaoFerramenta icone={ListOrdered} rotulo="Lista numerada" ativo={marcas.orderedList} onClick={() => c().focus().toggleOrderedList().run()} />
          <BotaoFerramenta icone={ImagePlus} rotulo="Imagem (também dá para colar)" onClick={() => arquivo.current?.click()} />
          <BotaoFerramenta icone={RemoveFormatting} rotulo="Limpar formatação" onClick={() => c().focus().unsetAllMarks().clearNodes().run()} />
          <input ref={arquivo} type="file" accept="image/*" hidden onChange={(e) => { const fs = [...e.target.files]; e.target.value = ""; enviarImagens(editor, fs); }} />
        </div>
      </div>
      <EditorContent editor={editor} />
      {rodape}
      {erro && <small className="fc-campo-erro" role="alert">{erro}</small>}
    </div>
  );
}
