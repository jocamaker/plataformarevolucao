/* Matérias e pesos por vestibular: a matriz matérias × jornadas. Em cada
   célula, se a matéria está ativa naquela jornada e o peso dela (1 a 3). As
   edições ficam em rascunho e são aplicadas por jornada; com "levar aos
   alunos", chegam também a quem está nela, sem desfazer o que foi ajustado
   em cada aluno. O rodapé de cada jornada mostra a divisão da semana com a
   carga de referência (o mesmo cálculo do motor, com o bloco mínimo). */

import { useMemo, useState } from "react";
import { AlertTriangle, Minus, Plus, RefreshCw, Scale } from "lucide-react";
import { useApp } from "../../state/AppContext.jsx";
import { useAcao, useModelos, useTodosPlanos } from "../../state/hooks.js";
import { PESO_PADRAO, pesoDe } from "../../core/plano.js";
import { fmtMin } from "../../core/nucleo.js";
import { divisaoPrevista, SeletorPeso } from "../comum/Edital.jsx";
import { CARGA_REFERENCIA } from "./Jornadas.jsx";
import { Botao, Carregando, MensagemErro, TituloPagina, Vazio } from "../../ui/ui.jsx";

const valorNa = (modelo, materiaId) => {
  const m = modelo.materias?.find((x) => x.materiaId === materiaId);
  return { ativa: !!m && m.ativa !== false, peso: pesoDe(m), existe: !!m };
};

/* Operações de uma coluna: matéria que não está na jornada entra com
   adicionarMateria (já com o peso); o resto é definirMateria. */
function opsDaColuna(modelo, rascunho) {
  return Object.entries(rascunho || {}).flatMap(([materiaId, x]) => {
    const atual = valorNa(modelo, materiaId);
    if (!atual.existe) return x.ativa ? [{ tipo: "adicionarMateria", materiaId, peso: x.peso }] : [];
    const campos = {};
    if (x.ativa !== atual.ativa) campos.ativa = x.ativa;
    if (x.peso !== atual.peso) campos.peso = x.peso;
    return Object.keys(campos).length ? [{ tipo: "definirMateria", materiaId, campos }] : [];
  });
}

function RodapeColuna({ modelo, materias, valor, carga }) {
  const { ind } = useApp();
  const lista = materias.map((m) => ({ materiaId: m.id, ...valor(modelo, m.id) })).filter((x) => x.ativa);
  const div = divisaoPrevista(lista, carga);
  return (
    <div className="pesos-divisao">
      <small>com {fmtMin(carga)}/semana:</small>
      {lista.map((x) => <span key={x.materiaId} className="num">{ind.nomeMateria(x.materiaId)} {div.pct(x.materiaId)}% · {fmtMin(div.minutos[x.materiaId] || 0)}</span>)}
      {div.semTempo.length > 0 && <span className="txt-erro">sem tempo: {div.semTempo.map((id) => ind.nomeMateria(id)).join(", ")}</span>}
    </div>
  );
}

function AcoesColuna({ modelo, ops, alunos, levar, aoLevar, aoAplicar, ocupado, aoDescartar }) {
  if (!ops.length) return <small className="previa-linha">{alunos ? `${alunos} ${alunos === 1 ? "aluno" : "alunos"}` : "sem alunos"}</small>;
  return (
    <div className="pesos-acoes">
      {alunos > 0 && (
        <label className="checagem"><input type="checkbox" checked={levar} onChange={(e) => aoLevar(e.target.checked)} />Levar aos alunos desta jornada ({alunos})</label>
      )}
      <span className="linha-acoes">
        <Botao variante="texto" tamanho="sm" onClick={aoDescartar}>Descartar</Botao>
        <Botao variante="solido" tamanho="sm" disabled={ocupado} onClick={aoAplicar} aria-label={`Aplicar em ${modelo.nome}`}>Aplicar</Botao>
      </span>
    </div>
  );
}

