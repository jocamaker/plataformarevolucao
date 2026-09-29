/* Peças de interface do módulo (próprias: não usam as da plataforma). */

import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, Check, Loader2, MoreHorizontal, X } from "lucide-react";

export function Botao({ variante = "secundario", tamanho, icone: Icone, className = "", children, type = "button", ...resto }) {
  const cls = ["fc-btn", `fc-btn--${variante}`, tamanho && `fc-btn--${tamanho}`, !children && "fc-btn--icone", className].filter(Boolean).join(" ");
  return (
    <button type={type} className={cls} {...resto}>
      {Icone && <Icone aria-hidden="true" />}
      {children}
    </button>
  );
}

export function Carregando({ texto = "Carregando…" }) {
  return <div className="fc-carregando" role="status"><Loader2 aria-hidden="true" />{texto}</div>;
}

export function Vazio({ icone: Icone, titulo, texto, children }) {
  return (
    <div className="fc-vazio">
      {Icone && <span className="fc-vazio-icone"><Icone aria-hidden="true" /></span>}
      <strong>{titulo}</strong>
      {texto && <p>{texto}</p>}
      {children && <div className="fc-vazio-acoes">{children}</div>}
    </div>
  );
}

export function Erro({ erro }) {
  if (!erro) return null;
  return <p className="fc-erro" role="alert"><AlertCircle aria-hidden="true" />{erro.message || String(erro)}</p>;
}

// números do dia com as cores do Anki: novos (azul), aprendendo (vermelho), revisar (verde)
export function Contagens({ c, compacto = false, destaque }) {
  const v = c || { novos: 0, aprendendo: 0, revisao: 0 };
  return (
    <span className={`fc-contagens${compacto ? " fc-contagens--compacto" : ""}`}>
      <span className={`fc-n fc-n--novo${v.novos ? "" : " fc-n--zero"}${destaque === "novo" ? " fc-n--atual" : ""}`} title="Novos">{v.novos}</span>
      <span className={`fc-n fc-n--aprendendo${v.aprendendo ? "" : " fc-n--zero"}${destaque === "aprendendo" ? " fc-n--atual" : ""}`} title="Aprendendo">{v.aprendendo}</span>
      <span className={`fc-n fc-n--revisao${v.revisao ? "" : " fc-n--zero"}${destaque === "revisao" ? " fc-n--atual" : ""}`} title="Revisar">{v.revisao}</span>
    </span>
  );
}

/* ---------- diálogo ---------- */

export function Dialogo({ aberto, aoFechar, titulo, children, largura = 460, className = "" }) {
  const ref = useRef(null);
  const peloCodigo = useRef(false);
  const id = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (aberto && !d.open) d.showModal();
    // fechado aqui (o estado já mudou): o evento "close" não deve fechar de novo
    if (!aberto && d.open) { peloCodigo.current = true; d.close(); }
  }, [aberto]);
  return (
    <dialog ref={ref} className={`fc-dialogo ${className}`} style={{ "--largura": `${largura}px` }} aria-labelledby={id}
      onClose={() => { if (peloCodigo.current) peloCodigo.current = false; else aoFechar(); }}
      onCancel={(e) => { e.preventDefault(); aoFechar(); }}
      onClick={(e) => { if (e.target === ref.current) aoFechar(); }}>
      {aberto && (
        <div className="fc-dialogo-caixa">
          <header className="fc-dialogo-topo">
            <h2 id={id}>{titulo}</h2>
            <button type="button" className="fc-btn fc-btn--fantasma fc-btn--icone" onClick={aoFechar} aria-label="Fechar"><X /></button>
          </header>
          {children}
        </div>
      )}
    </dialog>
  );
}

export function Confirmar({ aberto, titulo, children, rotulo = "Confirmar", perigo, ocupado, erro, aoConfirmar, aoFechar }) {
  return (
    <Dialogo aberto={aberto} aoFechar={aoFechar} titulo={titulo} largura={420}>
      <div className="fc-dialogo-corpo">{children}<Erro erro={erro} /></div>
      <footer className="fc-dialogo-acoes">
        <Botao onClick={aoFechar}>Cancelar</Botao>
        <Botao variante={perigo ? "perigo" : "primario"} disabled={ocupado} onClick={aoConfirmar}>{ocupado ? "Aguarde…" : rotulo}</Botao>
      </footer>
    </Dialogo>
  );
}

// pede um texto (nome de matéria, tópico…)
export function PedirTexto({ aberto, titulo, rotulo, inicial = "", confirmar = "Salvar", aoSalvar, aoFechar, dica }) {
  const [valor, setValor] = useState(inicial);
  const [erro, setErro] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => { if (aberto) { setValor(inicial); setErro(null); } }, [aberto, inicial]);
  const enviar = async (e) => {
    e.preventDefault();
    setOcupado(true);
    // aoSalvar devolve false quando ele mesmo já abriu o próximo passo
    try { if ((await aoSalvar(valor)) !== false) aoFechar(); } catch (err) { setErro(err); } finally { setOcupado(false); }
  };
  return (
    <Dialogo aberto={aberto} aoFechar={aoFechar} titulo={titulo} largura={420}>
      <form onSubmit={enviar}>
        <div className="fc-dialogo-corpo">
          <label className="fc-campo">
            <span>{rotulo}</span>
            <input className="fc-entrada" value={valor} autoFocus maxLength={80} onChange={(e) => setValor(e.target.value)} />
            {dica && <small>{dica}</small>}
          </label>
          <Erro erro={erro?.campos?.nome ? { message: erro.campos.nome } : erro} />
        </div>
        <footer className="fc-dialogo-acoes">
          <Botao onClick={aoFechar}>Cancelar</Botao>
          <Botao type="submit" variante="primario" disabled={ocupado || !valor.trim()}>{confirmar}</Botao>
        </footer>
      </form>
    </Dialogo>
  );
}

