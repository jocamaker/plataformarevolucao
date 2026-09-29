/* Formulários e detalhes de registros (questões e simulados), usados pelo
   aluno e pelo moderador. A validação é a do serviço (a mesma das regras). */

import { useState } from "react";
import { FileUp, Pencil, Trash2 } from "lucide-react";
import { useApp } from "../../state/AppContext.jsx";
import { errosDeCampo, useAcao } from "../../state/hooks.js";
import { pct, fmtPct } from "../../core/desempenho.js";
import { fmtDataHora, fmtDataLonga } from "../../core/datas.js";
import { JANELA_CORRECAO_H, pode } from "../../core/permissoes.js";
import { fmtTamanho } from "../../core/validacao.js";
import { SeletorConteudo, NomeConteudo } from "../../ui/Conteudo.jsx";
import { Botao, Campo, Dialogo, MensagemErro } from "../../ui/ui.jsx";

const num = (v) => (v === "" || v == null ? "" : v);

export function podeCorrigir(usuario, registro) {
  return pode(usuario, "corrigir:registro", { registro });
}

/* ---------- Questões ---------- */

// inicial: valores já preenchidos (ex.: a matéria e o tópico da lista que o aluno fez)
export function FormQuestoes({ alunoId, registro, inicial = {}, aoConcluir, aoCancelar, pedirMotivo }) {
  const { s, hoje } = useApp();
  const [f, setF] = useState(() => registro
    ? { ...registro, subtopicoId: registro.subtopicoId || "", vestibularId: registro.vestibularId || "" }
    : { data: hoje, materiaId: "", topicoId: "", subtopicoId: "", vestibularId: "", total: "", acertos: "", erros: "", obs: "", ...inicial });
  const [motivo, setMotivo] = useState("");
  const { executar, ocupado, erro } = useAcao();
  const erros = errosDeCampo(erro);
  const total = Number(f.total) || 0, a = Number(f.acertos) || 0, e = Number(f.erros) || 0;
  const passou = f.total !== "" && a + e > total;

  const salvar = () => executar(async () => {
    const dados = { ...f, total: num(f.total), acertos: num(f.acertos), erros: num(f.erros) };
    if (registro) await s.questoes.corrigir(registro.id, dados, { motivo });
    else await s.questoes.registrar(alunoId, dados);
    aoConcluir?.(`${total} ${total === 1 ? "questão registrada" : "questões registradas"}: ${fmtPct(pct(a, total))} de acerto.`);
  });

  return (
    <div className="form">
      <div className="form-linha">
        <Campo rotulo="Data" erro={erros.data}><input type="date" className="entrada" max={hoje} value={f.data} onChange={(ev) => setF({ ...f, data: ev.target.value })} /></Campo>
        <VestibularOpcional valor={f.vestibularId} aoMudar={(v) => setF({ ...f, vestibularId: v })} />
      </div>
      <SeletorConteudo valor={f} erros={erros} aoMudar={(v) => setF({ ...f, ...v })} />
      <div className="form-linha form-linha--3">
        <Campo rotulo="Total" erro={erros.total}><input className="entrada num" type="number" inputMode="numeric" min="1" value={f.total} onChange={(ev) => setF({ ...f, total: ev.target.value })} /></Campo>
        <Campo rotulo="Acertos" erro={erros.acertos}><input className="entrada num entrada--ok" type="number" inputMode="numeric" min="0" value={f.acertos} onChange={(ev) => setF({ ...f, acertos: ev.target.value })} /></Campo>
        <Campo rotulo="Erros" erro={erros.erros}><input className="entrada num entrada--erro" type="number" inputMode="numeric" min="0" value={f.erros} onChange={(ev) => setF({ ...f, erros: ev.target.value })} /></Campo>
      </div>
      {f.total !== "" && !passou && (
        <p className="previa-linha num">
          {fmtPct(pct(a, total))} de acerto{total - a - e > 0 ? ` · ${total - a - e} em branco` : ""}
        </p>
      )}
      {passou && <p className="campo-erro" role="alert">Acertos + erros ({a + e}) passa do total ({total}).</p>}
      <Campo rotulo="Observações (opcional)"><textarea className="entrada" rows={2} value={f.obs} placeholder="Ex.: errei por confundir MRU com MRUV" onChange={(ev) => setF({ ...f, obs: ev.target.value })} /></Campo>
      {registro && pedirMotivo && (
        <Campo rotulo="Motivo da correção" ajuda="Fica no histórico de alterações."><input className="entrada" value={motivo} onChange={(ev) => setMotivo(ev.target.value)} /></Campo>
      )}
      {!Object.keys(erros).length && <MensagemErro erro={erro} />}
      <div className="dialogo-acoes">
        {aoCancelar && <Botao variante="vidro" onClick={aoCancelar}>Cancelar</Botao>}
        <Botao variante="solido" disabled={ocupado || passou} onClick={salvar}>{ocupado ? "Salvando…" : registro ? "Salvar correção" : "Registrar"}</Botao>
      </div>
    </div>
  );
}

