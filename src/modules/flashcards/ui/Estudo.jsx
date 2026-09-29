/* Sessão de estudo em tela de foco: só o cartão. Toque (ou Espaço) revela
   a resposta; os 4 botões aparecem depois, cada um dizendo quando o cartão
   volta. Cada resposta é gravada na hora (sem esperar a rede para seguir).

   Com ?rever=1: rever antes do prazo (todos os já estudados do recorte).

   Atalhos (como no Anki): Espaço/Enter revela e, revelado, marca Bom;
   1–4 avaliam; Z desfaz; - enterra; @ suspende; E edita; I informações;
   Esc sai. */

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CalendarClock, EyeOff, Info, Pencil, RotateCcw, SkipForward, Trash2, Undo2, X } from "lucide-react";
import { useBase, useLoja } from "../estado/hooks.js";
import { ESTADOS, FILTRO_NOVOS } from "../dados/modelo.js";
import { AVALIACOES, formatarIntervalo } from "../motor/agendador.js";
import { SessaoEstudo, feitosHoje, montarPlano, montarRevisao } from "../motor/fila.js";
import { desenterrar, desfazer, enterrar, planejarResposta, resetar, suspender } from "../servicos/agenda.js";
import { apagarNotas } from "../servicos/notas.js";
import { Botao, Carregando, Confirmar, Contagens, Menu, avisar } from "./comum.jsx";
import { Cartao } from "./Cartao.jsx";
import { CHAVE_AVALIACAO, DefinirData, InfoCartao } from "./dialogosCartao.jsx";

const EditorNota = lazy(() => import("./Editor.jsx").then((m) => ({ default: m.EditorNota })));

const TRANSICAO_MS = 170;
const tipoDoCartao = (c) => (c.fsrs.state === ESTADOS.novo ? "novo" : c.fsrs.state === ESTADOS.revisao ? "revisao" : "aprendendo");

function useEscopo() {
  const [params] = useSearchParams();
  return useMemo(() => ({
    materiaId: params.get("materia") || undefined,
    topicoId: params.get("topico") || undefined,
    tag: params.get("tag") || undefined,
    rever: params.get("rever") === "1", // rever antes do prazo: todos os já estudados
  }), [params]);
}

function nomeDoEscopo(escopo, estado) {
  if (escopo.topicoId) {
    const t = estado.topicos.find((x) => x.id === escopo.topicoId);
    const m = t && estado.materias.find((x) => x.id === t.materiaId);
    return t ? `${m ? `${m.nome} › ` : ""}${t.nome}` : "Tópico";
  }
  if (escopo.materiaId) return estado.materias.find((x) => x.id === escopo.materiaId)?.nome || "Matéria";
  if (escopo.tag) return `#${escopo.tag}`;
  return "Todas as matérias";
}

function filtrosDoEscopo(escopo) {
  if (escopo.topicoId) return [["topicoId", "==", escopo.topicoId]];
  if (escopo.materiaId) return [["materiaId", "==", escopo.materiaId]];
  if (escopo.tag) return [["tags", "array-contains", escopo.tag]];
  return [];
}

const minutos = (ms) => {
  const m = Math.round(ms / 60000);
  return m < 1 ? "menos de 1 min" : `${m} min`;
};

function Fim({ respostas, aoSair, aoMaisNovos, temMaisNovos, rever }) {
  const total = respostas.length;
  const tempo = respostas.reduce((s, r) => s + Math.min(r.ms, 60000), 0);
  const lembrou = respostas.filter((r) => r.avaliacao > 1).length;
  const porBotao = AVALIACOES.map((a) => ({ ...a, n: respostas.filter((r) => r.avaliacao === a.valor).length }));
  return (
    <div className="fc-fim">
      <div className="fc-fim-selo" aria-hidden="true">✓</div>
      <h2>{total ? (rever ? "Revisão concluída" : "Parabéns, por hoje é isso!") : (rever ? "Nada para rever aqui" : "Nada para estudar aqui agora")}</h2>
      {total > 0 ? (
        <>
          <p className="fc-fim-sub">{total} {total === 1 ? "resposta" : "respostas"} em {minutos(tempo)} · lembrou de {Math.round((lembrou / total) * 100)}%</p>
          <div className="fc-fim-barras" aria-label="Respostas por botão">
            {porBotao.map((a) => (
              <div key={a.valor} className={`fc-fim-barra fc-fim-barra--${a.chave}`}>
                <span style={{ "--p": total ? a.n / total : 0 }} />
                <small>{a.rotulo}</small><b>{a.n}</b>
              </div>
            ))}
          </div>
        </>
      ) : <p className="fc-fim-sub">{rever ? "Ainda não há cartões estudados aqui. Estude os novos primeiro; depois eles podem ser revistos quando você quiser." : "Os cartões deste recorte já foram revisados ou ainda não venceram."}</p>}
      <div className="fc-fim-acoes">
        <Botao variante="primario" onClick={aoSair}>Voltar aos baralhos</Botao>
        {temMaisNovos && <Botao onClick={aoMaisNovos}>Estudar mais 10 novos</Botao>}
      </div>
      <p className="fc-dica">{rever ? "Cada cartão revisto recomeça a contar a partir de agora." : "Revisar no dia certo vale mais do que revisar muito de uma vez. Volte amanhã."}</p>
    </div>
  );
}

