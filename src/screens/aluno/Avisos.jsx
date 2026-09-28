import { useEffect, useState } from "react";
import { Bell, ChevronRight } from "lucide-react";
import { useApp } from "../../state/AppContext.jsx";
import { useEu, useNotificacoes } from "../../state/hooks.js";
import { fmtDataHora } from "../../core/datas.js";
import { PRIORIDADES_NOTIFICACAO } from "../../services/notificacoes.js";
import { Abas, Botao, Carregando, Dialogo, TituloPagina, Vazio } from "../../ui/ui.jsx";
import { Frase } from "../../ui/ui.jsx";

const nomePrioridade = (id) => PRIORIDADES_NOTIFICACAO.find((p) => p.id === id)?.nome || "Normal";
// data local da hora gravada (ISO UTC → horário do aparelho)
const quando = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  const dois = (n) => String(n).padStart(2, "0");
  return fmtDataHora(`${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}T${dois(d.getHours())}:${dois(d.getMinutes())}`);
};

export function AvisoLinha({ aviso, aoAbrir }) {
  const novo = !aviso.lidaEm;
  return (
    <button type="button" className={`aviso-linha${novo ? " aviso-linha--novo" : ""} aviso-linha--${aviso.prioridade}`} onClick={aoAbrir}>
      <span className="aviso-linha-topo">
        {novo && <span className="selo-nova">Novo</span>}
        {aviso.prioridade !== "normal" && <span className={`etiqueta${aviso.prioridade === "urgente" ? " etiqueta--perigo" : " etiqueta--rev"}`}>{nomePrioridade(aviso.prioridade)}</span>}
        <strong>{aviso.titulo}</strong>
      </span>
      <span className="aviso-linha-texto">{aviso.mensagem.split("\n")[0]}</span>
      <span className="aviso-linha-meta">{aviso.autorNome} · {quando(aviso.criadaEm)}<ChevronRight aria-hidden="true" /></span>
    </button>
  );
}

/* Abrir o aviso marca como lido (uma vez; o histórico fica). */
export function LerAviso({ aviso, aoFechar }) {
  const { s } = useApp();
  useEffect(() => {
    if (aviso && !aviso.lidaEm) s.notificacoes.marcarLida(aviso.id).catch(() => {});
  }, [aviso, s]);
  return (
    <Dialogo aberto={!!aviso} aoFechar={aoFechar} titulo={aviso?.titulo} largura={520}>
      {aviso && (
        <div className="form">
          <p className="previa-linha">{aviso.autorNome} · {quando(aviso.criadaEm)}{aviso.prioridade !== "normal" ? ` · ${nomePrioridade(aviso.prioridade)}` : ""}</p>
          <p className="texto-aviso"><Frase texto={aviso.mensagem} /></p>
          <div className="dialogo-acoes"><Botao variante="solido" onClick={aoFechar}>Fechar</Botao></div>
        </div>
      )}
    </Dialogo>
  );
}

export default function Avisos() {
  const eu = useEu();
  const avisos = useNotificacoes(eu.id);
  const [aba, setAba] = useState("todos");
  const [aberto, setAberto] = useState(null);
  if (!avisos) return <Carregando />;
  const novos = avisos.filter((n) => !n.lidaEm);
  const lista = aba === "novos" ? novos : aba === "lidos" ? avisos.filter((n) => n.lidaEm) : avisos;
  return (
    <>
      <TituloPagina eyebrow="Do seu professor" frase="Seus *avisos*" />
      <Abas rotulo="Filtrar avisos" ativa={aba} aoMudar={setAba} itens={[
        { k: "todos", label: "Todos", contador: avisos.length },
        { k: "novos", label: "Novos", contador: novos.length },
        { k: "lidos", label: "Lidos" },
      ]} />
      {lista.length === 0
        ? <div className="cartao"><Vazio icone={Bell} titulo={aba === "novos" ? "Nenhum aviso novo" : "Nenhum aviso"} texto="Quando o professor mandar um aviso, ele aparece aqui e na tela inicial." /></div>
        : <div className="lista-avisos">{lista.map((n) => <AvisoLinha key={n.id} aviso={n} aoAbrir={() => setAberto(n)} />)}</div>}
      <LerAviso aviso={aberto} aoFechar={() => setAberto(null)} />
    </>
  );
}

export { quando };
