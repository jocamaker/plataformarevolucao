/* Tela inicial: o que há para hoje e a árvore Matéria → Tópico, com as
   contagens do dia (novos, aprendendo, revisar), estudo por recorte e as
   ações de cada matéria e tópico. Arrastar pela alça reordena. */

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  DndContext, KeyboardSensor, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowRight, CalendarClock, ChevronRight, FolderInput, GripVertical, Layers, Pencil, Play, Plus, RotateCcw, Search, Sparkles, Tag, Trash2,
} from "lucide-react";
import { useBase, useLoja, usePreferencia } from "../estado/hooks.js";
import { contagensDoDia, somaDe } from "../estado/contagens.js";
import { apagarMateria, apagarTopico, contarConteudo, criarMateria, criarTopico, moverTopico, renomear, reordenar } from "../servicos/arvore.js";
import { adiar } from "../servicos/agenda.js";
import { criarExemplos } from "../servicos/exemplos.js";
import { criarExemploOclusao } from "./exemploOclusao.js";
import { formatarIntervalo } from "../motor/agendador.js";
import { Botao, Confirmar, Contagens, Dialogo, Erro, Menu, PedirTexto, Vazio, avisar, executar } from "./comum.jsx";

function useSensores() {
  return useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 160, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
}

/* ---------- o que há para hoje ---------- */

function Hoje({ c, estado, aoEstudar, aoRever }) {
  const { repo } = useLoja();
  const total = somaDe(c.total);
  const [proxima, setProxima] = useState(undefined);
  const [estudados, setEstudados] = useState(0);
  // quantos já foram estudados (podem ser revistos antes do prazo)
  useEffect(() => {
    let vivo = true;
    repo.contar("cartoes", { onde: [["fila", ">", new Date(0)]] }).then((n) => { if (vivo) setEstudados(n); }).catch(() => {});
    return () => { vivo = false; };
  }, [repo, estado.pendentes]);
  useEffect(() => {
    if (total || !estado.fimDoDia) return;
    let vivo = true;
    repo.listar("cartoes", { onde: [["fila", ">", estado.fimDoDia]], ordem: ["fila", "asc"], limite: 1 })
      .then(([c1]) => { if (vivo) setProxima(c1 ? new Date(c1.fila) : null); })
      .catch(() => {});
    return () => { vivo = false; };
  }, [repo, total, estado.fimDoDia, estado.pendentes]);

  // tempo estimado: a média de hoje (ou 10 s por cartão)
  const respostas = Object.values(estado.dia?.revisoes || {});
  const media = respostas.length ? respostas.reduce((s, r) => s + (r.duracaoMs || 0), 0) / respostas.length : 10000;
  const minutos = Math.max(1, Math.round((total * Math.max(media, 4000)) / 60000));
  const feitos = c.feitos.total;

  return (
    <section className="fc-hoje" aria-labelledby="fc-hoje-t">
      <div className="fc-hoje-texto">
        <h1 id="fc-hoje-t">{total ? "Para hoje" : feitos ? "Tudo em dia." : "Nada para hoje"}</h1>
        {total ? (
          <div className="fc-hoje-numeros">
            <span className={`fc-hoje-n fc-hoje-n--novo${c.total.novos ? "" : " fc-hoje-n--zero"}`}><b>{c.total.novos}</b>{c.total.novos === 1 ? "novo" : "novos"}</span>
            <span className={`fc-hoje-n fc-hoje-n--aprendendo${c.total.aprendendo ? "" : " fc-hoje-n--zero"}`}><b>{c.total.aprendendo}</b>aprendendo</span>
            <span className={`fc-hoje-n fc-hoje-n--revisao${c.total.revisao ? "" : " fc-hoje-n--zero"}`}><b>{c.total.revisao}</b>{c.total.revisao === 1 ? "revisão" : "revisões"}</span>
          </div>
        ) : (
          <p className="fc-hoje-sub">
            {feitos ? `Você respondeu ${feitos} ${feitos === 1 ? "cartão" : "cartões"} hoje. ` : ""}
            {proxima ? `A próxima revisão volta em ${formatarIntervalo(proxima.getTime() - Date.now())}.` : proxima === null ? "Crie cartões para começar a revisar." : ""}
          </p>
        )}
      </div>
      {total > 0 ? (
        <div className="fc-hoje-acao">
          <button type="button" className="fc-estudar" onClick={aoEstudar}>Estudar agora<ArrowRight aria-hidden="true" /></button>
          <small>{total} {total === 1 ? "cartão" : "cartões"} · cerca de {minutos} min</small>
          {estudados > 0 && <button type="button" className="fc-rever-link" onClick={aoRever}><RotateCcw aria-hidden="true" />Rever tudo antes do prazo</button>}
        </div>
      ) : estudados > 0 && (
        <div className="fc-hoje-acao">
          <button type="button" className="fc-estudar fc-estudar--rever" onClick={aoRever}><RotateCcw aria-hidden="true" />Rever antes do prazo</button>
          <small>{estudados} {estudados === 1 ? "cartão estudado" : "cartões estudados"} · os que você lembra menos primeiro</small>
        </div>
      )}
    </section>
  );
}