export default function Pesos() {
  const { s, ind } = useApp();
  const modelos = useModelos();
  const planos = useTodosPlanos();
  const [carga, setCarga] = useState(CARGA_REFERENCIA);
  const [vestibular, setVestibular] = useState("");
  const [rascunho, setRascunho] = useState({}); // { modeloId: { materiaId: { ativa, peso } } }
  const [levar, setLevar] = useState({}); // { modeloId: false } (padrão: levar)
  const [retorno, setRetorno] = useState("");
  const { executar, ocupado, erro } = useAcao();

  const colunas = useMemo(() => {
    if (!modelos || !ind) return [];
    const ordemV = new Map(ind.vestibulares.map((v, i) => [v.id, i]));
    return modelos.filter((m) => !m.arquivado && (!vestibular || m.vestibularId === vestibular))
      .sort((a, b) => (ordemV.get(a.vestibularId) ?? 99) - (ordemV.get(b.vestibularId) ?? 99) || a.nome.localeCompare(b.nome, "pt-BR"));
  }, [modelos, ind, vestibular]);

  if (!modelos || !planos || !ind) return <Carregando />;
  const materias = ind.materias;
  const valor = (modelo, materiaId) => ({ ...valorNa(modelo, materiaId), ...(rascunho[modelo.id]?.[materiaId] || {}) });
  const mudar = (modelo, materiaId, campos) => setRascunho((r) => ({
    ...r, [modelo.id]: { ...(r[modelo.id] || {}), [materiaId]: { ...valor(modelo, materiaId), ...campos } },
  }));
  const alunosDa = (id) => planos.filter((p) => p.modeloId === id).length;
  const aplicar = (modelo) => executar(async () => {
    const ops = opsDaColuna(modelo, rascunho[modelo.id]);
    const propagar = levar[modelo.id] !== false && alunosDa(modelo.id) > 0;
    const r = await s.planos.alterarJornada(modelo.id, ops, { propagar });
    setRascunho((x) => { const { [modelo.id]: _feito, ...resto } = x; return resto; });
    setRetorno(`${modelo.nome}: aplicado${propagar ? ` na jornada e em ${r.alunos} ${r.alunos === 1 ? "aluno" : "alunos"}` : ""}.`);
  });
  const atualizarTodos = () => executar(async () => {
    const r = await s.planos.migrarMotor({ todosAlunos: true });
    setRetorno(`Motor atualizado: ${r.modelos} ${r.modelos === 1 ? "jornada" : "jornadas"} e ${r.alunos} ${r.alunos === 1 ? "aluno" : "alunos"} convertidos (o resto já estava em dia).`);
  });
  const nomeColuna = (m) => [ind.nomeVestibular(m.vestibularId), m.cursoId ? ind.nomeCurso(m.cursoId) : null].filter(Boolean).join(" · ");
  const grupos = [];
  colunas.forEach((m) => { const g = grupos.at(-1); if (g?.vestibularId === m.vestibularId) g.n++; else grupos.push({ vestibularId: m.vestibularId, n: 1 }); });

  const celula = (modelo, materia) => {
    const x = valor(modelo, materia.id);
    const nome = `${ind.nomeMateria(materia.id)} em ${modelo.nome}`;
    return (
      <div className="pesos-celula">
        <label className="interruptor"><input type="checkbox" checked={x.ativa} onChange={(e) => mudar(modelo, materia.id, { ativa: e.target.checked })} aria-label={`${nome}: ativa`} /><span>{x.ativa ? "Ativa" : "Inativa"}</span></label>
        <SeletorPeso valor={x.peso ?? PESO_PADRAO} desabilitado={!x.ativa} rotulo={`Peso de ${nome}`} aoMudar={(peso) => mudar(modelo, materia.id, { peso })} />
      </div>
    );
  };
  const acoes = (m) => (
    <AcoesColuna modelo={m} ops={opsDaColuna(m, rascunho[m.id])} alunos={alunosDa(m.id)} levar={levar[m.id] !== false} ocupado={ocupado}
      aoLevar={(v) => setLevar((l) => ({ ...l, [m.id]: v }))} aoAplicar={() => aplicar(m)}
      aoDescartar={() => setRascunho((x) => { const { [m.id]: _d, ...resto } = x; return resto; })} />
  );

  return (
    <>
      <TituloPagina eyebrow="Motor de metas" frase="*Matérias e pesos* por vestibular"
        texto="Só você define quais matérias entram em cada jornada e o peso de cada uma. O tempo da semana de cada aluno é repartido na proporção dos pesos (1 : 2 : 3), em blocos de 30 min."
        direita={<Botao variante="vidro" icone={RefreshCw} disabled={ocupado} onClick={atualizarTodos}>Atualizar motor de todos os alunos</Botao>} />

      <div className="pesos-topo">
        <label className="filtro-campo"><span>Vestibular</span>
          <select className="entrada" value={vestibular} onChange={(e) => setVestibular(e.target.value)}>
            <option value="">Todos</option>
            {ind.vestibulares.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
          </select>
        </label>
        <div className="filtro-campo"><span>Carga de referência</span>
          <span className="passo">
            <button type="button" className="icone-btn" aria-label="Menos 1 hora" disabled={carga <= 60} onClick={() => setCarga((c) => c - 60)}><Minus /></button>
            <b className="num" aria-live="polite">{fmtMin(carga)}/semana</b>
            <button type="button" className="icone-btn" aria-label="Mais 1 hora" disabled={carga >= 60 * 60} onClick={() => setCarga((c) => c + 60)}><Plus /></button>
          </span>
        </div>
        <p className="previa-linha legenda-pesos"><b>1 · Baixa</b> menor frequência · <b>2 · Média</b> intermediária · <b>3 · Alta</b> maior frequência</p>
      </div>
      <MensagemErro erro={erro} />
      {retorno && !erro && <p className="retorno-curto" role="status">{retorno}</p>}

      {colunas.length === 0 ? <div className="cartao"><Vazio icone={Scale} titulo="Nenhuma jornada para mostrar" texto="Crie jornadas em Jornadas ou mude o filtro." /></div> : (
        <>
          {/* tela larga: a matriz */}
          <div className="tabela-rolagem so-largo">
            <table className="tabela tabela-pesos">
              <thead>
                <tr><th rowSpan={2}>Matéria</th>{grupos.map((g, i) => <th key={i} colSpan={g.n} className="pesos-grupo">{ind.nomeVestibular(g.vestibularId)}</th>)}</tr>
                <tr>{colunas.map((m) => <th key={m.id}>{m.cursoId ? ind.nomeCurso(m.cursoId) : m.nome}</th>)}</tr>
              </thead>
              <tbody>
                {materias.map((mat) => (
                  <tr key={mat.id}>
                    <th scope="row"><span className="celula-conteudo"><i className="ponto-materia" style={{ "--cor": ind.corDaMateria(mat.id) }} aria-hidden="true" />{mat.nome}</span></th>
                    {colunas.map((m) => <td key={m.id}>{celula(m, mat)}</td>)}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr><th>Divisão prevista</th>{colunas.map((m) => <td key={m.id}><RodapeColuna modelo={m} materias={materias} valor={valor} carga={carga} /></td>)}</tr>
                <tr><th /> {colunas.map((m) => <td key={m.id}>{acoes(m)}</td>)}</tr>
              </tfoot>
            </table>
          </div>

          {/* celular: uma lista por jornada */}
          <div className="so-estreito pesos-cartoes">
            {colunas.map((m) => (
              <section key={m.id} className="cartao" aria-label={m.nome}>
                <span className="eyebrow">{nomeColuna(m)}</span>
                <strong>{m.nome}</strong>
                <ul className="lista-simples">
                  {materias.map((mat) => (
                    <li key={mat.id} className="pesos-linha">
                      <span className="celula-conteudo"><i className="ponto-materia" style={{ "--cor": ind.corDaMateria(mat.id) }} aria-hidden="true" />{mat.nome}</span>
                      {celula(m, mat)}
                    </li>
                  ))}
                </ul>
                <RodapeColuna modelo={m} materias={materias} valor={valor} carga={carga} />
                {acoes(m)}
              </section>
            ))}
          </div>
        </>
      )}
      <p className="previa-linha"><AlertTriangle aria-hidden="true" width={14} height={14} /> Uma matéria inativa continua no edital de cada aluno, com o histórico, mas não gera metas.</p>
    </>
  );
}