/* ---------- menu suspenso ---------- */

export function Menu({ itens, rotulo = "Mais ações", icone: Icone = MoreHorizontal, alinhar = "fim", className = "" }) {
  const [aberto, setAberto] = useState(false);
  const [pos, setPos] = useState(null);
  const botao = useRef(null);
  const lista = useRef(null);

  useLayoutEffect(() => {
    if (!aberto || !botao.current) return;
    const r = botao.current.getBoundingClientRect();
    const largura = 232;
    const esquerda = alinhar === "fim" ? Math.max(8, r.right - largura) : Math.min(r.left, window.innerWidth - largura - 8);
    const altura = lista.current?.offsetHeight || 0;
    const abaixo = r.bottom + 6 + altura < window.innerHeight - 8;
    setPos({ left: esquerda, top: abaixo ? r.bottom + 6 : Math.max(8, r.top - 6 - altura) });
  }, [aberto, alinhar]);

  useEffect(() => {
    if (!aberto) return undefined;
    const fora = (e) => { if (!lista.current?.contains(e.target) && !botao.current?.contains(e.target)) setAberto(false); };
    const tecla = (e) => {
      if (e.key === "Escape") { setAberto(false); botao.current?.focus(); }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const bs = [...(lista.current?.querySelectorAll("button:not(:disabled)") || [])];
        const i = bs.indexOf(document.activeElement);
        bs[(i + (e.key === "ArrowDown" ? 1 : -1) + bs.length) % bs.length]?.focus();
      }
    };
    const rolar = () => setAberto(false);
    document.addEventListener("pointerdown", fora);
    document.addEventListener("keydown", tecla);
    window.addEventListener("resize", rolar);
    return () => { document.removeEventListener("pointerdown", fora); document.removeEventListener("keydown", tecla); window.removeEventListener("resize", rolar); };
  }, [aberto]);

  useEffect(() => { if (aberto && pos) lista.current?.querySelector("button:not(:disabled)")?.focus(); }, [aberto, pos]);

  return (
    <>
      <button ref={botao} type="button" className={`fc-btn fc-btn--fantasma fc-btn--icone ${className}`} aria-label={rotulo} title={rotulo}
        aria-haspopup="menu" aria-expanded={aberto} onClick={(e) => { e.stopPropagation(); setAberto((a) => !a); }}>
        <Icone aria-hidden="true" />
      </button>
      {aberto && createPortal(
        <div ref={lista} className="fc fc-menu" role="menu" style={pos ? { left: pos.left, top: pos.top } : { visibility: "hidden" }}>
          {itens.filter(Boolean).map((it, i) => (it === "-"
            ? <hr key={`s${i}`} />
            : (
              <button key={it.rotulo} type="button" role="menuitem" className={it.perigo ? "fc-menu-perigo" : ""} disabled={it.desativado}
                onClick={(e) => { e.stopPropagation(); setAberto(false); it.aoClicar(); }}>
                {it.icone && <it.icone aria-hidden="true" />}<span>{it.rotulo}</span>{it.atalho && <kbd>{it.atalho}</kbd>}
              </button>
            )))}
        </div>,
        document.body,
      )}
    </>
  );
}

/* ---------- avisos (toasts), com "Desfazer" quando cabe ---------- */

let avisos = [];
const ouvintesAvisos = new Set();
const mudarAvisos = (novos) => { avisos = novos; ouvintesAvisos.forEach((f) => f()); };

export function avisar(texto, { tipo = "ok", acao = null, duracao = 4200 } = {}) {
  const id = Math.random().toString(36).slice(2);
  mudarAvisos([...avisos.slice(-2), { id, texto, tipo, acao }]);
  setTimeout(() => mudarAvisos(avisos.filter((a) => a.id !== id)), duracao);
  return id;
}

export function Avisos() {
  const lista = useSyncExternalStore((f) => { ouvintesAvisos.add(f); return () => ouvintesAvisos.delete(f); }, () => avisos);
  return createPortal(
    <div className="fc fc-avisos" aria-live="polite">
      {lista.map((a) => (
        <div key={a.id} className={`fc-aviso fc-aviso--${a.tipo}`}>
          {a.tipo === "erro" ? <AlertCircle aria-hidden="true" /> : <Check aria-hidden="true" />}
          <span>{a.texto}</span>
          {a.acao && <button type="button" onClick={() => { a.acao.fn(); mudarAvisos(avisos.filter((x) => x.id !== a.id)); }}>{a.acao.rotulo}</button>}
        </div>
      ))}
    </div>,
    document.body,
  );
}

// executa uma ação e avisa o resultado (ou o erro); devolve { ok, valor }
export async function executar(fn, { ok, erro = "Não foi possível concluir.", acao } = {}) {
  try {
    const valor = await fn();
    if (ok) avisar(typeof ok === "function" ? ok(valor) : ok, { acao: typeof acao === "function" ? acao(valor) : acao });
    return { ok: true, valor };
  } catch (e) {
    avisar(e?.message || erro, { tipo: "erro", duracao: 6000 });
    return { ok: false, erro: e };
  }
}