/* ---------- linhas da árvore ---------- */

function Alca({ ordenavel, rotulo }) {
  return (
    <button type="button" className="fc-alca" aria-label={rotulo} title="Arraste para reordenar" {...ordenavel.attributes} {...ordenavel.listeners}>
      <GripVertical aria-hidden="true" />
    </button>
  );
}

// com algo para hoje, estuda; sem nada vencendo, revê antes do prazo (um toque sempre faz algo útil)
function BotaoEstudar({ nome, temHoje, acoes }) {
  return temHoje
    ? <Botao variante="fantasma" icone={Play} aria-label={`Estudar ${nome}`} title="Estudar o que vence hoje" onClick={acoes.estudar} className="fc-linha-play" />
    : <Botao variante="fantasma" icone={RotateCcw} aria-label={`Rever ${nome} antes do prazo`} title="Nada vence hoje: rever antes do prazo" onClick={acoes.rever} className="fc-linha-play fc-linha-play--rever" />;
}

function LinhaTopico({ t, c, acoes }) {
  const ordenavel = useSortable({ id: t.id });
  const estilo = { transform: CSS.Transform.toString(ordenavel.transform), transition: ordenavel.transition };
  const temHoje = somaDe(c) > 0;
  return (
    <div ref={ordenavel.setNodeRef} style={estilo} className={`fc-linha fc-linha--topico${ordenavel.isDragging ? " fc-linha--arrastando" : ""}`}>
      <Alca ordenavel={ordenavel} rotulo={`Reordenar ${t.nome}`} />
      <button type="button" className="fc-linha-nome" onClick={temHoje ? acoes.estudar : acoes.rever} title={temHoje ? `Estudar ${t.nome}` : `Nada vence hoje: rever ${t.nome} antes do prazo`}>
        <span>{t.nome}</span>
      </button>
      <Contagens c={c} />
      <BotaoEstudar nome={t.nome} temHoje={temHoje} acoes={acoes} />
      <Menu rotulo={`Ações de ${t.nome}`} itens={[
        { rotulo: "Rever antes do prazo", icone: RotateCcw, aoClicar: acoes.rever },
        { rotulo: "Adicionar cartão", icone: Plus, aoClicar: acoes.adicionar },
        { rotulo: "Ver os cartões", icone: Search, aoClicar: acoes.ver },
        "-",
        { rotulo: "Renomear", icone: Pencil, aoClicar: acoes.renomear },
        { rotulo: "Mover para outra matéria", icone: FolderInput, aoClicar: acoes.mover },
        { rotulo: "Adiar as revisões de hoje", icone: CalendarClock, aoClicar: acoes.adiar, desativado: !(c?.revisao || c?.aprendendo) },
        "-",
        { rotulo: "Apagar tópico", icone: Trash2, perigo: true, aoClicar: acoes.apagar },
      ]} />
    </div>
  );
}

