/* Desempenho de um aluno: tudo calculado dos registros (painelDoAluno). */

import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { useApp } from "../../state/AppContext.jsx";
import { painelDoAluno } from "../../services/desempenho.js";
import { desempenhoPorSubtopico, desempenhoPorTopico, fmtPct } from "../../core/desempenho.js";
import { fmtMin } from "../../core/nucleo.js";
import { BarraFiltros, filtroEfetivo, useFiltros } from "../../ui/Filtros.jsx";
import { BarrasAcertos, CalendarioDias, LegendaAcertos, LinhaPercentual, RoscaAcertos } from "../../ui/Graficos.jsx";
import { Carregando, Tile } from "../../ui/ui.jsx";
import { SimuladosPorVestibular } from "../aluno/Simulados.jsx";

function PorConteudo({ registros, porMateria }) {
  const { ind } = useApp();
  const [caminho, setCaminho] = useState({}); // { materiaId, topicoId }
  const nivel = caminho.topicoId ? "subtopico" : caminho.materiaId ? "topico" : "materia";
  const linhas = nivel === "materia" ? porMateria
    : nivel === "topico" ? desempenhoPorTopico(registros, caminho.materiaId, ind)
      : desempenhoPorSubtopico(registros, caminho.topicoId, ind);
  const semSub = nivel === "subtopico" ? registros.filter((r) => r.topicoId === caminho.topicoId && !r.subtopicoId).length : 0;
  return (
    <section className="cartao" aria-labelledby="t-conteudo">
      <div className="linha-titulo-secao">
        <h2 id="t-conteudo" className="subtitulo">Por {nivel === "materia" ? "matéria" : nivel === "topico" ? "tópico" : "subtópico"}</h2>
        <LegendaAcertos />
      </div>
      {nivel !== "materia" && (
        <nav className="migalhas" aria-label="Nível">
          <button type="button" onClick={() => setCaminho({})}>Matérias</button>
          <ChevronRight aria-hidden="true" />
          {nivel === "subtopico"
            ? <><button type="button" onClick={() => setCaminho({ materiaId: caminho.materiaId })}>{ind.nomeMateria(caminho.materiaId)}</button><ChevronRight aria-hidden="true" /><span>{ind.nomeTopico(caminho.topicoId)}</span></>
            : <span>{ind.nomeMateria(caminho.materiaId)}</span>}
        </nav>
      )}
      <BarrasAcertos linhas={linhas} rotuloAbrir={nivel === "subtopico" ? undefined : "Abrir os detalhes"}
        aoAbrir={nivel === "materia" ? (l) => setCaminho({ materiaId: l.id }) : nivel === "topico" ? (l) => setCaminho({ materiaId: caminho.materiaId, topicoId: l.id }) : undefined} />
      {semSub > 0 && <p className="previa-linha">{semSub} {semSub === 1 ? "registro deste tópico não tem" : "registros deste tópico não têm"} subtópico e não entram aqui.</p>}
    </section>
  );
}

export function PainelDesempenho({ v }) {
  const { ind } = useApp();
  const filtros = useFiltros({ periodo: "30d" });
  const efetivo = useMemo(() => filtroEfetivo(filtros.f, v.hoje), [filtros.f, v.hoje]);
  const p = useMemo(() => (v.carregando ? null : painelDoAluno({
    questoes: v.questoes, simulados: v.simulados, sessoes: v.sessoes, resumosSemana: v.resumosSemana || [], semana: v.semana,
    revisoes: v.revisoes, plano: v.plano, progresso: v.progresso, ind, hojeIso: v.hoje, filtros: efetivo,
  })), [v, ind, efetivo]);

  if (!p) return <Carregando />;
  const q = p.questoes;
  const c = p.consistencia;
  return (
    <>
      <BarraFiltros filtros={filtros} campos={["periodo", "conteudo"]} />

      <div className="stats-grid stats-grid--4">
        <Tile valor={q.total} rotulo="questões" detalhe={q.total ? `${q.acertos} acertos · ${q.erros} erros${q.emBranco ? ` · ${q.emBranco} em branco` : ""}` : null} />
        <Tile valor={q.total ? fmtPct(q.pct) : "–"} rotulo="de acerto" />
        <Tile valor={c.diasEstudados} rotulo="dias estudados" detalhe={`de ${c.totalDias} no período`} />
        <Tile valor={fmtMin(p.minutosEstudados)} rotulo="de estudo" detalhe={`${p.metas.cumpridas} ${p.metas.cumpridas === 1 ? "meta cumprida" : "metas cumpridas"}${p.metas.atrasadasAgora ? ` · ${p.metas.atrasadasAgora} atrasadas` : ""}`} tom={p.metas.atrasadasAgora ? "perigo" : undefined} />
      </div>

      <section className="cartao consistencia" aria-labelledby="t-30">
        <h2 id="t-30" className="subtitulo">Você estudou <b className="num">{p.ultimos30.diasEstudados}</b> dos últimos 30 dias</h2>
        <p className="previa-linha">Conta como estudo: meta concluída, estudo registrado, questões ou simulado. Sequência atual: {p.ultimos30.sequenciaAtual} {p.ultimos30.sequenciaAtual === 1 ? "dia" : "dias"}.</p>
        <CalendarioDias dias={p.ultimos30.dias} hojeIso={v.hoje} />
      </section>

      <div className="grade-graficos">
        <section className="cartao" aria-labelledby="t-rosca">
          <h2 id="t-rosca" className="subtitulo">Acertos × erros</h2>
          {q.total ? <RoscaAcertos acertos={q.acertos} erros={q.erros} emBranco={q.emBranco} /> : <div className="grafico-vazio">Sem questões no período.</div>}
        </section>
        <section className="cartao" aria-labelledby="t-evo">
          <h2 id="t-evo" className="subtitulo">Evolução do acerto <small>por {({ dia: "dia", semana: "semana", mes: "mês" })[p.agrupamento]}</small></h2>
          <LinhaPercentual pontos={p.evolucao} agrupamento={p.agrupamento} />
        </section>
      </div>

      <PorConteudo registros={p.registrosQuestoes} porMateria={p.porMateria} />

      <section className="secao" aria-labelledby="t-sim">
        <h2 id="t-sim" className="subtitulo">Simulados por vestibular <small>cada prova na sua escala, sem ranking</small></h2>
        {p.simulados.quantidade ? <SimuladosPorVestibular simulados={p.registrosSimulados} /> : <div className="cartao grafico-vazio">Nenhum simulado no período.</div>}
      </section>
    </>
  );
}
