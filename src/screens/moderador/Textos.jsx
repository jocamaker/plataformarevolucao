import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowDown, ArrowUp, ImagePlus, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useApp } from "../../state/AppContext.jsx";
import { useAcao, useAlunos, useArquivoUrl, useBoasVindas, useConfigRedacao, useConfigTextos, useTextosDeTodos } from "../../state/hooks.js";
import { comprimirImagem } from "../../state/arquivos.js";
import { BOAS_VINDAS_PADRAO } from "../../data/semente.js";
import {
  COR_DESTAQUE_PADRAO, CORES_SUGERIDAS, GRUPOS, TEXTOS, VARIAVEIS, grupoDoCurso, grupoDoVestibular, preencher, primeiroNome, saudacao, textoDe,
} from "../../textos.js";
import { Abas, Botao, Campo, Carregando, Frase, MensagemErro, TituloPagina } from "../../ui/ui.jsx";
import { Bloco } from "../Paginas.jsx";

// cor: só a frase da tela de login usa a cor escolhida; os títulos do painel usam o acento
function Previa({ tipo, texto, cor }) {
  if (tipo !== "titulo") return null;
  return <div className={`previa-app${cor ? " previa-login" : ""}`} aria-label="Prévia" style={cor ? { "--destaque": cor } : undefined}><h2><Frase texto={texto} /></h2></div>;
}

function CampoTexto({ chave, valor, fallback, aoMudar, aoLimpar, rotuloLimpar, vars, cor }) {
  const def = TEXTOS[chave];
  const efetivo = valor?.trim() ? valor : fallback;
  const longo = def.tipo !== "linha";
  return (
    <div className="campo-texto">
      <div className="campo-texto-topo">
        <label htmlFor={`t-${chave}`}>{def.rotulo}</label>
        {valor != null && <Botao variante="texto" tamanho="sm" icone={RotateCcw} onClick={aoLimpar}>{rotuloLimpar}</Botao>}
      </div>
      {longo ? (
        <textarea id={`t-${chave}`} className="entrada" rows={def.tipo === "paragrafo" ? 3 : 2} value={valor ?? fallback} onChange={(e) => aoMudar(e.target.value)} />
      ) : (
        <input id={`t-${chave}`} className="entrada" value={valor ?? fallback} onChange={(e) => aoMudar(e.target.value)} />
      )}
      {valor == null && <small className="previa-linha">Herdado. Edite para personalizar nesta camada.</small>}
      <Previa tipo={def.tipo} texto={preencher(efetivo, vars)} cor={chave.startsWith("inicial.") ? cor : undefined} />
      {(def.tipo === "linha" || def.tipo === "paragrafo") && /\{\w+\}/.test(efetivo) && <p className="previa-linha">Fica assim: {preencher(efetivo, vars)}</p>}
    </div>
  );
}

