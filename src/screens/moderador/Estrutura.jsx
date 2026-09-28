import { useState } from "react";
import { Archive, ArchiveRestore, ArrowDown, ArrowUp, ChevronDown, ChevronRight, Download, Network, Pencil, Plus } from "lucide-react";
import { useApp } from "../../state/AppContext.jsx";
import { errosDeCampo, useAcao } from "../../state/hooks.js";
import { fmtMin } from "../../core/nucleo.js";
import { Abas, Botao, Campo, Carregando, Dialogo, MensagemErro, TituloPagina, Vazio } from "../../ui/ui.jsx";

const NOMES = { materia: "matéria", topico: "tópico", subtopico: "subtópico", vestibular: "vestibular", curso: "curso" };
const FEMININO = new Set(["materia"]);
const novoNome = (tipo) => `${FEMININO.has(tipo) ? "Nova" : "Novo"} ${NOMES[tipo]}`;
const PAI = { topico: "materiaId", subtopico: "topicoId" };

/* Formulário de um item (novo ou edição). */
function FormItem({ alvo, aoFechar }) {
  const { s } = useApp();
  const { tipo, item, paiId } = alvo;
  const [f, setF] = useState({ nome: item?.nome || "", cor: item?.cor || "#8A8A8A", cargaMin: item?.cargaMin ?? "", descricao: item?.descricao || "" });
  const { executar, ocupado, erro } = useAcao();
  const erros = errosDeCampo(erro);
  const temCor = tipo === "materia" || tipo === "vestibular";
  const temCarga = tipo === "topico" || tipo === "subtopico";
  const salvar = () => executar(async () => {
    await s.estrutura.salvar(tipo, { ...(item ? { id: item.id } : {}), ...(PAI[tipo] ? { [PAI[tipo]]: item?.[PAI[tipo]] || paiId } : {}), nome: f.nome, ...(temCor ? { cor: f.cor } : {}), ...(temCarga ? { cargaMin: f.cargaMin } : {}) });
    aoFechar();
  });
  return (
    <Dialogo aberto aoFechar={aoFechar} titulo={item ? `Editar ${NOMES[tipo]}` : novoNome(tipo)} largura={440}>
      <div className="form">
        <Campo rotulo="Nome" erro={erros.nome}><input className="entrada" value={f.nome} autoFocus onChange={(e) => setF({ ...f, nome: e.target.value })} /></Campo>
        {temCor && <Campo rotulo="Cor"><input className="entrada cor-livre" type="color" value={f.cor} onChange={(e) => setF({ ...f, cor: e.target.value })} /></Campo>}
        {temCarga && (
          <Campo rotulo="Tempo de estudo (min)" ajuda={tipo === "topico" ? "Quanto tempo o tópico leva no ritmo normal; vira as metas." : "Opcional: o subtópico é orientação dentro do tópico."} erro={erros.cargaMin}>
            <input className="entrada num" type="number" min="5" step="5" value={f.cargaMin} placeholder="60" onChange={(e) => setF({ ...f, cargaMin: e.target.value })} />
          </Campo>
        )}
        {!Object.keys(erros).length && <MensagemErro erro={erro} />}
        <div className="dialogo-acoes">
          <Botao variante="vidro" onClick={aoFechar}>Cancelar</Botao>
          <Botao variante="solido" disabled={ocupado} onClick={salvar}>{ocupado ? "Salvando…" : "Salvar"}</Botao>
        </div>
      </div>
    </Dialogo>
  );
}

