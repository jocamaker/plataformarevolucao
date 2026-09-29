/* Diálogos sobre cartões: informações (estado FSRS e histórico) e definir
   a data da próxima revisão (adiantar, adiar, data escolhida). */

import { useEffect, useState } from "react";
import { useLoja } from "../estado/hooks.js";
import { ESTADOS } from "../dados/modelo.js";
import { AVALIACOES, formatarIntervalo } from "../motor/agendador.js";
import { adiar, definirData } from "../servicos/agenda.js";
import { Botao, Dialogo, Erro } from "./comum.jsx";

export const NOME_ESTADO = { [ESTADOS.novo]: "Novo", [ESTADOS.aprendendo]: "Aprendendo", [ESTADOS.revisao]: "Revisão", [ESTADOS.reaprendendo]: "Reaprendendo" };
export const ROTULO_AVALIACAO = Object.fromEntries(AVALIACOES.map((a) => [a.valor, a.rotulo]));
export const CHAVE_AVALIACAO = Object.fromEntries(AVALIACOES.map((a) => [a.valor, a.chave]));

const data = (d) => (d ? new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
const dataCurta = (d) => new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "2-digit" });
const num = (v, casas = 1) => (Number.isFinite(v) ? v.toLocaleString("pt-BR", { maximumFractionDigits: casas }) : "—");

export function estadoDoCartao(c) {
  if (c.suspenso) return "Suspenso";
  if (c.enterradoAte && new Date(c.enterradoAte) > new Date()) return c.fsrs.state === ESTADOS.novo ? "Adiado" : "Enterrado";
  return NOME_ESTADO[c.fsrs.state];
}

export function InfoCartao({ cartao, aoFechar }) {
  const { repo, agendador } = useLoja();
  const [historico, setHistorico] = useState(null);
  useEffect(() => {
    if (!cartao) return undefined;
    let vivo = true;
    setHistorico(null);
    repo.listar("revisoes", { onde: [["cartaoId", "==", cartao.id]], ordem: ["feitaEm", "desc"], limite: 30 })
      .then((l) => { if (vivo) setHistorico(l); }).catch(() => { if (vivo) setHistorico([]); });
    return () => { vivo = false; };
  }, [repo, cartao]);
  if (!cartao) return <Dialogo aberto={false} aoFechar={aoFechar} titulo="" />;
  const f = cartao.fsrs;
  const r = agendador.retencao(cartao, new Date());
  const novo = f.state === ESTADOS.novo;
  const itens = [
    ["Estado", estadoDoCartao(cartao)],
    ["Próxima revisão", novo ? "Na fila de novos" : data(f.due)],
    ["Probabilidade de lembrar agora", r == null ? "—" : `${num(r * 100, 0)}%`],
    ["Estabilidade", novo ? "—" : `${num(f.stability)} ${f.stability >= 1.5 ? "dias" : "dia"}`],
    ["Dificuldade", novo ? "—" : `${num(f.difficulty)} de 10`],
    ["Revisões", f.reps],
    ["Esquecimentos", f.lapses],
    ["Última revisão", data(f.last_review)],
    ["Criado em", data(cartao.criadoEm)],
  ];
  return (
    <Dialogo aberto aoFechar={aoFechar} titulo="Informações do cartão" largura={520}>
      <div className="fc-dialogo-corpo">
        <dl className="fc-info">
          {itens.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
        </dl>
        <p className="fc-dica">Estabilidade: quantos dias até a chance de lembrar cair para 90%. Dificuldade: de 1 (fácil) a 10 (difícil), aprendida com as suas respostas.</p>
        <h3 className="fc-subtitulo">Histórico</h3>
        {!historico ? <p className="fc-dica">Carregando…</p> : historico.length === 0 ? <p className="fc-dica">Ainda sem respostas.</p> : (
          <ol className="fc-historico">
            {historico.map((h) => (
              <li key={h.id}>
                <span className={`fc-bolinha fc-bolinha--${CHAVE_AVALIACAO[h.avaliacao]}`} />
                <span>{dataCurta(h.feitaEm)}</span>
                <b>{ROTULO_AVALIACAO[h.avaliacao]}</b>
                <span className="fc-historico-intervalo">{h.intervaloDias != null ? `→ ${formatarIntervalo(h.intervaloDias * 86400000)}` : ""}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
      <footer className="fc-dialogo-acoes"><Botao onClick={aoFechar}>Fechar</Botao></footer>
    </Dialogo>
  );
}

const paraInput = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/* cartoes: os cartões (um ou vários). aoConcluir(cartoesNovos) */
export function DefinirData({ cartoes, aoFechar, aoConcluir }) {
  const { repo, estado } = useLoja();
  const [opcao, setOpcao] = useState("hoje");
  const [livre, setLivre] = useState(() => paraInput(new Date(Date.now() + 86400000)));
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState(null);
  if (!cartoes) return <Dialogo aberto={false} aoFechar={aoFechar} titulo="" />;
  const n = cartoes.length;
  const virada = estado.config.viradaDoDia;
  const confirmar = async () => {
    setOcupado(true);
    setErro(null);
    try {
      const agora = new Date();
      let r;
      if (opcao === "hoje") r = await definirData(repo, cartoes, agora, agora);
      else if (opcao === "data") {
        const [a, m, d] = livre.split("-").map(Number);
        r = await definirData(repo, cartoes, new Date(a, m - 1, d, virada), agora);
      } else r = await adiar(repo, cartoes, Number(opcao), agora);
      aoConcluir?.(r);
      aoFechar();
    } catch (e) { setErro(e); } finally { setOcupado(false); }
  };
  const opcoes = [["hoje", "Revisar hoje"], ["1", "Adiar 1 dia"], ["3", "Adiar 3 dias"], ["7", "Adiar 1 semana"], ["data", "Escolher a data"]];
  return (
    <Dialogo aberto aoFechar={aoFechar} titulo={n === 1 ? "Próxima revisão" : `Próxima revisão de ${n} cartões`} largura={460}>
      <div className="fc-dialogo-corpo">
        <div className="fc-escolhas" role="radiogroup" aria-label="Quando">
          {opcoes.map(([v, r]) => <button key={v} type="button" role="radio" aria-checked={opcao === v} className="fc-escolha" onClick={() => setOpcao(v)}>{r}</button>)}
        </div>
        {opcao === "data" && (
          <label className="fc-campo"><span>Data</span>
            <input type="date" className="fc-entrada" value={livre} min={paraInput(new Date())} onChange={(e) => setLivre(e.target.value)} />
          </label>
        )}
        <p className="fc-dica">
          {opcao === "hoje" ? "Já estudados voltam para hoje; novos vão para a frente da fila de novos."
            : opcao === "data" ? "Novos ficam fora da fila até essa data."
              : "Conta a partir de quando cada cartão venceria. Adiar demais aumenta a chance de esquecer."}
        </p>
        <Erro erro={erro} />
      </div>
      <footer className="fc-dialogo-acoes">
        <Botao onClick={aoFechar}>Cancelar</Botao>
        <Botao variante="primario" disabled={ocupado} onClick={confirmar}>{ocupado ? "Salvando…" : "Confirmar"}</Botao>
      </footer>
    </Dialogo>
  );
}