/* Frases: geral → grupo (vestibular/curso) → aluno. */
function Frases() {
  const { s, ind } = useApp();
  const [params] = useSearchParams();
  const config = useConfigTextos();
  const doAluno = useTextosDeTodos();
  const alunos = useAlunos();
  const [alvo, setAlvo] = useState(() => (params.get("aluno") ? `aluno:${params.get("aluno")}` : "geral"));
  const [rascunho, setRascunho] = useState(null);
  const [cor, setCor] = useState(null);
  const [aviso, setAviso] = useState("");
  const { executar, ocupado, erro } = useAcao();

  const escopo = alvo === "geral" ? { tipo: "geral" } : alvo.startsWith("aluno:") ? { tipo: "aluno", alunoId: alvo.slice(6) } : { tipo: "grupo", grupo: alvo };
  const alunoAlvo = escopo.tipo === "aluno" ? alunos?.find((a) => a.id === escopo.alunoId) : null;
  const camadaSalva = useMemo(() => {
    if (!config || !doAluno) return null;
    if (escopo.tipo === "geral") return config.geral || {};
    if (escopo.tipo === "aluno") return doAluno[escopo.alunoId] || {};
    return config.porGrupo?.[escopo.grupo] || {};
  }, [config, doAluno, alvo]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setRascunho(camadaSalva ? { ...camadaSalva } : null); setAviso(""); }, [camadaSalva]);
  useEffect(() => { if (config) setCor(config.corDestaque || COR_DESTAQUE_PADRAO); }, [config]);
  if (!config || !doAluno || !alunos || !rascunho || !ind) return <Carregando />;

  // o que vale abaixo da camada atual (o que o campo "herda")
  const contextoAbaixo = (chave) => {
    if (escopo.tipo === "geral") return TEXTOS[chave].padrao;
    if (escopo.tipo === "grupo") return textoDe({ geral: config.geral }, chave); // um grupo herda do geral
    return textoDe(config, chave, { vestibularId: alunoAlvo?.vestibularId, cursoId: alunoAlvo?.cursoId });
  };
  const exemplo = alunoAlvo || alunos.find((a) => (escopo.grupo === grupoDoVestibular(a.vestibularId) || escopo.grupo === grupoDoCurso(a.cursoId))) || alunos[0];
  const vars = { nome: primeiroNome(exemplo?.nome || "Aluno"), saudacao: saudacao(), vestibular: ind.nomeVestibular(exemplo?.vestibularId) || "ENEM" };
  const alterado = JSON.stringify(Object.fromEntries(Object.entries(rascunho).filter(([, v]) => v?.trim()))) !== JSON.stringify(Object.fromEntries(Object.entries(camadaSalva).filter(([, v]) => v?.trim())))
    || (escopo.tipo === "geral" && cor !== (config.corDestaque || COR_DESTAQUE_PADRAO));
  const salvar = () => executar(async () => {
    await s.textos.salvar(escopo, rascunho, escopo.tipo === "geral" ? { corDestaque: cor } : {});
    setAviso("Textos salvos. Quem abrir a plataforma já vê a versão nova.");
  });
  const personalizados = (id) => Object.values(doAluno[id] || {}).filter((v) => v?.trim()).length;

  return (
    <>
      <div className="cartao textos-barra">
        <Campo rotulo="Aplicar a" ajuda="O mais específico vale: aluno → curso → vestibular → geral → padrão.">
          <select className="entrada" value={alvo} onChange={(e) => setAlvo(e.target.value)}>
            <option value="geral">Todos (texto geral)</option>
            <optgroup label="Por vestibular">{ind.vestibulares.map((v) => <option key={v.id} value={grupoDoVestibular(v.id)}>Alunos de {v.nome}</option>)}</optgroup>
            <optgroup label="Por curso">{ind.cursos.map((c) => <option key={c.id} value={grupoDoCurso(c.id)}>Alunos de {c.nome}</option>)}</optgroup>
            <optgroup label="Um aluno">{alunos.map((a) => { const n = personalizados(a.id); return <option key={a.id} value={`aluno:${a.id}`}>{a.nome}{n ? ` · ${n} personalizado${n > 1 ? "s" : ""}` : ""}</option>; })}</optgroup>
          </select>
        </Campo>
        <p className="vars">Variáveis: {VARIAVEIS.map((v) => <code key={v}>{`{${v}}`}</code>)}<span>Prévias com {exemplo?.nome || "um aluno de exemplo"}.</span></p>
      </div>

      {GRUPOS.map((g) => {
        if (escopo.tipo !== "geral" && !g.porAluno) return null;
        return (
          <section key={g.id} className="cartao grupo-textos" aria-labelledby={`g-${g.id}`}>
            <header><h2 id={`g-${g.id}`}>{g.titulo}</h2><p>{g.descricao}</p></header>
            {g.id === "inicial" && (
              <div className="campo-texto">
                <span className="campo-texto-topo"><label htmlFor="cor-destaque">Cor do destaque</label></span>
                <div className="cores">
                  {CORES_SUGERIDAS.map((c) => (
                    <button key={c.cor} type="button" className="cor-amostra" style={{ background: c.cor }} aria-label={c.nome} title={c.nome}
                      aria-pressed={cor.toLowerCase() === c.cor.toLowerCase()} onClick={() => setCor(c.cor)} />
                  ))}
                  <input id="cor-destaque" type="color" className="entrada cor-livre" value={cor} onChange={(e) => setCor(e.target.value)} aria-label="Outra cor" />
                  <small>A cor da palavra em destaque na frase da tela de login.</small>
                </div>
              </div>
            )}
            {Object.entries(TEXTOS).filter(([, def]) => def.grupo === g.id).map(([chave]) => (
              <CampoTexto key={chave} chave={chave} valor={rascunho[chave]} fallback={contextoAbaixo(chave)} vars={vars} cor={cor}
                rotuloLimpar={escopo.tipo === "geral" ? "Voltar ao padrão" : "Herdar de novo"}
                aoMudar={(v) => { setAviso(""); setRascunho((r) => ({ ...r, [chave]: v })); }}
                aoLimpar={() => setRascunho((r) => { const n = { ...r }; delete n[chave]; return n; })} />
            ))}
          </section>
        );
      })}

      {(alterado || aviso || erro) && (
        <div className="barra-mover barra-salvar" role="status">
          <span>{erro ? erro.message : alterado ? "Alterações não salvas." : aviso}</span>
          {alterado && (
            <>
              <Botao variante="vidro" tamanho="sm" onClick={() => { setRascunho({ ...camadaSalva }); setCor(config.corDestaque || COR_DESTAQUE_PADRAO); }}>Descartar</Botao>
              <Botao variante="solido" tamanho="sm" disabled={ocupado} onClick={salvar}>Salvar</Botao>
            </>
          )}
        </div>
      )}
    </>
  );
}

