/* Ajustes do aluno, salvos no banco, na conta dele. À vista: de quanto em
   quanto tempo, no máximo, cada cartão volta (intervalo máximo) e os limites
   por dia. Em "Avançado": retenção-alvo do FSRS, passos de aprendizado e a
   hora em que o dia começa. Mudar a retenção ou o intervalo máximo pode
   valer também para os cartões já estudados (reagendar, opcional). */

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronRight, RotateCcw } from "lucide-react";
import { useLoja } from "../estado/hooks.js";
import { CONFIG_PADRAO, normalizarConfig } from "../dados/modelo.js";
import { criarAgendador } from "../motor/agendador.js";
import { reagendar } from "../servicos/agenda.js";
import { Botao, Confirmar, avisar } from "./comum.jsx";

const formDe = (c) => ({
  retencao: Math.round(c.retencao * 100),
  intervaloMaximo: String(c.intervaloMaximo),
  novosPorDia: String(c.novosPorDia),
  revisoesPorDia: String(c.revisoesPorDia),
  passosAprendizado: c.passosAprendizado.join(" "),
  passosReaprendizado: c.passosReaprendizado.join(" "),
  viradaDoDia: String(c.viradaDoDia),
});

const inteiro = (s) => (String(s).trim() === "" ? NaN : Number(String(s).replace(/\./g, "")));
const passos = (s) => String(s).split(/[\s,;]+/).map((p) => p.trim().toLowerCase()).filter(Boolean);

const paraConfig = (f) => ({
  retencao: f.retencao / 100,
  intervaloMaximo: inteiro(f.intervaloMaximo),
  novosPorDia: inteiro(f.novosPorDia),
  revisoesPorDia: inteiro(f.revisoesPorDia),
  passosAprendizado: passos(f.passosAprendizado),
  passosReaprendizado: passos(f.passosReaprendizado),
  viradaDoDia: inteiro(f.viradaDoDia),
});

const PRESETS_INTERVALO = [
  { dias: 14, rotulo: "2 semanas" },
  { dias: 30, rotulo: "1 mês" },
  { dias: 90, rotulo: "3 meses" },
  { dias: 180, rotulo: "6 meses" },
  { dias: 365, rotulo: "1 ano" },
];