function VestibularOpcional({ valor, aoMudar, rotulo = "Vestibular (opcional)", erro, obrigatorio }) {
  const { ind } = useApp();
  return (
    <Campo rotulo={rotulo} erro={erro}>
      <select className="entrada" value={valor || ""} onChange={(e) => aoMudar(e.target.value)}>
        <option value="">{obrigatorio ? "Selecione…" : "Nenhum"}</option>
        {ind?.vestibulares.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
      </select>
    </Campo>
  );
}

/* Detalhe de um registro agregado (ao clicar em acertos ou erros). A
   plataforma guarda o bloco, não questão por questão: o detalhe mostra isso. */
export function DetalheQuestoes({ registro, foco, aoFechar, aoEditar, aoApagar }) {
  const { usuario } = useApp();
  if (!registro) return null;
  const emBranco = Math.max(0, registro.total - registro.acertos - registro.erros);
  const corrigivel = podeCorrigir(usuario, registro);
  return (
    <Dialogo aberto={!!registro} aoFechar={aoFechar} titulo={foco === "erros" ? "Erros do registro" : foco === "acertos" ? "Acertos do registro" : "Registro de questões"} largura={480}>
      <div className="form">
        <p className="texto-dialogo"><strong><NomeConteudo materiaId={registro.materiaId} topicoId={registro.topicoId} subtopicoId={registro.subtopicoId} /></strong></p>
        <div className="detalhe-numeros">
          <div className={foco === "acertos" ? "ativo" : ""}><b className="num txt-ok">{registro.acertos}</b><span>acertos</span></div>
          <div className={foco === "erros" ? "ativo" : ""}><b className="num txt-erro">{registro.erros}</b><span>erros</span></div>
          {emBranco > 0 && <div><b className="num">{emBranco}</b><span>em branco</span></div>}
          <div><b className="num">{registro.total}</b><span>total · {fmtPct(pct(registro.acertos, registro.total))}</span></div>
        </div>
        {registro.obs && <><span className="eyebrow">Observações</span><p className="texto-dialogo">{registro.obs}</p></>}
        <p className="previa-linha">
          Resolvidas em {fmtDataLonga(registro.data)}. Registrado em {fmtDataHora(registro.criadoEm?.slice(0, 16))}.
          A plataforma guarda o bloco inteiro (total, acertos e erros), não cada questão.
        </p>
        <div className="dialogo-acoes">
          {corrigivel && aoApagar && <Botao variante="texto" icone={Trash2} onClick={() => aoApagar(registro)}>Apagar</Botao>}
          {corrigivel && aoEditar && <Botao variante="vidro" icone={Pencil} onClick={() => aoEditar(registro)}>Corrigir</Botao>}
          <Botao variante="solido" onClick={aoFechar}>Fechar</Botao>
        </div>
        {!corrigivel && usuario?.role === "aluno" && <p className="previa-linha">Correções pelo aluno só nas primeiras {JANELA_CORRECAO_H} h. Depois, peça ao professor.</p>}
      </div>
    </Dialogo>
  );
}

/* ---------- Simulados ---------- */

// inicial: valores já preenchidos (ex.: a prova escolhida na galeria, com o provaId)
export function FormSimulado({ alunoId, registro, inicial = {}, aoConcluir, aoCancelar, pedirMotivo, cursoPadrao }) {
  const { s, hoje } = useApp();
  const [f, setF] = useState(() => registro
    ? { ...registro, ano: registro.ano ?? "", cursoId: registro.cursoId || "" }
    : { vestibularId: "", nome: "", ano: "", cursoId: cursoPadrao || "", data: hoje, total: "", acertos: "", erros: "", obs: "", ...inicial });
  const [arquivo, setArquivo] = useState(null);
  const [tirarPdf, setTirarPdf] = useState(false);
  const [progresso, setProgresso] = useState(null);
  const [motivo, setMotivo] = useState("");
  const { executar, ocupado, erro } = useAcao();
  const erros = errosDeCampo(erro);
  const { ind } = useApp();

  const salvar = () => executar(async () => {
    const dados = { ...f, total: num(f.total), acertos: num(f.acertos), erros: num(f.erros) };
    const opcoes = { arquivo, aoProgredir: (p) => setProgresso(p), motivo, removerArquivo: tirarPdf };
    if (registro) await s.simulados.corrigir(registro.id, dados, opcoes);
    else await s.simulados.registrar(alunoId, dados, opcoes);
    setProgresso(null);
    aoConcluir?.("Simulado salvo.");
  }).finally(() => setProgresso(null));

  return (
    <div className="form">
      <div className="form-linha">
        <VestibularOpcional rotulo="Vestibular" obrigatorio valor={f.vestibularId} erro={erros.vestibularId} aoMudar={(v) => setF({ ...f, vestibularId: v })} />
        <Campo rotulo="Ano da prova (opcional)" erro={erros.ano}><input className="entrada num" type="number" min="1990" max="2100" value={f.ano} placeholder="2025" onChange={(e) => setF({ ...f, ano: e.target.value })} /></Campo>
      </div>
      <Campo rotulo="Nome" erro={erros.nome}><input className="entrada" value={f.nome} placeholder="Ex.: 1ª fase 2025 · simulado do cursinho" onChange={(e) => setF({ ...f, nome: e.target.value })} /></Campo>
      <div className="form-linha">
        <Campo rotulo="Data em que fez" erro={erros.data}><input type="date" className="entrada" max={hoje} value={f.data} onChange={(e) => setF({ ...f, data: e.target.value })} /></Campo>
        <Campo rotulo="Curso (opcional)" erro={erros.cursoId}>
          <select className="entrada" value={f.cursoId} onChange={(e) => setF({ ...f, cursoId: e.target.value })}>
            <option value="">Nenhum</option>
            {ind?.cursos.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </Campo>
      </div>
      <div className="form-linha form-linha--3">
        <Campo rotulo="Total" erro={erros.total}><input className="entrada num" type="number" min="1" value={f.total} onChange={(e) => setF({ ...f, total: e.target.value })} /></Campo>
        <Campo rotulo="Acertos" erro={erros.acertos}><input className="entrada num entrada--ok" type="number" min="0" value={f.acertos} onChange={(e) => setF({ ...f, acertos: e.target.value })} /></Campo>
        <Campo rotulo="Erros" erro={erros.erros}><input className="entrada num entrada--erro" type="number" min="0" value={f.erros} onChange={(e) => setF({ ...f, erros: e.target.value })} /></Campo>
      </div>
      {f.total !== "" && Number(f.acertos) + Number(f.erros) <= Number(f.total) && (
        <p className="previa-linha num">{fmtPct(pct(Number(f.acertos) || 0, Number(f.total) || 0))} de acerto</p>
      )}
      <Campo rotulo="Observações (opcional)"><textarea className="entrada" rows={2} value={f.obs} onChange={(e) => setF({ ...f, obs: e.target.value })} /></Campo>
      <div className="campo">
        <span>PDF da prova ou do gabarito (opcional)</span>
        <label className="soltar soltar--compacto">
          <FileUp aria-hidden="true" />
          <strong>{arquivo ? `${arquivo.name} · ${fmtTamanho(arquivo.size)}` : registro?.arquivo && !tirarPdf ? `Atual: ${registro.arquivo.nome}` : "Escolher PDF (até 25 MB)"}</strong>
          <input type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(e) => { setArquivo(e.target.files?.[0] || null); setTirarPdf(false); }} />
        </label>
        {erros.arquivo && <small className="campo-erro" role="alert">{erros.arquivo}</small>}
        {registro?.arquivo && !arquivo && !tirarPdf && <Botao variante="texto" tamanho="sm" onClick={() => setTirarPdf(true)}>Tirar o PDF</Botao>}
        {progresso != null && <div className="progresso-envio" role="status"><span style={{ width: `${Math.round(progresso * 100)}%` }} />Enviando… {Math.round(progresso * 100)}%</div>}
      </div>
      {registro && pedirMotivo && (
        <Campo rotulo="Motivo da correção" ajuda="Fica no histórico de alterações."><input className="entrada" value={motivo} onChange={(e) => setMotivo(e.target.value)} /></Campo>
      )}
      {!Object.keys(erros).length && <MensagemErro erro={erro} />}
      <div className="dialogo-acoes">
        {aoCancelar && <Botao variante="vidro" onClick={aoCancelar}>Cancelar</Botao>}
        <Botao variante="solido" disabled={ocupado} onClick={salvar}>{ocupado ? "Salvando…" : registro ? "Salvar correção" : "Registrar simulado"}</Botao>
      </div>
    </div>
  );
}

/* Apagar registro com confirmação (e motivo, para o moderador). */
export function ApagarRegistro({ alvo, tipo, aoFechar }) {
  const { s, usuario } = useApp();
  const [motivo, setMotivo] = useState("");
  const { executar, ocupado, erro } = useAcao();
  if (!alvo) return null;
  const apagar = () => executar(async () => {
    if (tipo === "simulado") await s.simulados.remover(alvo.id, { motivo });
    else await s.questoes.remover(alvo.id, { motivo });
    aoFechar();
  });
  return (
    <Dialogo aberto={!!alvo} aoFechar={aoFechar} titulo={tipo === "simulado" ? "Apagar simulado" : "Apagar registro de questões"} largura={440}>
      <div className="form">
        <p className="texto-dialogo">O registro sai do desempenho. A exclusão fica no histórico de alterações, com data e autor.</p>
        {usuario.role === "moderador" && <Campo rotulo="Motivo"><input className="entrada" value={motivo} onChange={(e) => setMotivo(e.target.value)} /></Campo>}
        <MensagemErro erro={erro} />
        <div className="dialogo-acoes">
          <Botao variante="vidro" onClick={aoFechar}>Cancelar</Botao>
          <Botao variante="perigo" disabled={ocupado} onClick={apagar}>{ocupado ? "Apagando…" : "Apagar"}</Botao>
        </div>
      </div>
    </Dialogo>
  );
}