function FotoHero({ refFoto }) {
  const { url } = useArquivoUrl(refFoto);
  return url ? <img src={url} alt="" className="miniatura-hero" /> : null;
}

const NOVO_BLOCO = {
  titulo: () => ({ tipo: "titulo", texto: "" }),
  texto: () => ({ tipo: "texto", texto: "" }),
  destaque: () => ({ tipo: "destaque", itens: [{ valor: "", label: "" }] }),
  foto: () => ({ tipo: "foto", url: null, legenda: "" }),
  divisor: () => ({ tipo: "divisor" }),
};

/* Página de boas-vindas: professor (hero) e blocos. */
function BoasVindasEditor() {
  const { s } = useApp();
  const salvo = useBoasVindas();
  const [c, setC] = useState(null);
  const [aviso, setAviso] = useState("");
  const { executar, ocupado, erro } = useAcao();
  useEffect(() => { if (salvo !== undefined) setC(structuredClone(salvo || BOAS_VINDAS_PADRAO)); }, [salvo]);
  if (!c) return <Carregando />;
  const mudar = (fn) => { setAviso(""); setC((x) => { const n = structuredClone(x); fn(n); return n; }); };
  const enviarFoto = (aplicar) => async (e) => {
    const arq = e.target.files?.[0];
    if (!arq) return;
    await executar(async () => { const ref = await s.textos.enviarImagem(await comprimirImagem(arq, 1400, 0.85)); mudar((n) => aplicar(n, ref)); });
    e.target.value = "";
  };
  const alterado = JSON.stringify(c) !== JSON.stringify(salvo || BOAS_VINDAS_PADRAO);

  return (
    <>
      <section className="cartao form">
        <h2 className="subtitulo">Professor ou curso</h2>
        <div className="form-linha">
          <Campo rotulo="Nome"><input className="entrada" value={c.hero.nome || ""} onChange={(e) => mudar((n) => { n.hero.nome = e.target.value; })} /></Campo>
          <Campo rotulo="Cor"><input className="entrada cor-livre" type="color" value={c.hero.cor || "#C9793A"} onChange={(e) => mudar((n) => { n.hero.cor = e.target.value; })} /></Campo>
        </div>
        <Campo rotulo="Apresentação"><textarea className="entrada" rows={2} value={c.hero.subtitulo || ""} onChange={(e) => mudar((n) => { n.hero.subtitulo = e.target.value; })} /></Campo>
        <div className="linha-acoes">
          <FotoHero refFoto={c.hero.foto} />
          <label className="btn btn--vidro btn--sm"><ImagePlus aria-hidden="true" />{c.hero.foto ? "Trocar foto" : "Enviar foto"}<input type="file" accept="image/*" className="sr-only" onChange={enviarFoto((n, ref) => { n.hero.foto = ref; })} /></label>
          {c.hero.foto && <Botao variante="texto" tamanho="sm" onClick={() => mudar((n) => { n.hero.foto = null; })}>Tirar foto</Botao>}
        </div>
      </section>

      <h2 className="subtitulo">Blocos da página</h2>
      <p className="previa-linha">Esta página aparece em “Sobre o curso” e, na tela de login, em “Método” e “Professores”, para qualquer visitante: use só números reais.</p>
      {c.blocos.map((b, i) => (
        <section key={b.id || i} className="cartao form bloco-editor">
          <div className="linha-titulo-secao">
            <span className="eyebrow">{({ titulo: "Título", texto: "Texto", destaque: "Números", foto: "Foto", divisor: "Divisor" })[b.tipo]}</span>
            <span className="arvore-acoes">
              <button type="button" className="icone-btn" aria-label="Subir bloco" disabled={i === 0} onClick={() => mudar((n) => { [n.blocos[i - 1], n.blocos[i]] = [n.blocos[i], n.blocos[i - 1]]; })}><ArrowUp /></button>
              <button type="button" className="icone-btn" aria-label="Descer bloco" disabled={i === c.blocos.length - 1} onClick={() => mudar((n) => { [n.blocos[i + 1], n.blocos[i]] = [n.blocos[i], n.blocos[i + 1]]; })}><ArrowDown /></button>
              <button type="button" className="icone-btn" aria-label="Remover bloco" onClick={() => mudar((n) => { n.blocos.splice(i, 1); })}><Trash2 /></button>
            </span>
          </div>
          {b.tipo === "titulo" && <input className="entrada" aria-label="Título" value={b.texto} onChange={(e) => mudar((n) => { n.blocos[i].texto = e.target.value; })} />}
          {b.tipo === "texto" && <textarea className="entrada" rows={4} aria-label="Texto" value={b.texto} onChange={(e) => mudar((n) => { n.blocos[i].texto = e.target.value; })} />}
          {b.tipo === "destaque" && (
            <>
              {b.itens.map((it, j) => (
                <div key={j} className="linha-numero">
                  <input className="entrada" aria-label={`Número ${j + 1}`} value={it.valor} placeholder="+15" onChange={(e) => mudar((n) => { n.blocos[i].itens[j].valor = e.target.value; })} />
                  <input className="entrada" aria-label={`Texto do número ${j + 1}`} value={it.label} placeholder="anos de experiência" onChange={(e) => mudar((n) => { n.blocos[i].itens[j].label = e.target.value; })} />
                  <button type="button" className="icone-btn" aria-label={`Remover número ${j + 1}`} onClick={() => mudar((n) => { n.blocos[i].itens.splice(j, 1); })}><Trash2 /></button>
                </div>
              ))}
              {b.itens.length < 4 && <Botao variante="texto" tamanho="sm" icone={Plus} onClick={() => mudar((n) => { n.blocos[i].itens.push({ valor: "", label: "" }); })}>Adicionar número</Botao>}
            </>
          )}
          {b.tipo === "foto" && (
            <div className="linha-acoes">
              <FotoHero refFoto={b.url} />
              <label className="btn btn--vidro btn--sm"><ImagePlus aria-hidden="true" />{b.url ? "Trocar imagem" : "Enviar imagem"}<input type="file" accept="image/*" className="sr-only" onChange={enviarFoto((n, ref) => { n.blocos[i].url = ref; })} /></label>
              <input className="entrada" aria-label="Legenda" placeholder="Legenda (opcional)" value={b.legenda || ""} onChange={(e) => mudar((n) => { n.blocos[i].legenda = e.target.value; })} />
            </div>
          )}
          {b.tipo !== "divisor" && <div className="previa-bloco"><Bloco bloco={b} /></div>}
        </section>
      ))}
      <div className="linha-acoes">
        {Object.keys(NOVO_BLOCO).map((tipo) => (
          <Botao key={tipo} variante="vidro" tamanho="sm" icone={Plus} onClick={() => mudar((n) => { n.blocos.push({ id: `b${Date.now()}`, ...NOVO_BLOCO[tipo]() }); })}>
            {({ titulo: "Título", texto: "Texto", destaque: "Números", foto: "Foto", divisor: "Divisor" })[tipo]}
          </Botao>
        ))}
      </div>
      <MensagemErro erro={erro} />
      {(alterado || aviso) && (
        <div className="barra-mover barra-salvar" role="status">
          <span>{alterado ? "Alterações não salvas." : aviso}</span>
          {alterado && (
            <>
              <Botao variante="vidro" tamanho="sm" onClick={() => setC(structuredClone(salvo || BOAS_VINDAS_PADRAO))}>Descartar</Botao>
              <Botao variante="solido" tamanho="sm" disabled={ocupado} onClick={() => executar(async () => {
                await s.textos.salvarBoasVindas({ hero: c.hero, blocos: c.blocos.map((b) => (b.tipo === "destaque" ? { ...b, itens: b.itens.filter((x) => x.valor.trim() || x.label.trim()) } : b)) });
                setAviso("Página salva.");
              })}>Salvar</Botao>
            </>
          )}
        </div>
      )}
    </>
  );
}