function LinhaMateria({ m, topicos, c, cTopicos, aberta, alternar, acoes, acoesTopico, aoReordenarTopicos }) {
  const ordenavel = useSortable({ id: m.id });
  const sensores = useSensores();
  const estilo = { transform: CSS.Transform.toString(ordenavel.transform), transition: ordenavel.transition };
  const fimArrasto = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const de = topicos.findIndex((t) => t.id === active.id);
    const para = topicos.findIndex((t) => t.id === over.id);
    aoReordenarTopicos(arrayMove(topicos, de, para));
  };
  return (
    <div ref={ordenavel.setNodeRef} style={estilo} className={`fc-materia${aberta ? " fc-materia--aberta" : ""}${ordenavel.isDragging ? " fc-linha--arrastando" : ""}`}>
      <div className="fc-linha fc-linha--materia">
        <Alca ordenavel={ordenavel} rotulo={`Reordenar ${m.nome}`} />
        <button type="button" className="fc-linha-nome" aria-expanded={aberta} onClick={alternar}>
          <ChevronRight className="fc-seta" aria-hidden="true" />
          <span>{m.nome}</span>
          <small>{topicos.length} {topicos.length === 1 ? "tópico" : "tópicos"}</small>
        </button>
        <Contagens c={c} />
        <BotaoEstudar nome={m.nome} temHoje={somaDe(c) > 0} acoes={acoes} />
        <Menu rotulo={`Ações de ${m.nome}`} itens={[
          { rotulo: "Rever antes do prazo", icone: RotateCcw, aoClicar: acoes.rever },
          { rotulo: "Novo tópico", icone: Plus, aoClicar: acoes.novoTopico },
          { rotulo: "Adicionar cartão", icone: Plus, aoClicar: acoes.adicionar, desativado: !topicos.length },
          { rotulo: "Ver os cartões", icone: Search, aoClicar: acoes.ver },
          "-",
          { rotulo: "Renomear", icone: Pencil, aoClicar: acoes.renomear },
          { rotulo: "Adiar as revisões de hoje", icone: CalendarClock, aoClicar: acoes.adiar, desativado: !(c?.revisao || c?.aprendendo) },
          "-",
          { rotulo: "Apagar matéria", icone: Trash2, perigo: true, aoClicar: acoes.apagar },
        ]} />
      </div>
      {aberta && (
        <div className="fc-topicos">
          <DndContext sensors={sensores} collisionDetection={closestCenter} onDragEnd={fimArrasto}>
            <SortableContext items={topicos.map((t) => t.id)} strategy={verticalListSortingStrategy}>
              {topicos.map((t) => <LinhaTopico key={t.id} t={t} c={cTopicos[t.id]} acoes={acoesTopico(t)} />)}
            </SortableContext>
          </DndContext>
          <button type="button" className="fc-novo-topico" onClick={acoes.novoTopico}><Plus aria-hidden="true" />Novo tópico</button>
        </div>
      )}
    </div>
  );
}

/* ---------- diálogos ---------- */

function AdiarLote({ alvo, aoFechar }) {
  const { repo } = useLoja();
  const [dias, setDias] = useState(1);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState(null);
  const confirmar = async () => {
    setOcupado(true);
    try {
      await adiar(repo, alvo.cartoes, dias);
      avisar(`${alvo.cartoes.length} ${alvo.cartoes.length === 1 ? "cartão adiado" : "cartões adiados"} em ${dias} ${dias === 1 ? "dia" : "dias"}.`);
      aoFechar();
    } catch (e) { setErro(e); } finally { setOcupado(false); }
  };
  return (
    <Dialogo aberto={!!alvo} aoFechar={aoFechar} titulo={`Adiar ${alvo?.nome || ""}`} largura={440}>
      <div className="fc-dialogo-corpo">
        <p className="fc-texto">{alvo?.cartoes.length} {alvo?.cartoes.length === 1 ? "cartão vence" : "cartões vencem"} hoje aqui. Eles voltam depois, contando a partir de quando venceriam.</p>
        <div className="fc-escolhas" role="radiogroup" aria-label="Adiar por">
          {[1, 2, 3, 7, 14].map((d) => (
            <button key={d} type="button" role="radio" aria-checked={dias === d} className="fc-escolha" onClick={() => setDias(d)}>{d} {d === 1 ? "dia" : "dias"}</button>
          ))}
        </div>
        <p className="fc-dica">Adiar tem custo: quanto mais longe da data certa, maior a chance de esquecer. Use quando não der mesmo para revisar hoje.</p>
        <Erro erro={erro} />
      </div>
      <footer className="fc-dialogo-acoes">
        <Botao onClick={aoFechar}>Cancelar</Botao>
        <Botao variante="primario" disabled={ocupado} onClick={confirmar}>{ocupado ? "Adiando…" : "Adiar"}</Botao>
      </footer>
    </Dialogo>
  );
}

