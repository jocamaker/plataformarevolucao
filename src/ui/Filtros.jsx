/* Filtros reutilizáveis: período (atalhos + personalizado), conteúdo em
   cascata, vestibular, ano, curso. Uma linha acima dos resultados, com
   "Limpar". O estado vive em quem usa (useFiltros). */

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { PERIODOS, datasDoPeriodo } from "../core/datas.js";
import { useApp } from "../state/AppContext.jsx";
import { Botao } from "./ui.jsx";

export const FILTROS_VAZIOS = { periodo: "tudo", inicio: "", fim: "", materiaId: "", topicoId: "", subtopicoId: "", vestibularId: "", ano: "", cursoId: "", tipo: "", programaId: "", busca: "" };

export function useFiltros(inicial = {}) {
  const base = useMemo(() => ({ ...FILTROS_VAZIOS, ...inicial }), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [f, setF] = useState(base);
  const mudar = (campos) => setF((x) => ({ ...x, ...campos }));
  const limpar = () => setF(base);
  const ativo = JSON.stringify(f) !== JSON.stringify(base);
  return { f, mudar, limpar, ativo };
}

/* Converte o estado dos filtros no formato das funções de desempenho. */
export function filtroEfetivo(f, hojeIso) {
  const { inicio, fim } = f.periodo === "personalizado" ? { inicio: f.inicio || null, fim: f.fim || null } : datasDoPeriodo(f.periodo, hojeIso);
  return {
    inicio, fim,
    materiaId: f.materiaId || undefined, topicoId: f.topicoId || undefined, subtopicoId: f.subtopicoId || undefined,
    vestibularId: f.vestibularId || undefined, ano: f.ano || undefined, cursoId: f.cursoId || undefined,
  };
}

function Seletor({ rotulo, valor, aoMudar, opcoes, todos = "Todos", desativado }) {
  return (
    <label className="filtro-campo">
      <span>{rotulo}</span>
      <select className="entrada" value={valor} disabled={desativado} onChange={(e) => aoMudar(e.target.value)}>
        <option value="">{todos}</option>
        {opcoes.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
      </select>
    </label>
  );
}

/* campos: lista do que mostrar — "periodo", "conteudo", "vestibular", "ano", "curso", "tipo", "programa", "busca" */
export function BarraFiltros({ filtros, campos, anos = [], tipos = [], programas = [], rotuloBusca = "Buscar" }) {
  const { ind } = useApp();
  const { f, mudar, limpar, ativo } = filtros;
  if (!ind) return null;
  const tem = (c) => campos.includes(c);
  return (
    <div className="barra-filtros" role="search">
      {tem("busca") && (
        <label className="filtro-campo filtro-campo--largo">
          <span>{rotuloBusca}</span>
          <input className="entrada" type="search" value={f.busca} placeholder="Digite para buscar" onChange={(e) => mudar({ busca: e.target.value })} />
        </label>
      )}
      {tem("periodo") && (
        <>
          <label className="filtro-campo">
            <span>Período</span>
            <select className="entrada" value={f.periodo} onChange={(e) => mudar({ periodo: e.target.value })}>
              {PERIODOS.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </label>
          {f.periodo === "personalizado" && (
            <>
              <label className="filtro-campo"><span>De</span><input className="entrada" type="date" value={f.inicio} max={f.fim || undefined} onChange={(e) => mudar({ inicio: e.target.value })} /></label>
              <label className="filtro-campo"><span>Até</span><input className="entrada" type="date" value={f.fim} min={f.inicio || undefined} onChange={(e) => mudar({ fim: e.target.value })} /></label>
            </>
          )}
        </>
      )}
      {tem("conteudo") && (
        <>
          <Seletor rotulo="Matéria" valor={f.materiaId} opcoes={ind.materias} todos="Todas"
            aoMudar={(v) => mudar({ materiaId: v, topicoId: "", subtopicoId: "" })} />
          <Seletor rotulo="Tópico" valor={f.topicoId} opcoes={f.materiaId ? ind.topicosDaMateria(f.materiaId) : []} desativado={!f.materiaId}
            aoMudar={(v) => mudar({ topicoId: v, subtopicoId: "" })} />
          <Seletor rotulo="Subtópico" valor={f.subtopicoId} opcoes={f.topicoId ? ind.subtopicosDoTopico(f.topicoId) : []}
            desativado={!f.topicoId || !ind.subtopicosDoTopico(f.topicoId).length} aoMudar={(v) => mudar({ subtopicoId: v })} />
        </>
      )}
      {tem("vestibular") && <Seletor rotulo="Vestibular" valor={f.vestibularId} opcoes={ind.vestibulares} aoMudar={(v) => mudar({ vestibularId: v })} />}
      {tem("ano") && <Seletor rotulo="Ano" valor={f.ano} opcoes={anos.map((a) => ({ id: String(a), nome: String(a) }))} aoMudar={(v) => mudar({ ano: v })} />}
      {tem("curso") && <Seletor rotulo="Curso" valor={f.cursoId} opcoes={ind.cursos} aoMudar={(v) => mudar({ cursoId: v })} />}
      {tem("programa") && <Seletor rotulo="Programa" valor={f.programaId} opcoes={programas} aoMudar={(v) => mudar({ programaId: v })} />}
      {tem("tipo") && <Seletor rotulo="Tipo" valor={f.tipo} opcoes={tipos} aoMudar={(v) => mudar({ tipo: v })} />}
      {ativo && <Botao variante="texto" tamanho="sm" icone={X} className="filtro-limpar" onClick={limpar}>Limpar filtros</Botao>}
    </div>
  );
}
