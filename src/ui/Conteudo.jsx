/* Peças ligadas à estrutura acadêmica: seletor em cascata, nomes e status. */

import { AlertTriangle, CheckCircle2, CircleDashed, PlayCircle } from "lucide-react";
import { useApp } from "../state/AppContext.jsx";
import { Campo } from "./ui.jsx";

/* Matéria → tópico → subtópico, por id. `obrigatorio`: quais níveis são exigidos. */
export function SeletorConteudo({ valor, aoMudar, erros = {}, obrigatorio = { materia: true, topico: true }, niveis = 3, materias }) {
  const { ind } = useApp();
  if (!ind) return null;
  const lista = materias ? ind.materias.filter((m) => materias.includes(m.id)) : ind.materias;
  const topicos = valor.materiaId ? ind.topicosDaMateria(valor.materiaId) : [];
  const subtopicos = valor.topicoId ? ind.subtopicosDoTopico(valor.topicoId) : [];
  const opcional = (nivel) => (obrigatorio[nivel] ? "" : " (opcional)");
  return (
    <>
      <Campo rotulo={`Matéria${opcional("materia")}`} erro={erros.materiaId}>
        <select className="entrada" value={valor.materiaId || ""} aria-invalid={!!erros.materiaId}
          onChange={(e) => aoMudar({ materiaId: e.target.value, topicoId: "", subtopicoId: "" })}>
          <option value="">{obrigatorio.materia ? "Selecione…" : "Todas"}</option>
          {lista.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
        </select>
      </Campo>
      {niveis >= 2 && (
        <Campo rotulo={`Tópico${opcional("topico")}`} erro={erros.topicoId}>
          <select className="entrada" value={valor.topicoId || ""} disabled={!valor.materiaId} aria-invalid={!!erros.topicoId}
            onChange={(e) => aoMudar({ ...valor, topicoId: e.target.value, subtopicoId: "" })}>
            <option value="">{!valor.materiaId ? "Escolha a matéria primeiro" : obrigatorio.topico ? "Selecione…" : "Todos"}</option>
            {topicos.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </select>
        </Campo>
      )}
      {niveis >= 3 && (
        <Campo rotulo="Subtópico (opcional)" erro={erros.subtopicoId}>
          <select className="entrada" value={valor.subtopicoId || ""} disabled={!valor.topicoId || !subtopicos.length}
            onChange={(e) => aoMudar({ ...valor, subtopicoId: e.target.value })}>
            <option value="">{!valor.topicoId ? "Escolha o tópico primeiro" : subtopicos.length ? "Todos / nenhum" : "Sem subtópicos"}</option>
            {subtopicos.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
        </Campo>
      )}
    </>
  );
}

export function PontoMateria({ materiaId, cor }) {
  const { ind } = useApp();
  return <i className="ponto-materia" style={{ "--cor": cor || ind?.corDaMateria(materiaId) || "var(--muted)" }} aria-hidden="true" />;
}

/* "Biologia · Citologia · Membrana" */
export function NomeConteudo({ materiaId, topicoId, subtopicoId, semMateria = false }) {
  const { ind } = useApp();
  if (!ind) return null;
  const partes = [!semMateria && materiaId && ind.nomeMateria(materiaId), topicoId && ind.nomeTopico(topicoId), subtopicoId && ind.nomeSubtopico(subtopicoId)].filter(Boolean);
  return <>{partes.join(" · ")}</>;
}

export const STATUS = {
  nao_iniciado: { nome: "Não iniciado", icone: CircleDashed, classe: "" },
  em_andamento: { nome: "Em andamento", icone: PlayCircle, classe: "etiqueta--rev" },
  concluido: { nome: "Concluído", icone: CheckCircle2, classe: "etiqueta--ok" },
  atrasado: { nome: "Atrasado", icone: AlertTriangle, classe: "etiqueta--perigo" },
};

// status sempre com ícone + texto (nunca só cor)
export function EtiquetaStatus({ status, extra }) {
  const st = STATUS[status] || STATUS.nao_iniciado;
  const Icone = st.icone;
  return <span className={`etiqueta etiqueta-status ${st.classe}`}><Icone aria-hidden="true" />{st.nome}{extra ? ` · ${extra}` : ""}</span>;
}

/* Para quais jornadas (programas) vale um material ou uma playlist.
   Nenhuma marcada = todas. */
export function SeletorProgramas({ programas, valor = [], aoMudar }) {
  return (
    <fieldset className="lista-checagem lista-checagem--linha">
      <legend>Programas</legend>
      {programas.map((p) => (
        <label key={p.id} className="checagem">
          <input type="checkbox" checked={valor.includes(p.id)} onChange={(e) => aoMudar(e.target.checked ? [...valor, p.id] : valor.filter((x) => x !== p.id))} />{p.nome}
        </label>
      ))}
      <small className="previa-linha">{valor.length ? `Só os alunos ${valor.length === 1 ? "dessa jornada" : "dessas jornadas"} veem.` : "Nenhum marcado: todos os alunos veem."}</small>
    </fieldset>
  );
}

export const nomesDosProgramas = (ids = [], programas = []) =>
  (ids.length ? ids.map((id) => programas.find((p) => p.id === id)?.nome || "jornada removida").join(", ") : "Todos os programas");