function Linha({ tipo, item, irmaos, i, aoEditar, aberto, aoAbrir, contagem, children }) {
  const { s } = useApp();
  const { executar, ocupado } = useAcao();
  return (
    <div className={`estrutura-linha estrutura-linha--${tipo}`}>
      {aoAbrir ? (
        <button type="button" className="arvore-abrir" aria-expanded={aberto} onClick={aoAbrir}>
          {aberto ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
          {item.cor && <i className="ponto-materia" style={{ "--cor": item.cor }} aria-hidden="true" />}
          <strong>{item.nome}</strong>
        </button>
      ) : <span className="arvore-nome">{item.cor && <i className="ponto-materia" style={{ "--cor": item.cor }} aria-hidden="true" />}{item.nome}</span>}
      {item.cargaMin != null && <span className="num carga">{fmtMin(item.cargaMin)}</span>}
      {contagem && <small className="previa-linha">{contagem}</small>}
      <span className="arvore-acoes">
        <button type="button" className="icone-btn" aria-label="Subir" disabled={i === 0 || ocupado} onClick={() => executar(() => s.estrutura.mover(tipo, item.id, -1))}><ArrowUp /></button>
        <button type="button" className="icone-btn" aria-label="Descer" disabled={i === irmaos.length - 1 || ocupado} onClick={() => executar(() => s.estrutura.mover(tipo, item.id, 1))}><ArrowDown /></button>
        <button type="button" className="icone-btn" aria-label={`Editar ${item.nome}`} onClick={() => aoEditar({ tipo, item })}><Pencil /></button>
        <button type="button" className="icone-btn" aria-label={`Arquivar ${item.nome}`} title="Arquivar (sai das listas; o histórico continua)" disabled={ocupado} onClick={() => executar(() => s.estrutura.arquivar(tipo, item.id))}><Archive /></button>
      </span>
      {children}
    </div>
  );
}

/* Matéria → tópico → subtópico. As matérias do curso são fixas na grade
   (dá para renomear, trocar a cor e a ordem); tópicos e subtópicos são
   criados aqui ou direto na jornada. */
function Arvore({ aoEditar }) {
  const { ind } = useApp();
  const [abertos, setAbertos] = useState(() => new Set());
  const alternar = (id) => setAbertos((x) => { const n = new Set(x); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const novo = (tipo, paiId) => <Botao variante="texto" tamanho="sm" icone={Plus} onClick={() => aoEditar({ tipo, paiId })}>{novoNome(tipo)}</Botao>;
  return (
    <div className="arvore">
      {ind.materias.map((m, im, lm) => (
        <section key={m.id} className="cartao">
          <Linha tipo="materia" item={m} irmaos={lm} i={im} aoEditar={aoEditar} aberto={abertos.has(m.id)} aoAbrir={() => alternar(m.id)} contagem={`${ind.topicosDaMateria(m.id).length} tópicos`} />
          {abertos.has(m.id) && (
            <div className="estrutura-filhos">
              {ind.topicosDaMateria(m.id).map((t, it, lt) => (
                <div key={t.id}>
                  <Linha tipo="topico" item={t} irmaos={lt} i={it} aoEditar={aoEditar} aberto={abertos.has(t.id)} aoAbrir={() => alternar(t.id)} contagem={`${ind.subtopicosDoTopico(t.id).length} subtópicos`} />
                  {abertos.has(t.id) && (
                    <div className="estrutura-filhos">
                      {ind.subtopicosDoTopico(t.id).map((st, is, ls) => <Linha key={st.id} tipo="subtopico" item={st} irmaos={ls} i={is} aoEditar={aoEditar} />)}
                      {novo("subtopico", t.id)}
                    </div>
                  )}
                </div>
              ))}
              {novo("topico", m.id)}
            </div>
          )}
        </section>
      ))}
      {novo("materia")}
    </div>
  );
}

function ListaSimples({ tipo, lista, aoEditar }) {
  return (
    <section className="cartao">
      {lista.map((x, i) => <Linha key={x.id} tipo={tipo} item={x} irmaos={lista} i={i} aoEditar={aoEditar} />)}
      <Botao variante="texto" tamanho="sm" icone={Plus} onClick={() => aoEditar({ tipo })}>{novoNome(tipo)}</Botao>
    </section>
  );
}

function Arquivados() {
  const { s, ind } = useApp();
  const { executar, ocupado, erro } = useAcao();
  const grupos = [["materia", "materias"], ["topico", "topicos"], ["subtopico", "subtopicos"], ["vestibular", "vestibulares"], ["curso", "cursos"]];
  const total = grupos.reduce((x, [, k]) => x + ind.arquivados[k].length, 0);
  if (!total) return <div className="cartao"><Vazio icone={Archive} titulo="Nada arquivado" /></div>;
  return (
    <>
      <MensagemErro erro={erro} />
      {grupos.map(([tipo, k]) => ind.arquivados[k].length > 0 && (
        <section key={k} className="cartao">
          <span className="eyebrow">{NOMES[tipo]}</span>
          {ind.arquivados[k].map((x) => (
            <div key={x.id} className="estrutura-linha">
              <span className="arvore-nome">{x.nome}</span>
              <Botao variante="texto" tamanho="sm" icone={ArchiveRestore} disabled={ocupado} onClick={() => executar(() => s.estrutura.arquivar(tipo, x.id, false))}>Restaurar</Botao>
            </div>
          ))}
        </section>
      ))}
    </>
  );
}

export default function Estrutura() {
  const { s, ind } = useApp();
  const [aba, setAba] = useState("conteudo");
  const [alvo, setAlvo] = useState(null);
  const { executar, ocupado, erro } = useAcao();
  if (!ind) return <Carregando />;
  return (
    <>
      <TituloPagina eyebrow="Base acadêmica" frase="Matérias e *vestibulares*"
        texto="Matéria → tópico → subtópico, e os vestibulares e cursos das jornadas. Renomear não quebra nada; arquivar tira das listas, mas o histórico continua mostrando o nome." />
      {ind.vazio && (
        <div className="cartao">
          <Vazio icone={Network} titulo="Estrutura vazia" texto="Importe a estrutura base (as 9 matérias do curso, com tópicos e subtópicos), que você pode editar depois." />
          <Botao variante="solido" icone={Download} disabled={ocupado} onClick={() => executar(() => s.estrutura.importarInicial())}>Importar estrutura base</Botao>
          <MensagemErro erro={erro} />
        </div>
      )}
      <Abas rotulo="Seções" ativa={aba} aoMudar={setAba} itens={[
        { k: "conteudo", label: "Matérias e tópicos" }, { k: "vestibulares", label: "Vestibulares" }, { k: "cursos", label: "Cursos" }, { k: "arquivados", label: "Arquivados" },
      ]} />
      {aba === "conteudo" && <Arvore aoEditar={setAlvo} />}
      {aba === "vestibulares" && <ListaSimples tipo="vestibular" lista={ind.vestibulares} aoEditar={setAlvo} />}
      {aba === "cursos" && <ListaSimples tipo="curso" lista={ind.cursos} aoEditar={setAlvo} />}
      {aba === "arquivados" && <Arquivados />}
      {alvo && <FormItem alvo={alvo} aoFechar={() => setAlvo(null)} />}
    </>
  );
}