function MoverTopico({ topico, materias, aoFechar, aoMover }) {
  const [destino, setDestino] = useState("");
  const outras = materias.filter((m) => m.id !== topico?.materiaId);
  useEffect(() => { setDestino(outras[0]?.id || ""); }, [topico]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Dialogo aberto={!!topico} aoFechar={aoFechar} titulo={`Mover ${topico?.nome || ""}`} largura={420}>
      <div className="fc-dialogo-corpo">
        {outras.length ? (
          <label className="fc-campo"><span>Para a matéria</span>
            <select className="fc-entrada" value={destino} onChange={(e) => setDestino(e.target.value)}>
              {outras.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
            </select>
          </label>
        ) : <p className="fc-texto">Crie outra matéria primeiro.</p>}
        <p className="fc-dica">Os cartões vão junto e mantêm o progresso.</p>
      </div>
      <footer className="fc-dialogo-acoes">
        <Botao onClick={aoFechar}>Cancelar</Botao>
        <Botao variante="primario" disabled={!destino} onClick={() => aoMover(destino)}>Mover</Botao>
      </footer>
    </Dialogo>
  );
}

/* ---------- tela ---------- */

export default function Inicio() {
  const { estado, repo, loja } = useLoja();
  const base = useBase();
  const navigate = useNavigate();
  const [abertas, setAbertas] = usePreferencia(`fc:abertas:${estado.uid}`, {});
  const [dialogo, setDialogo] = useState(null); // { tipo, ... }
  const [apagando, setApagando] = useState(false);
  const [erroApagar, setErroApagar] = useState(null);
  const [ordemLocal, setOrdemLocal] = useState(null); // ordem otimista enquanto grava
  const sensores = useSensores();

  const c = contagensDoDia(estado);
  const materias = ordemLocal?.materias || estado.materias;
  const topicosPorMateria = useMemo(() => {
    const m = {};
    for (const t of ordemLocal?.topicos || estado.topicos) (m[t.materiaId] ||= []).push(t);
    return m;
  }, [estado.topicos, ordemLocal]);
  useEffect(() => { setOrdemLocal(null); }, [estado.materias, estado.topicos]);

  const estudar = (q = "") => navigate(`${base}/estudar${q}`);
  const fechar = () => { setDialogo(null); setErroApagar(null); };
  const pendentesDe = (campo, id) => (estado.pendentes || []).filter((x) => x[campo] === id && !x.suspenso && x.fsrs.state !== 0);

  const reordenarMaterias = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    const nova = arrayMove(materias, materias.findIndex((m) => m.id === active.id), materias.findIndex((m) => m.id === over.id));
    setOrdemLocal({ materias: nova, topicos: ordemLocal?.topicos });
    executar(() => reordenar(repo, "materias", nova));
  };
  const reordenarTopicos = (lista) => {
    const outros = (ordemLocal?.topicos || estado.topicos).filter((t) => t.materiaId !== lista[0].materiaId);
    setOrdemLocal({ materias: ordemLocal?.materias, topicos: [...outros, ...lista] });
    executar(() => reordenar(repo, "topicos", lista));
  };

  const pedirApagar = async (colecao, item) => {
    const campo = colecao === "materias" ? "materiaId" : "topicoId";
    setDialogo({ tipo: "apagar", colecao, item, conteudo: null });
    const conteudo = await contarConteudo(repo, campo, item.id).catch(() => null);
    setDialogo((d) => (d?.item?.id === item.id ? { ...d, conteudo } : d));
  };
  const confirmarApagar = async () => {
    setApagando(true);
    setErroApagar(null);
    try {
      const { colecao, item } = dialogo;
      await (colecao === "materias" ? apagarMateria(repo, item.id) : apagarTopico(repo, item.id));
      loja.recontar();
      avisar(`${item.nome} apagado.`);
      fechar();
    } catch (e) { setErroApagar(e); } finally { setApagando(false); }
  };

  const acoesMateria = (m) => ({
    estudar: () => estudar(`?materia=${m.id}`),
    rever: () => estudar(`?materia=${m.id}&rever=1`),
    adicionar: () => navigate(`${base}/novo?materia=${m.id}`),
    ver: () => navigate(`${base}/navegar?materia=${m.id}`),
    novoTopico: () => setDialogo({ tipo: "novoTopico", materia: m }),
    renomear: () => setDialogo({ tipo: "renomear", colecao: "materias", item: m }),
    adiar: () => setDialogo({ tipo: "adiar", nome: m.nome, cartoes: pendentesDe("materiaId", m.id) }),
    apagar: () => pedirApagar("materias", m),
  });
  const acoesTopico = (t) => ({
    estudar: () => estudar(`?topico=${t.id}`),
    rever: () => estudar(`?topico=${t.id}&rever=1`),
    adicionar: () => navigate(`${base}/novo?topico=${t.id}`),
    ver: () => navigate(`${base}/navegar?topico=${t.id}`),
    renomear: () => setDialogo({ tipo: "renomear", colecao: "topicos", item: t }),
    mover: () => setDialogo({ tipo: "mover", topico: t }),
    adiar: () => setDialogo({ tipo: "adiar", nome: t.nome, cartoes: pendentesDe("topicoId", t.id) }),
    apagar: () => pedirApagar("topicos", t),
  });

  const tags = estado.tagsConhecidas.filter((t) => somaDe(c.porTag[t]) > 0 || estado.novosPorTag[t] > 0);

  return (
    <div className="fc-inicio">
      <Hoje c={c} estado={estado} aoEstudar={() => estudar()} aoRever={() => estudar("?rever=1")} />

      <section className="fc-secao" aria-labelledby="fc-materias-t">
        <header className="fc-secao-topo">
          <h2 id="fc-materias-t">Matérias</h2>
          <Botao icone={Plus} onClick={() => setDialogo({ tipo: "novaMateria" })}>Nova matéria</Botao>
        </header>

        {materias.length === 0 ? (
          <Vazio icone={Layers} titulo="Monte seu primeiro baralho" texto="Organize por matéria e tópico, como no seu edital. Cada cartão entra na fila de revisão no dia certo para você não esquecer.">
            <Botao variante="primario" icone={Plus} onClick={() => setDialogo({ tipo: "novaMateria" })}>Criar matéria</Botao>
            <Botao icone={Sparkles} onClick={() => executar(async () => { await criarExemplos(repo); await criarExemploOclusao(repo).catch(() => 0); }, { ok: "Exemplos criados: perguntas, trechos escondidos e uma imagem." }).then(() => loja.recontar())}>Começar com exemplos</Botao>
          </Vazio>
        ) : (
          <div className="fc-arvore">
            <div className="fc-arvore-cabeca" aria-hidden="true">
              <span className="fc-contagens"><span className="fc-n--novo">Novos</span><span className="fc-n--aprendendo">Aprender</span><span className="fc-n--revisao">Revisar</span></span>
            </div>
            <DndContext sensors={sensores} collisionDetection={closestCenter} onDragEnd={reordenarMaterias}>
              <SortableContext items={materias.map((m) => m.id)} strategy={verticalListSortingStrategy}>
                {materias.map((m) => (
                  <LinhaMateria key={m.id} m={m} topicos={topicosPorMateria[m.id] || []} c={c.porMateria[m.id]} cTopicos={c.porTopico}
                    aberta={!!abertas[m.id]} alternar={() => setAbertas((a) => ({ ...a, [m.id]: !a[m.id] }))}
                    acoes={acoesMateria(m)} acoesTopico={acoesTopico} aoReordenarTopicos={reordenarTopicos} />
                ))}
              </SortableContext>
            </DndContext>
          </div>
        )}
      </section>

      {tags.length > 0 && (
        <section className="fc-secao" aria-labelledby="fc-tags-t">
          <header className="fc-secao-topo"><h2 id="fc-tags-t">Estudar por tag</h2></header>
          <div className="fc-tags">
            {tags.map((t) => (
              <button key={t} type="button" className="fc-tag-estudo" onClick={() => estudar(`?tag=${encodeURIComponent(t)}${somaDe(c.porTag[t]) ? "" : "&rever=1"}`)}
                title={somaDe(c.porTag[t]) ? `Estudar ${t}` : `Nada vence hoje: rever ${t} antes do prazo`}>
                <Tag aria-hidden="true" />{t}<Contagens c={c.porTag[t]} compacto />
              </button>
            ))}
          </div>
        </section>
      )}

      <PedirTexto aberto={dialogo?.tipo === "novaMateria"} titulo="Nova matéria" rotulo="Nome" confirmar="Criar" dica="Ex.: Biologia, Química orgânica, História do Brasil."
        aoFechar={fechar} aoSalvar={async (nome) => {
          const id = await criarMateria(repo, { nome }, estado.materias);
          setAbertas((a) => ({ ...a, [id]: true }));
          setDialogo({ tipo: "novoTopico", materia: { id, nome: nome.trim() } });
          return false;
        }} />
      <PedirTexto aberto={dialogo?.tipo === "novoTopico"} titulo={`Novo tópico em ${dialogo?.materia?.nome || ""}`} rotulo="Nome do tópico" confirmar="Criar"
        dica="Ex.: Genética, Estequiometria, Era Vargas." aoFechar={fechar}
        aoSalvar={async (nome) => {
          await criarTopico(repo, { materiaId: dialogo.materia.id, nome }, topicosPorMateria[dialogo.materia.id] || []);
          setAbertas((a) => ({ ...a, [dialogo.materia.id]: true }));
        }} />
      <PedirTexto aberto={dialogo?.tipo === "renomear"} titulo="Renomear" rotulo="Nome" inicial={dialogo?.item?.nome || ""} aoFechar={fechar}
        aoSalvar={(nome) => renomear(repo, dialogo.colecao, dialogo.item.id, nome)} />
      <MoverTopico topico={dialogo?.tipo === "mover" ? dialogo.topico : null} materias={estado.materias} aoFechar={fechar}
        aoMover={async (materiaId) => {
          const t = dialogo.topico;
          fechar();
          const r = await executar(() => moverTopico(repo, t.id, materiaId, topicosPorMateria[materiaId] || []), { ok: `${t.nome} movido.` });
          if (r.ok) { setAbertas((a) => ({ ...a, [materiaId]: true })); loja.recontar(); }
        }} />
      <AdiarLote alvo={dialogo?.tipo === "adiar" ? dialogo : null} aoFechar={fechar} />
      <Confirmar aberto={dialogo?.tipo === "apagar"} titulo={`Apagar ${dialogo?.item?.nome || ""}?`} rotulo="Apagar" perigo ocupado={apagando} erro={erroApagar}
        aoFechar={fechar} aoConfirmar={confirmarApagar}>
        <p className="fc-texto">
          {dialogo?.conteudo
            ? <>Vão junto <b>{dialogo.conteudo.notas} {dialogo.conteudo.notas === 1 ? "nota" : "notas"}</b> e <b>{dialogo.conteudo.cartoes} {dialogo.conteudo.cartoes === 1 ? "cartão" : "cartões"}</b>{dialogo.colecao === "materias" ? ", com os tópicos" : ""}. </>
            : "Contando o que há dentro… "}
          O histórico de revisões continua nas estatísticas. Não dá para desfazer.
        </p>
      </Confirmar>
    </div>
  );
}