const um = (x) => x.toLocaleString("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 1 });

// o que a retenção escolhida significa, com o intervalo calculado pelo próprio FSRS
function explicarRetencao(r) {
  const fator = criarAgendador({ retencao: r / 100 }).modificadorIntervalo;
  if (r === 90) return { tom: "ok", texto: "Padrão do FSRS e recomendado para a maioria: bom equilíbrio entre lembrar e o volume de revisões." };
  if (r > 95) return { tom: "alerta", texto: `Cada ponto acima de 95% custa caro: os intervalos ficam ${um(fator)}× os de 90%, ou seja, cerca de ${um(1 / fator)}× mais revisões do mesmo cartão.` };
  if (r > 90) return { tom: "ok", texto: `Intervalos ${um(fator)}× os de 90%: cerca de ${um(1 / fator)}× mais revisões, para lembrar mais na hora da prova.` };
  if (r >= 80) return { tom: "ok", texto: `Intervalos ${um(fator)}× os de 90%: menos revisões, mas você erra cerca de ${100 - r}% dos cartões na hora da revisão.` };
  return { tom: "alerta", texto: `Abaixo de 80% você esquece muito (cerca de ${100 - r}% dos cartões na revisão). Os intervalos ficam ${um(fator)}× os de 90%, mas reaprender o que esqueceu consome boa parte da economia.` };
}

function Campo({ id, rotulo, dica, erro, children }) {
  return (
    <div className={`fc-ajuste${erro ? " fc-ajuste--erro" : ""}`}>
      <div className="fc-ajuste-texto">
        <label htmlFor={id}>{rotulo}</label>
        {dica && <p id={`${id}-dica`}>{dica}</p>}
      </div>
      <div className="fc-ajuste-controle">
        {children}
        {erro && <small className="fc-campo-erro" role="alert">{erro}</small>}
      </div>
    </div>
  );
}

export default function Configuracoes() {
  const { estado, repo } = useLoja();
  const salvo = estado.config;
  const inicial = useMemo(() => formDe(salvo), [salvo]);
  const [f, setF] = useState(inicial);
  const [erros, setErros] = useState({});
  const [reagendarJa, setReagendarJa] = useState(null); // null = a sugestão automática
  const [salvando, setSalvando] = useState(false);
  const [padroes, setPadroes] = useState(false);
  const [avancado, setAvancado] = useState(false);

  const mudou = JSON.stringify(f) !== JSON.stringify(inicial);
  // mudou em outro aparelho enquanto o formulário estava intacto: acompanha
  const [base, setBase] = useState(inicial);
  useEffect(() => {
    if (JSON.stringify(inicial) === JSON.stringify(base)) return;
    if (JSON.stringify(f) === JSON.stringify(base)) setF(inicial);
    setBase(inicial);
  }, [inicial]); // eslint-disable-line react-hooks/exhaustive-deps

  const mudar = (campo) => (e) => {
    const v = e.target.type === "range" ? Number(e.target.value) : e.target.value;
    setF((x) => ({ ...x, [campo]: v }));
    setErros((x) => ({ ...x, [campo]: undefined }));
  };

  const novo = paraConfig(f);
  const mudouAgenda = novo.retencao !== salvo.retencao || (Number.isFinite(novo.intervaloMaximo) && novo.intervaloMaximo !== salvo.intervaloMaximo);
  // sugestão: reagendar quando o intervalo máximo diminui (senão o limite novo só vale na próxima resposta)
  const sugerido = Number.isFinite(novo.intervaloMaximo) && novo.intervaloMaximo < salvo.intervaloMaximo;
  const vaiReagendar = mudouAgenda && (reagendarJa ?? sugerido);
  const ret = explicarRetencao(f.retencao);
  const novos = inteiro(f.novosPorDia);
  const revisoes = inteiro(f.revisoesPorDia);
  const poucasRevisoes = Number.isFinite(novos) && Number.isFinite(revisoes) && novos > 0 && revisoes < novos * 10;

  async function salvar(e) {
    e?.preventDefault();
    let config;
    try { config = normalizarConfig(novo); } catch (err) {
      setErros(err.campos || {});
      // erro num campo do Avançado: abre a seção para ele aparecer
      if (["retencao", "passosAprendizado", "passosReaprendizado", "viradaDoDia"].some((k) => err.campos?.[k])) setAvancado(true);
      avisar("Confira os campos marcados.", { tipo: "erro" });
      return;
    }
    setSalvando(true);
    try {
      await repo.lote([{ tipo: "mesclar", colecao: "config", dados: config }]);
      let n = 0;
      if (vaiReagendar) n = await reagendar(repo, criarAgendador(config), new Date());
      setF(formDe(config));
      setBase(formDe(config));
      setReagendarJa(null);
      avisar(vaiReagendar ? `Ajustes salvos. ${n === 1 ? "1 cartão reagendado" : `${n.toLocaleString("pt-BR")} cartões reagendados`}.` : "Ajustes salvos.");
    } catch (err) {
      avisar(err.message || "Não foi possível salvar.", { tipo: "erro" });
    } finally { setSalvando(false); }
  }

  const intervaloAtual = inteiro(f.intervaloMaximo);
  const escolhido = PRESETS_INTERVALO.find((p) => p.dias === intervaloAtual);
  return (
    <form className="fc-ajustes" onSubmit={salvar} noValidate>
      <header className="fc-pagina-topo"><h1>Ajustes</h1></header>

      <section className="fc-ajustes-grupo" aria-labelledby="aj-revisao">
        <h2 id="aj-revisao">Reaparição dos cartões</h2>
        <div className={`fc-ajuste fc-ajuste--largo${erros.intervaloMaximo ? " fc-ajuste--erro" : ""}`}>
          <div className="fc-ajuste-texto">
            <label htmlFor="aj-intervalo">Cada cartão volta pelo menos a cada</label>
            <p id="aj-intervalo-dica">Mesmo o que você sabe bem não fica mais tempo que isso sem aparecer. Menor = revisa com mais frequência. Para rever antes, use “Rever antes do prazo” em Baralhos.</p>
          </div>
          <div className="fc-ajuste-controle">
            <div className="fc-escolhas" role="radiogroup" aria-label="Intervalo máximo">
              {PRESETS_INTERVALO.map((p) => (
                <button key={p.dias} type="button" className="fc-escolha" role="radio" aria-checked={intervaloAtual === p.dias}
                  onClick={() => { setF((x) => ({ ...x, intervaloMaximo: String(p.dias) })); setErros((x) => ({ ...x, intervaloMaximo: undefined })); }}>
                  {p.rotulo}{p.dias === CONFIG_PADRAO.intervaloMaximo ? " (padrão)" : ""}
                </button>
              ))}
            </div>
            <div className="fc-intervalo">
              <span className="fc-unidade">{escolhido ? "ou outro:" : "Personalizado:"}</span>
              <input id="aj-intervalo" className="fc-entrada fc-entrada--num" inputMode="numeric" value={f.intervaloMaximo} onChange={mudar("intervaloMaximo")} aria-describedby="aj-intervalo-dica" />
              <span className="fc-unidade">dias</span>
            </div>
            {erros.intervaloMaximo && <small className="fc-campo-erro" role="alert">{erros.intervaloMaximo}</small>}
          </div>
        </div>
        {mudouAgenda && (
          <label className="fc-ajuste-reagendar">
            <input type="checkbox" checked={vaiReagendar} onChange={(e) => setReagendarJa(e.target.checked)} />
            <span>
              <strong>Aplicar também aos cartões já estudados</strong>
              Recalcula agora a próxima revisão de cada um{novo.retencao !== salvo.retencao ? " com a nova retenção" : ""}{novo.intervaloMaximo !== salvo.intervaloMaximo ? " dentro do novo limite" : ""}, contando da última vez que você o viu (o que já passou do prazo vence hoje). Sem isso, a mudança vale para cada cartão a partir da próxima resposta.
            </span>
          </label>
        )}
      </section>

      <section className="fc-ajustes-grupo" aria-labelledby="aj-limites">
        <h2 id="aj-limites">Limites por dia</h2>
        <Campo id="aj-novos" rotulo="Cartões novos por dia" erro={erros.novosPorDia}
          dica="Quantos cartões você vê pela primeira vez a cada dia.">
          <input id="aj-novos" className="fc-entrada fc-entrada--num" inputMode="numeric" value={f.novosPorDia} onChange={mudar("novosPorDia")} aria-describedby="aj-novos-dica" />
        </Campo>
        <Campo id="aj-revisoes" rotulo="Revisões por dia" erro={erros.revisoesPorDia}
          dica="O que passar fica para o dia seguinte. Rever antes do prazo não conta aqui.">
          <input id="aj-revisoes" className="fc-entrada fc-entrada--num" inputMode="numeric" value={f.revisoesPorDia} onChange={mudar("revisoesPorDia")} aria-describedby="aj-revisoes-dica" />
        </Campo>
        {poucasRevisoes && (
          <p className="fc-ajuste-aviso" role="status"><AlertTriangle aria-hidden="true" />
            Regra prática do Anki: revisões por dia de pelo menos 10× os novos ({(novos * 10).toLocaleString("pt-BR")} aqui). Com menos, as revisões se acumulam.
          </p>
        )}
      </section>

      <details className="fc-ajustes-grupo fc-avancado" open={avancado} onToggle={(e) => setAvancado(e.currentTarget.open)}>
        <summary><ChevronRight aria-hidden="true" />Avançado<small>retenção-alvo, passos de aprendizado, início do dia</small></summary>
        <Campo id="aj-retencao" rotulo="Retenção-alvo" erro={erros.retencao}
          dica="A chance de lembrar no dia em que o cartão volta. Maior = intervalos mais curtos e mais revisões.">
          <div className="fc-retencao">
            <input id="aj-retencao" type="range" min="70" max="99" step="1" value={f.retencao} onChange={mudar("retencao")}
              aria-valuetext={`${f.retencao}%`} aria-describedby="aj-retencao-dica aj-retencao-efeito" style={{ "--p": `${((f.retencao - 70) / 29) * 100}%` }} />
            <output htmlFor="aj-retencao" className="fc-retencao-valor">{f.retencao}%</output>
          </div>
          <div className="fc-retencao-escala" aria-hidden="true">
            {[70, 80, 90, 99].map((v) => <span key={v} style={{ "--x": (v - 70) / 29 }}>{v}%</span>)}
          </div>
          <p id="aj-retencao-efeito" className={`fc-ajuste-efeito fc-ajuste-efeito--${ret.tom}`}>{ret.texto}</p>
        </Campo>
        <Campo id="aj-passos-a" rotulo="Passos de aprendizado" erro={erros.passosAprendizado}
          dica="Quando um cartão novo volta antes de entrar em revisão, separados por espaço (m = minutos, h = horas, d = dias).">
          <input id="aj-passos-a" className="fc-entrada" value={f.passosAprendizado} onChange={mudar("passosAprendizado")} placeholder="1m 10m" aria-describedby="aj-passos-a-dica" />
        </Campo>
        <Campo id="aj-passos-r" rotulo="Passos de reaprendizado" erro={erros.passosReaprendizado}
          dica="Quando um cartão esquecido (Novamente) volta.">
          <input id="aj-passos-r" className="fc-entrada" value={f.passosReaprendizado} onChange={mudar("passosReaprendizado")} placeholder="10m" aria-describedby="aj-passos-r-dica" />
        </Campo>
        <Campo id="aj-virada" rotulo="O dia começa às" erro={erros.viradaDoDia}
          dica="Quem estuda de madrugada continua no dia anterior até essa hora.">
          <select id="aj-virada" className="fc-entrada fc-entrada--num" value={f.viradaDoDia} onChange={mudar("viradaDoDia")} aria-describedby="aj-virada-dica">
            {Array.from({ length: 24 }, (_, h) => <option key={h} value={String(h)}>{`${h}h${h === CONFIG_PADRAO.viradaDoDia ? " (padrão)" : ""}`}</option>)}
          </select>
        </Campo>
        <div className="fc-avancado-rodape">
          <p className="fc-dica">Algoritmo: FSRS-6 com os parâmetros padrão (sem otimização pelo seu histórico).</p>
          <Botao variante="fantasma" tamanho="sm" icone={RotateCcw} onClick={() => setPadroes(true)}>Restaurar padrões</Botao>
        </div>
      </details>

      <div className={`fc-ajustes-barra${mudou ? " fc-ajustes-barra--ativa" : ""}`} aria-hidden={!mudou}>
        <span>{mudou ? "Alterações não salvas" : "Tudo salvo"}</span>
        <Botao disabled={!mudou || salvando} onClick={() => { setF(inicial); setErros({}); setReagendarJa(null); }} tabIndex={mudou ? 0 : -1}>Descartar</Botao>
        <Botao type="submit" variante="primario" disabled={!mudou || salvando} tabIndex={mudou ? 0 : -1}>{salvando ? "Salvando…" : "Salvar"}</Botao>
      </div>

      <Confirmar aberto={padroes} titulo="Restaurar os padrões?" rotulo="Restaurar"
        aoConfirmar={() => { setF(formDe(normalizarConfig({}))); setErros({}); setPadroes(false); }}
        aoFechar={() => setPadroes(false)}>
        <p>Cartões voltam pelo menos a cada 3 meses, 20 novos e 200 revisões por dia, retenção 90%, passos 1m 10m e 10m, dia começando às 4h. Nada é salvo até você clicar em Salvar.</p>
      </Confirmar>
    </form>
  );
}