function Espera({ ate, aoSair }) {
  const [agora, setAgora] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setAgora(Date.now()), 1000); return () => clearInterval(t); }, []);
  const s = Math.max(0, Math.round((ate.getTime() - agora) / 1000));
  return (
    <div className="fc-fim">
      <div className="fc-fim-selo fc-fim-selo--espera" aria-hidden="true">⏳</div>
      <h2>Tudo revisado por enquanto</h2>
      <p className="fc-fim-sub">Os cartões que você errou voltam em {s >= 60 ? `${Math.ceil(s / 60)} min` : `${s} s`}. A sessão continua sozinha.</p>
      <div className="fc-fim-acoes"><Botao onClick={aoSair}>Voltar mais tarde</Botao></div>
    </div>
  );
}

export default function Estudo() {
  const { estado, loja, repo, agendador } = useLoja();
  const base = useBase();
  const navigate = useNavigate();
  const escopo = useEscopo();
  const nome = `${escopo.rever ? "Rever · " : ""}${nomeDoEscopo(escopo, estado)}`;

  const sessao = useRef(null);
  const notas = useRef(new Map());
  const desfazeres = useRef([]);
  const respostas = useRef([]);
  const esperaTimer = useRef(null);
  const [fase, setFase] = useState("carregando"); // carregando | cartao | espera | fim
  const [atual, setAtual] = useState(null); // { cartao, nota, revelado, previsoes, reveladoEm, inicio }
  const [saindo, setSaindo] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [espera, setEspera] = useState(null);
  const [dialogo, setDialogo] = useState(null);
  const [temMaisNovos, setTemMaisNovos] = useState(false);
  const [, forcar] = useState(0);
  const ocupado = useRef(false);

  const sair = useCallback(() => navigate(base), [navigate, base]);

  const notaDe = useCallback(async (id) => {
    if (!notas.current.has(id)) notas.current.set(id, repo.obter("notas", id).catch(() => null));
    return notas.current.get(id);
  }, [repo]);

  const mostrar = useCallback(async (cartao) => {
    const nota = await notaDe(cartao.notaId);
    if (!nota) { sessao.current.descartar(cartao.id); return false; }
    setAtual({ cartao, nota, revelado: false, previsoes: null, inicio: Date.now() });
    setFase("cartao");
    // já busca as notas dos próximos
    [...sessao.current.principal.slice(0, 3), ...sessao.current.aprendendo.slice(0, 2)].forEach((c) => notaDe(c.notaId));
    return true;
  }, [notaDe]);

  const avancar = useCallback(async () => {
    clearTimeout(esperaTimer.current);
    for (;;) {
      const r = sessao.current.proximo(new Date());
      if (r.fim) {
        setFase("fim");
        setAtual(null);
        const mais = escopo.rever ? 0 : await repo.contar("cartoes", { onde: [...filtrosDoEscopo(escopo), FILTRO_NOVOS] }).catch(() => 0);
        setTemMaisNovos(mais > 0);
        return;
      }
      if (r.espera) {
        setFase("espera");
        setEspera(r.espera);
        setAtual(null);
        esperaTimer.current = setTimeout(() => avancar(), Math.max(500, r.espera.getTime() - Date.now() + 200));
        return;
      }
      if (await mostrar(r.cartao)) return;
    }
  }, [mostrar, repo, escopo]);

  // monta a sessão uma vez, com o estado de agora
  useEffect(() => {
    let vivo = true;
    (async () => {
      const agora = new Date();
      const retencao = (c) => agendador.retencao(c, agora);
      if (escopo.rever) {
        const cartoes = await repo.listar("cartoes", { onde: filtrosDoEscopo(escopo) }).catch(() => []);
        if (!vivo) return;
        sessao.current = new SessaoEstudo({ plano: montarRevisao({ agora, cartoes, escopo, retencao }), fimDoDia: estado.fimDoDia });
        avancar();
        return;
      }
      const feitos = feitosHoje(estado.dia);
      const sobra = Math.max(0, estado.config.novosPorDia - feitos.novos);
      const novos = sobra
        ? await repo.listar("cartoes", { onde: [...filtrosDoEscopo(escopo), FILTRO_NOVOS], ordem: ["ordemNovo", "asc"], limite: Math.min(sobra * 3 + 10, 500) }).catch(() => [])
        : [];
      if (!vivo) return;
      const plano = montarPlano({ agora, config: estado.config, pendentes: estado.pendentes, novos, dia: estado.dia, escopo, retencao });
      sessao.current = new SessaoEstudo({ plano, fimDoDia: estado.fimDoDia });
      avancar();
    })();
    return () => { vivo = false; clearTimeout(esperaTimer.current); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const revelar = useCallback(() => {
    setAtual((a) => {
      if (!a || a.revelado) return a;
      const agora = new Date();
      return { ...a, revelado: true, reveladoEm: agora, previsoes: agendador.previsoes(a.cartao, agora) };
    });
  }, [agendador]);

  const trocar = useCallback((depois) => {
    setSaindo(true);
    setTimeout(async () => { setSaindo(false); await depois(); }, TRANSICAO_MS);
  }, []);

  const responder = useCallback((avaliacao) => {
    if (!atual?.revelado || ocupado.current || saindo) return;
    ocupado.current = true;
    const { cartao, reveladoEm, inicio } = atual;
    // no modo rever, o cartão que ainda não venceu hoje é uma revisão antecipada (não gasta o limite do dia)
    const antecipada = escopo.rever && new Date(cartao.fsrs.due) >= estado.fimDoDia;
    const { depois, revisao, ops } = planejarResposta(repo, { cartao, avaliacao, agendador, agora: reveladoEm, duracaoMs: Date.now() - inicio, antecipada });
    const gravacao = repo.lote(ops).catch((e) => { avisar(`Não foi possível salvar esta resposta: ${e.message}`, { tipo: "erro", duracao: 8000 }); throw e; });
    const passo = sessao.current.registrar(cartao, { ...depois, id: cartao.id });
    desfazeres.current.push({ passo, revisao, gravacao });
    respostas.current.push({ avaliacao, ms: Date.now() - inicio });
    setFeedback({ avaliacao, texto: `Volta em ${formatarIntervalo(depois.fsrs.due.getTime() - reveladoEm.getTime())}`, id: Math.random() });
    trocar(async () => { await avancar(); ocupado.current = false; });
  }, [atual, repo, agendador, avancar, trocar, saindo, escopo.rever, estado.fimDoDia]);

  const desfazerUltima = useCallback(async () => {
    const u = desfazeres.current.pop();
    if (!u || ocupado.current) { if (u) desfazeres.current.push(u); return; }
    ocupado.current = true;
    try {
      await u.gravacao.catch(() => {});
      await desfazer(repo, u.revisao);
      sessao.current.desfazer(u.passo);
      respostas.current.pop();
      clearTimeout(esperaTimer.current);
      setFeedback({ avaliacao: 0, texto: "Resposta desfeita", id: Math.random() });
      await mostrar(u.passo.antes);
    } catch (e) {
      avisar(`Não foi possível desfazer: ${e.message}`, { tipo: "erro" });
    } finally { ocupado.current = false; }
  }, [repo, mostrar]);

  // tira o cartão atual da sessão (suspenso, enterrado, adiado, apagado) e segue
  const tirarAtual = useCallback((mensagem, desfazerFn) => {
    const c = atual.cartao;
    sessao.current.descartar(c.id);
    avisar(mensagem, desfazerFn ? { acao: { rotulo: "Desfazer", fn: desfazerFn } } : {});
    trocar(avancar);
  }, [atual, avancar, trocar]);

  const acoes = useMemo(() => atual && {
    enterrar: async () => {
      await enterrar(repo, [atual.cartao], { virada: estado.config.viradaDoDia });
      const c = atual.cartao;
      tirarAtual("Enterrado até amanhã.", async () => { await desenterrar(repo, [c]); loja.recontar(); });
    },
    suspender: async () => {
      const c = atual.cartao;
      await suspender(repo, [c], true);
      tirarAtual("Cartão suspenso: sai das revisões até você reativar.", async () => { await suspender(repo, [{ ...c, suspenso: true }], false); loja.recontar(); });
      loja.recontar();
    },
    resetar: async () => {
      await resetar(repo, [atual.cartao], agendador);
      tirarAtual("Cartão recomeçou do zero (voltou a ser novo).");
      loja.recontar();
    },
  }, [atual, repo, agendador, estado.config.viradaDoDia, tirarAtual, loja]);

  // teclado
  useEffect(() => {
    const tecla = (e) => {
      if (dialogo || e.defaultPrevented || e.target.closest?.("input, textarea, [contenteditable='true'], dialog")) return;
      if (e.key === "Escape") { sair(); return; }
      if ((e.key === "z" || e.key === "Z") && !e.altKey) { e.preventDefault(); desfazerUltima(); return; }
      if (fase !== "cartao" || !atual) return;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        if (atual.revelado) responder(3); else revelar();
        return;
      }
      if (atual.revelado && ["1", "2", "3", "4"].includes(e.key)) { e.preventDefault(); responder(Number(e.key)); return; }
      if (e.key === "-") acoes.enterrar();
      else if (e.key === "@" || e.key === "!") acoes.suspender();
      else if (e.key === "e" || e.key === "E") setDialogo({ tipo: "editar" });
      else if (e.key === "i" || e.key === "I") setDialogo({ tipo: "info" });
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [fase, atual, dialogo, revelar, responder, desfazerUltima, sair, acoes]);

  // tela de foco: trava a rolagem da página e leva os avisos para o topo (não cobrem os botões)
  useEffect(() => {
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.classList.add("fc-em-estudo");
    return () => { document.body.style.overflow = antes; document.body.classList.remove("fc-em-estudo"); };
  }, []);

  // ao sair: os novos respondidos saíram da fila de novos; as contagens da tela inicial se refazem
  useEffect(() => () => loja.recontar(), [loja]);

  const maisNovos = async () => {
    const extra = await repo.listar("cartoes", { onde: [...filtrosDoEscopo(escopo), FILTRO_NOVOS], ordem: ["ordemNovo", "asc"], limite: 10 });
    const naSessao = new Set([...sessao.current.principal, ...sessao.current.aprendendo].map((c) => c.id));
    const livres = extra.filter((c) => !naSessao.has(c.id) && !c.suspenso);
    sessao.current.principal.push(...livres);
    sessao.current.total += livres.length;
    avancar();
  };

  const s = sessao.current;
  const progresso = s ? s.progresso() : { feitos: 0, total: 0 };
  const pct = progresso.total ? Math.min(100, (progresso.feitos / progresso.total) * 100) : 0;

  return createPortal(
    <div className="fc fc-estudo" role="dialog" aria-modal="true" aria-label={`Estudando ${nome}`}>
      <header className="fc-estudo-topo">
        <Botao variante="fantasma" icone={X} aria-label="Sair do estudo" title="Sair (Esc)" onClick={sair} />
        <div className="fc-estudo-titulo">
          <strong>{nome}</strong>
          {s && <span className="fc-estudo-progresso" aria-label={`${progresso.feitos} de ${progresso.total} cartões`}>{progresso.feitos}/{progresso.total}</span>}
        </div>
        <div className="fc-estudo-direita">
          {s && fase === "cartao" && <Contagens c={s.contagens()} compacto destaque={atual ? tipoDoCartao(atual.cartao) : null} />}
          <Botao variante="fantasma" icone={Undo2} aria-label="Desfazer a última resposta" title="Desfazer (Z)" disabled={!desfazeres.current.length} onClick={desfazerUltima} />
          {fase === "cartao" && atual && (
            <Menu rotulo="Mais ações" itens={[
              { rotulo: "Editar o cartão", icone: Pencil, atalho: "E", aoClicar: () => setDialogo({ tipo: "editar" }) },
              { rotulo: "Informações", icone: Info, atalho: "I", aoClicar: () => setDialogo({ tipo: "info" }) },
              "-",
              { rotulo: "Enterrar até amanhã", icone: SkipForward, atalho: "-", aoClicar: acoes.enterrar },
              { rotulo: "Suspender", icone: EyeOff, atalho: "@", aoClicar: acoes.suspender },
              { rotulo: "Definir a próxima revisão", icone: CalendarClock, aoClicar: () => setDialogo({ tipo: "data" }) },
              { rotulo: "Recomeçar do zero", icone: RotateCcw, aoClicar: acoes.resetar },
              "-",
              { rotulo: "Apagar a nota", icone: Trash2, perigo: true, aoClicar: () => setDialogo({ tipo: "apagar" }) },
            ]} />
          )}
        </div>
        <div className="fc-estudo-barra" aria-hidden="true"><span style={{ width: `${pct}%` }} /></div>
      </header>

      <main className="fc-estudo-palco">
        {fase === "carregando" && <Carregando texto="Preparando a sessão…" />}
        {fase === "fim" && <Fim respostas={respostas.current} aoSair={sair} aoMaisNovos={maisNovos} temMaisNovos={temMaisNovos} rever={escopo.rever} />}
        {fase === "espera" && espera && <Espera ate={espera} aoSair={sair} />}
        {fase === "cartao" && atual && (
          <div key={`${atual.cartao.id}-${respostas.current.length}`} className={`fc-cartao${saindo ? " fc-cartao--saindo" : ""}`}
            onClick={() => { if (!atual.revelado) revelar(); }} role={atual.revelado ? undefined : "button"} tabIndex={-1}
            aria-label={atual.revelado ? undefined : "Mostrar a resposta"}>
            <div key={atual.revelado ? "verso" : "frente"} className={`fc-cartao-lado${atual.revelado ? " fc-cartao-lado--verso" : ""}`}>
              <Cartao nota={atual.nota} ordinal={atual.cartao.ordinal} lado={atual.revelado ? "verso" : "frente"} />
            </div>
          </div>
        )}
        {feedback && (
          <div key={feedback.id} className={`fc-feedback fc-feedback--${CHAVE_AVALIACAO[feedback.avaliacao] || "neutro"}`} role="status" onAnimationEnd={() => setFeedback(null)}>{feedback.texto}</div>
        )}
      </main>

      {fase === "cartao" && atual && (
        <footer className="fc-estudo-rodape">
          {!atual.revelado ? (
            <button type="button" className="fc-revelar" onClick={revelar}>Mostrar resposta<kbd>Espaço</kbd></button>
          ) : (
            <div className="fc-avaliacoes" role="group" aria-label="Como foi?">
              {AVALIACOES.map((a) => (
                <button key={a.valor} type="button" className={`fc-avaliacao fc-avaliacao--${a.chave}`} onClick={() => responder(a.valor)}
                  aria-label={`${a.rotulo}: volta em ${formatarIntervalo(atual.previsoes[a.valor].intervaloMs)}`}>
                  <small>{formatarIntervalo(atual.previsoes[a.valor].intervaloMs)}</small>
                  <b>{a.rotulo}</b>
                  <kbd>{a.tecla}</kbd>
                </button>
              ))}
            </div>
          )}
        </footer>
      )}

      {dialogo?.tipo === "info" && atual && <InfoCartao cartao={atual.cartao} aoFechar={() => setDialogo(null)} />}
      {dialogo?.tipo === "data" && atual && (
        <DefinirData cartoes={[atual.cartao]} aoFechar={() => setDialogo(null)} aoConcluir={() => { tirarAtual("Próxima revisão definida."); loja.recontar(); }} />
      )}
      {dialogo?.tipo === "editar" && atual && (
        <Suspense fallback={null}>
          <EditorNota notaId={atual.cartao.notaId} emDialogo aoFechar={() => setDialogo(null)}
            aoSalvar={(nota) => { notas.current.set(nota.id, Promise.resolve(nota)); setAtual((a) => (a ? { ...a, nota } : a)); forcar((x) => x + 1); setDialogo(null); }} />
        </Suspense>
      )}
      <Confirmar aberto={dialogo?.tipo === "apagar"} titulo="Apagar a nota?" rotulo="Apagar" perigo aoFechar={() => setDialogo(null)}
        aoConfirmar={async () => {
          const nota = atual.nota;
          setDialogo(null);
          await apagarNotas(repo, [nota]);
          [...s.principal, ...s.aprendendo].filter((c) => c.notaId === nota.id && c.id !== atual.cartao.id).forEach((c) => s.descartar(c.id));
          tirarAtual("Nota apagada.");
          loja.recontar();
        }}>
        <p className="fc-texto">A nota e todos os cartões dela (inclusive outras lacunas) somem. Não dá para desfazer.</p>
      </Confirmar>
    </div>,
    document.body,
  );
}
