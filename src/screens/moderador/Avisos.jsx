import { useState } from "react";
import { ChevronDown, ChevronRight, Megaphone, Send } from "lucide-react";
import { useApp } from "../../state/AppContext.jsx";
import { errosDeCampo, useAcao, useAlunos, useEnviosAvisos } from "../../state/hooks.js";
import { PRIORIDADES_NOTIFICACAO, alunosDoDestino } from "../../services/notificacoes.js";
import { Botao, Campo, Carregando, Frase, MensagemErro, TituloPagina, Vazio } from "../../ui/ui.jsx";
import { quando } from "../aluno/Avisos.jsx";

function descreverDestino(d, ind, alunos) {
  if (!d) return "";
  if (d.tipo === "todos") return "Todos os alunos";
  if (d.tipo === "grupo") return [d.vestibularId && ind?.nomeVestibular(d.vestibularId), d.cursoId && ind?.nomeCurso(d.cursoId)].filter(Boolean).join(" · ") || "Grupo";
  const nomes = (d.alunoIds || []).map((id) => alunos.find((a) => a.id === id)?.nome).filter(Boolean);
  return nomes.length > 3 ? `${nomes.slice(0, 3).join(", ")} e mais ${nomes.length - 3}` : nomes.join(", ");
}

function Compor({ alunos }) {
  const { s, ind } = useApp();
  const vazio = { titulo: "", mensagem: "", prioridade: "normal", tipo: "todos", vestibularId: "", cursoId: "", alunoIds: [] };
  const [f, setF] = useState(vazio);
  const [ok, setOk] = useState("");
  const { executar, ocupado, erro } = useAcao();
  const erros = errosDeCampo(erro);
  const destino = f.tipo === "todos" ? { tipo: "todos" } : f.tipo === "grupo" ? { tipo: "grupo", vestibularId: f.vestibularId || null, cursoId: f.cursoId || null } : { tipo: "alunos", alunoIds: f.alunoIds };
  const alcance = alunosDoDestino(alunos, destino).length;
  const enviar = () => executar(async () => {
    const r = await s.notificacoes.enviar({ titulo: f.titulo, mensagem: f.mensagem, prioridade: f.prioridade, destino });
    setOk(`Aviso enviado para ${r.destinatarios} ${r.destinatarios === 1 ? "aluno" : "alunos"}.`);
    setF(vazio);
  });
  return (
    <section className="cartao form" aria-labelledby="t-novo-aviso">
      <h2 id="t-novo-aviso" className="subtitulo">Novo aviso</h2>
      <Campo rotulo="Título" erro={erros.titulo}><input className="entrada" maxLength={120} value={f.titulo} onChange={(e) => { setOk(""); setF({ ...f, titulo: e.target.value }); }} /></Campo>
      <Campo rotulo="Mensagem" ajuda="Enter quebra a linha; *palavra* fica em destaque." erro={erros.mensagem}>
        <textarea className="entrada" rows={4} value={f.mensagem} onChange={(e) => setF({ ...f, mensagem: e.target.value })} />
      </Campo>
      <div className="form-linha">
        <Campo rotulo="Prioridade" erro={erros.prioridade}>
          <select className="entrada" value={f.prioridade} onChange={(e) => setF({ ...f, prioridade: e.target.value })}>
            {PRIORIDADES_NOTIFICACAO.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Para" erro={erros.destino}>
          <select className="entrada" value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>
            <option value="todos">Todos os alunos</option>
            <option value="grupo">Um grupo (vestibular e/ou curso)</option>
            <option value="alunos">Alunos escolhidos</option>
          </select>
        </Campo>
      </div>
      {f.tipo === "grupo" && (
        <div className="form-linha">
          <Campo rotulo="Vestibular">
            <select className="entrada" value={f.vestibularId} onChange={(e) => setF({ ...f, vestibularId: e.target.value })}>
              <option value="">Qualquer</option>{ind?.vestibulares.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Curso">
            <select className="entrada" value={f.cursoId} onChange={(e) => setF({ ...f, cursoId: e.target.value })}>
              <option value="">Qualquer</option>{ind?.cursos.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </Campo>
        </div>
      )}
      {f.tipo === "alunos" && (
        <fieldset className="lista-checagem">
          <legend>Alunos</legend>
          {alunos.filter((a) => a.ativo !== false).map((a) => (
            <label key={a.id} className="checagem">
              <input type="checkbox" checked={f.alunoIds.includes(a.id)}
                onChange={(e) => setF({ ...f, alunoIds: e.target.checked ? [...f.alunoIds, a.id] : f.alunoIds.filter((x) => x !== a.id) })} />
              {a.nome}<small>{ind?.nomeVestibular(a.vestibularId)}</small>
            </label>
          ))}
        </fieldset>
      )}
      {(f.titulo || f.mensagem) && (
        <div className="previa-aviso"><span className="eyebrow">Prévia</span><strong>{f.titulo}</strong><p><Frase texto={f.mensagem} /></p></div>
      )}
      {ok && <p className="retorno-curto" role="status">{ok}</p>}
      {!Object.keys(erros).length && <MensagemErro erro={erro} />}
      <div className="linha-acoes">
        <span className="previa-linha">Vai para {alcance} {alcance === 1 ? "aluno" : "alunos"}.</span>
        <Botao variante="solido" icone={Send} disabled={ocupado || !alcance} onClick={enviar}>{ocupado ? "Enviando…" : "Enviar aviso"}</Botao>
      </div>
    </section>
  );
}

export default function AvisosModerador() {
  const { ind } = useApp();
  const alunos = useAlunos();
  const envios = useEnviosAvisos();
  const [aberto, setAberto] = useState(null);
  if (!alunos || !envios) return <Carregando />;
  const nome = (id) => alunos.find((a) => a.id === id)?.nome || "Aluno removido";
  return (
    <>
      <TituloPagina eyebrow="Comunicação" frase="*Avisos* para a turma" texto="O aviso aparece destacado na tela inicial do aluno até ele abrir. O histórico fica guardado, com quem já leu." />
      <Compor alunos={alunos} />
      <h2 className="subtitulo">Enviados</h2>
      {envios.length === 0 ? <div className="cartao"><Vazio icone={Megaphone} titulo="Nenhum aviso enviado" /></div> : (
        <ul className="lista-simples">
          {envios.map((e) => (
            <li key={e.envioId} className="cartao envio">
              <button type="button" className="envio-topo" aria-expanded={aberto === e.envioId} onClick={() => setAberto(aberto === e.envioId ? null : e.envioId)}>
                {aberto === e.envioId ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
                <span><strong>{e.titulo}</strong><small>{quando(e.criadaEm)} · {descreverDestino(e.destino, ind, alunos)}{e.prioridade !== "normal" ? ` · ${PRIORIDADES_NOTIFICACAO.find((p) => p.id === e.prioridade)?.nome}` : ""}</small></span>
                <span className="num envio-lidas">{e.lidas}/{e.total} leram</span>
              </button>
              {aberto === e.envioId && (
                <div className="envio-corpo">
                  <p><Frase texto={e.mensagem} /></p>
                  <ul className="lista-leitura">
                    {e.alunos.map((a) => <li key={a.alunoId}>{nome(a.alunoId)} <small>{a.lidaEm ? `leu ${quando(a.lidaEm)}` : "ainda não leu"}</small></li>)}
                  </ul>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