// o aluno vê na tela de Redação
function InstrucoesRedacao() {
  const { s } = useApp();
  const config = useConfigRedacao();
  const [texto, setTexto] = useState(null);
  const [salvo, setSalvo] = useState(false);
  const { executar, ocupado, erro } = useAcao();
  if (config === undefined) return <Carregando />;
  const atual = texto ?? config.instrucoes ?? "";
  const mudou = atual !== (config.instrucoes ?? "");
  return (
    <section className="cartao form" aria-labelledby="t-instrucoes">
      <h2 id="t-instrucoes" className="subtitulo">Como enviar a redação <small>o aluno vê isto na tela de Redação</small></h2>
      <textarea className="entrada" rows={3} value={atual} onChange={(e) => { setTexto(e.target.value); setSalvo(false); }} aria-labelledby="t-instrucoes" />
      <MensagemErro erro={erro} />
      <div className="linha-acoes">
        {salvo && <span className="retorno-curto" role="status">Instruções salvas.</span>}
        <Botao variante="solido" tamanho="sm" disabled={!mudou || !atual.trim() || ocupado}
          onClick={() => executar(async () => { await s.redacao.salvarInstrucoes(atual); setTexto(null); setSalvo(true); })}>Salvar instruções</Botao>
      </div>
    </section>
  );
}

export default function Textos() {
  const [aba, setAba] = useState("frases");
  return (
    <>
      <TituloPagina eyebrow="Conteúdo" frase="Textos e *boas-vindas*"
        texto="Frases da página inicial, das boas-vindas e do painel, para todos, um grupo ou um aluno. Coloque uma palavra entre *asteriscos* para destacá-la; Enter quebra a linha nos títulos." />
      <Abas rotulo="Seções" ativa={aba} aoMudar={setAba} itens={[{ k: "frases", label: "Frases" }, { k: "pagina", label: "Página de boas-vindas" }, { k: "redacao", label: "Instruções de redação" }]} />
      {aba === "frases" && <Frases />}
      {aba === "pagina" && <BoasVindasEditor />}
      {aba === "redacao" && <InstrucoesRedacao />}
    </>
  );
}
