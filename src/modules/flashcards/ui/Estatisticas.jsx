/* Estatísticas: só o essencial, calculado dos dados do aluno.
   - hoje, sequência de dias, acerto nas revisões e cartões aprendidos;
   - respostas nos últimos 30 dias;
   - progresso por matéria (aprendidos de quantos);
   - quanto vence nos próximos 7 dias. */

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BarChart3 } from "lucide-react";
import { useBase, useLoja } from "../estado/hooks.js";
import { chaveDia, somarDias } from "../dados/datas.js";
import { distribuicao, previsao, resumirDias, sequencia, serieRevisoes, somarPeriodo } from "../estado/estatisticas.js";
import { Colunas, numero, pct } from "./graficos.jsx";
import { Carregando, Erro, Vazio } from "./comum.jsx";

const JANELA = 120; // dias de histórico lidos (sequência e últimos 30 dias)
const COR = "var(--fc-g-linha)";

const dataDaChave = (chave) => { const [a, m, d] = chave.split("-").map(Number); return new Date(a, m - 1, d); };
const curta = (chave) => dataDaChave(chave).toLocaleDateString("pt-BR", { day: "numeric", month: "short" }).replace(".", "");
const longa = (chave) => dataDaChave(chave).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
const diaDaSemana = (chave) => dataDaChave(chave).toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");
const minutos = (ms) => {
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`;
};
const plural = (n, um, varios) => `${numero(n)} ${n === 1 ? um : varios}`;

function Numero({ rotulo, valor, detalhe }) {
  return (
    <div className="fc-numero">
      <span className="fc-numero-rotulo">{rotulo}</span>
      <strong className="fc-numero-valor">{valor}</strong>
      {detalhe && <span className="fc-numero-detalhe">{detalhe}</span>}
    </div>
  );
}

export default function Estatisticas() {
  const { estado, repo } = useLoja();
  const base = useBase();
  const virada = estado.config.viradaDoDia;
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    let vivo = true;
    const agora = new Date();
    const hoje = chaveDia(agora, virada);
    const inicio = somarDias(hoje, -(JANELA - 1));
    Promise.all([
      repo.listar("dias", { onde: [["dia", ">=", inicio]] }),
      repo.listar("cartoes", {}),
    ]).then(([dias, cartoes]) => { if (vivo) setDados({ dias, cartoes, agora, hoje, inicio }); })
      .catch((e) => { if (vivo) setErro(e); });
    return () => { vivo = false; };
  }, [repo, virada]);

  const calc = useMemo(() => {
    if (!dados) return null;
    const { agora, hoje, inicio } = dados;
    // o dia de hoje vem ao vivo da loja (respostas dadas agora aparecem já)
    const dias = [...dados.dias.filter((d) => (d.dia || d.id) !== hoje), ...(estado.dia && estado.chaveDia === hoje ? [{ ...estado.dia, dia: hoje }] : [])];
    const resumo = resumirDias(dias);
    return {
      hoje,
      deHoje: somarPeriodo(resumo, hoje, hoje),
      mes: somarPeriodo(resumo, somarDias(hoje, -29), hoje),
      seq: sequencia(resumo, hoje, inicio),
      serie: serieRevisoes(resumo, hoje, 30),
      semana: previsao(dados.cartoes, agora, { virada, dias: 7 }),
      dist: distribuicao(dados.cartoes, estado.materias || []),
    };
  }, [dados, estado.dia, estado.chaveDia, estado.materias, virada]);

  if (erro) return <Erro erro={erro} />;
  if (!calc) return <Carregando texto="Calculando…" />;
  if (!dados.cartoes.length) {
    return (
      <Vazio icone={BarChart3} titulo="Ainda não há o que medir" texto="Crie alguns cartões e estude: seu progresso aparece aqui.">
        <Link className="fc-btn fc-btn--primario" to={`${base}/novo`}>Criar cartões</Link>
      </Vazio>
    );
  }

  const { deHoje, mes, seq, serie, semana, dist } = calc;
  const acerto = mes.revisoesFeitas ? mes.revisoesCertas / mes.revisoesFeitas : null;
  const meta = estado.config.retencao;
  const maxSemana = Math.max(1, ...semana.pontos.map((p) => p.total));

  return (
    <div className="fc-estat">
      <header className="fc-pagina-topo"><h1>Estatísticas</h1></header>

      <div className="fc-numeros">
        <Numero rotulo="Hoje" valor={plural(deHoje.total, "cartão", "cartões")}
          detalhe={deHoje.total ? `${minutos(deHoje.ms)} de estudo` : "Nenhuma resposta ainda"} />
        <Numero rotulo="Sequência" valor={`${plural(seq.atual, "dia", "dias")}${seq.limitada ? "+" : ""}`}
          detalhe={seq.atual && !seq.estudouHoje ? "Estude hoje para manter" : `Recorde: ${plural(seq.maior, "dia", "dias")}`} />
        <Numero rotulo="Acerto nas revisões" valor={acerto == null ? "—" : pct(acerto)}
          detalhe={acerto == null ? "Sem revisões nos últimos 30 dias" : `Últimos 30 dias · meta ${pct(meta)}`} />
        <Numero rotulo="Aprendidos" valor={`${numero(dist.total.revisao)} de ${numero(dist.total.total)}`}
          detalhe="Já saíram da fase de aprendizado" />
      </div>

      <section className="fc-graf">
        <header className="fc-graf-topo">
          <div>
            <h2>Últimos 30 dias</h2>
            <p>{mes.total ? `${plural(mes.total, "resposta", "respostas")} · ${minutos(mes.ms)} de estudo · ${plural(mes.diasEstudados, "dia estudado", "dias estudados")}` : "Nenhuma resposta ainda."}</p>
          </div>
        </header>
        <Colunas pontos={serie} series={[{ id: "total", rotulo: "Respostas", cor: COR }]} altura={190} rotulo="Respostas por dia nos últimos 30 dias"
          rotuloX={(p) => (p.chave === calc.hoje ? "hoje" : curta(p.chave))}
          dica={(p) => ({
            titulo: longa(p.chave),
            linhas: [{ rotulo: p.total === 1 ? "resposta" : "respostas", valor: numero(p.total) }],
            rodape: p.total ? `${minutos(p.ms)}${p.revisoesFeitas ? ` · acerto ${pct(p.revisoesCertas / p.revisoesFeitas)}` : ""}` : "sem estudo",
          })} />
      </section>

      <div className="fc-estat-dupla">
        <section className="fc-graf">
          <header className="fc-graf-topo"><div><h2>Por matéria</h2><p>Aprendidos de quantos cartões</p></div></header>
          <ul className="fc-progresso-lista">
            {dist.linhas.map((l) => (
              <li key={l.id} title={`${l.novo} novos · ${l.aprendendo} aprendendo · ${l.revisao} aprendidos${l.suspenso ? ` · ${l.suspenso} suspensos` : ""}`}>
                <div className="fc-progresso-topo"><span>{l.nome}</span><small>{numero(l.revisao)} de {numero(l.total)}</small></div>
                <div className="fc-progresso-trilho" role="progressbar" aria-label={l.nome} aria-valuemin={0} aria-valuemax={l.total} aria-valuenow={l.revisao}>
                  <span style={{ width: `${l.total ? (l.revisao / l.total) * 100 : 0}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="fc-graf">
          <header className="fc-graf-topo"><div><h2>Próximos 7 dias</h2><p>Revisões que vencem em cada dia{semana.atrasados ? ` (hoje inclui ${plural(semana.atrasados, "atrasado", "atrasados")})` : ""}</p></div></header>
          <ol className="fc-semana">
            {semana.pontos.map((p, i) => (
              <li key={p.chave} aria-label={`${i === 0 ? "Hoje" : longa(p.chave)}: ${plural(p.total, "cartão", "cartões")}`}>
                <b>{numero(p.total)}</b>
                <span className="fc-semana-barra"><i style={{ height: `${(p.total / maxSemana) * 100}%` }} /></span>
                <small>{i === 0 ? "hoje" : diaDaSemana(p.chave)}</small>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
