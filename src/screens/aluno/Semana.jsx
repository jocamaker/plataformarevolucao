import { useState } from "react";
import { Hand, RotateCcw, Sparkles } from "lucide-react";
import { DIAS, fmtMin } from "../../core/nucleo.js";
import { fmtDataCurta } from "../../core/datas.js";
import { chaveDoDia, datasDaSemana, idxDia } from "../../core/semana.js";
import { useApp } from "../../state/AppContext.jsx";
import { useAcao } from "../../state/hooks.js";
import { Barra, Botao, MensagemErro, Vazio } from "../../ui/ui.jsx";

/* Quadro da semana (Dashboard → Semana): as metas por dia. Mover: arrastar
   (mouse) ou tocar na meta e depois no dia (celular e teclado). Só dá para
   mover para hoje em diante. */
export function QuadroSemana({ v, texto }) {
  const { s, ind } = useApp();
  const [arrastando, setArrastando] = useState(null); // { id, de }
  const [sobre, setSobre] = useState(null);
  const [selecao, setSelecao] = useState(null); // { id, de, nome }
  const { executar, ocupado, erro } = useAcao();
  const alunoId = v.aluno.id;

  if (!v.semana) {
    return <div className="cartao"><Vazio icone={Sparkles} titulo={v.plano === null ? "Seu edital ainda não foi montado" : "Montando a semana…"} texto={v.plano === null ? "As metas da semana aparecem quando o professor aplicar a sua jornada." : null} /></div>;
  }
  const est = v.semana;
  const disp = v.plano?.disponibilidade || {};
  const hIdx = idxDia(chaveDoDia(v.hoje));
  const datas = datasDaSemana(est.chave);
  const podeReceber = (k) => idxDia(k) >= hIdx;
  const mover = (id, de, para) => {
    setArrastando(null); setSobre(null); setSelecao(null);
    if (de !== para && podeReceber(para)) executar(() => s.estudo.moverMeta(alunoId, id, de, para));
  };
  const total = DIAS.reduce((x, d) => x + (est.metas[d.k] || []).reduce((y, m) => y + m.minutos, 0), 0);
  const origem = selecao || arrastando;

  return (
    <>
      <div className="faixa">
        <span>{fmtDataCurta(datas.seg)} a {fmtDataCurta(datas.dom)} · <b className="num">{fmtMin(total)}</b> programados. {texto}</span>
        {est.editada && (
          <Botao variante="vidro" tamanho="sm" icone={RotateCcw} disabled={ocupado} onClick={() => executar(() => s.estudo.reorganizar(alunoId))}>Voltar ao automático</Botao>
        )}
      </div>
      <MensagemErro erro={erro} />
      {est.editada && (
        <div className="aviso"><Sparkles aria-hidden="true" />Semana reorganizada por você. Voltar ao automático refaz só o que ainda não foi feito, de hoje em diante.</div>
      )}

      <div className="semana-grade">
        {DIAS.map((d, i) => {
          const metas = (est.metas[d.k] || []).map(v.comConteudo);
          const feitas = metas.filter((m) => m.done).length;
          const soma = metas.reduce((x, m) => x + m.minutos, 0);
          const alvo = origem && origem.de !== d.k && podeReceber(d.k);
          const classes = ["dia", i === hIdx && "dia--hoje", i < hIdx && "dia--passado", alvo && sobre === d.k && "dia--alvo", selecao && alvo && "dia--alvo"].filter(Boolean).join(" ");
          return (
            <section key={d.k} className={classes} aria-label={`${d.nome}, ${fmtDataCurta(datas[d.k])}`}
              onDragOver={(e) => { if (alvo) { e.preventDefault(); setSobre(d.k); } }}
              onDragLeave={() => setSobre(null)}
              onDrop={() => arrastando && mover(arrastando.id, arrastando.de, d.k)}>
              <div className="dia-topo">
                <strong>{d.nome}</strong>
                <span>{i === hIdx ? "hoje" : fmtDataCurta(datas[d.k])}</span>
              </div>
              <div className="dia-topo"><span>{feitas}/{metas.length} feitas</span><span>{fmtMin(soma)} de {fmtMin(disp[d.k] || 0)}</span></div>
              <Barra valor={disp[d.k] ? (soma / disp[d.k]) * 100 : 0} cor={soma > (disp[d.k] || 0) ? "var(--danger)" : undefined} />

              {metas.map((m) => {
                const cor = m.tipo === "revisao" ? "var(--rev)" : ind?.corDaMateria(m.materiaId);
                const nome = ind?.nomeMateria(m.materiaId);
                const texto = <>
                  <strong>{nome}</strong>
                  {m.topicoId && <small className="chip-topico">{ind?.nomeTopico(m.topicoId)}{m.subtopicoId ? ` · ${ind.nomeSubtopico(m.subtopicoId)}` : ""}</small>}
                  {m.tipo === "revisao" && <small>REVISÃO · </small>}{fmtMin(m.minutos)}
                </>;
                if (m.done) return <div key={m.id} className="chip chip--feita" style={{ "--cor": cor }}>{texto}</div>;
                const selecionada = selecao?.id === m.id;
                return (
                  <button key={m.id} type="button" draggable disabled={ocupado}
                    className={`chip${selecionada ? " chip--selecionada" : ""}${arrastando?.id === m.id ? " chip--arrastando" : ""}`}
                    style={{ "--cor": cor }} aria-pressed={selecionada}
                    aria-label={`${nome}, ${fmtMin(m.minutos)}. ${selecionada ? "Selecionada: escolha o dia" : "Mover para outro dia"}`}
                    onDragStart={() => { setSelecao(null); setArrastando({ id: m.id, de: d.k }); }}
                    onDragEnd={() => { setArrastando(null); setSobre(null); }}
                    onClick={() => setSelecao(selecionada ? null : { id: m.id, de: d.k, nome })}>
                    {texto}
                  </button>
                );
              })}
              {metas.length === 0 && <p className="dia-vazio">Livre</p>}
              {selecao && alvo && (
                <Botao variante="solido" tamanho="sm" className="dia-soltar" onClick={() => mover(selecao.id, selecao.de, d.k)}>Mover para cá</Botao>
              )}
            </section>
          );
        })}
      </div>

      {selecao && (
        <div className="barra-mover" role="status">
          <Hand aria-hidden="true" width={18} height={18} />
          <span>Escolha o dia para <strong>{selecao.nome}</strong>.</span>
          <Botao variante="vidro" tamanho="sm" onClick={() => setSelecao(null)}>Cancelar</Botao>
        </div>
      )}
    </>
  );
}
