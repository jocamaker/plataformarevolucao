import { useNavigate } from "react-router-dom";
import { AlertTriangle, CalendarCheck, Flame, PenLine, Target, UserX, Users } from "lucide-react";
import { fmtMin } from "../core/nucleo.js";
import { useApp } from "../state/AppContext.jsx";
import { useAlunos, useBoasVindas, useConfigTextos, useDevolutivas, useEu, useFrases, useNotificacoes, useTodosPlanos } from "../state/hooks.js";
import { useVisaoAluno } from "../state/aluno.js";
import { COR_DESTAQUE_PADRAO, primeiroNome, saudacao } from "../textos.js";
import { Cinema } from "../ui/Cinema.jsx";
import { Botao, Estrela } from "../ui/ui.jsx";
import { MENU_ALUNO, MENU_MODERADOR } from "../navegacao.js";

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

// o mesmo menu das telas internas, para os nomes nunca divergirem
const navDoMenu = (menu, ir) => [
  ...menu.topo.map((i) => ({ label: i.label, onClick: () => ir(i.k) })),
  { label: menu.extra.label, submenu: menu.extra.itens.map((i) => ({ label: i.label, onClick: () => ir(i.k) })) },
];

/* Tela de entrada do aluno: saudação, indicadores reais e a próxima meta. */
function GateAluno() {
  const { sair, ind } = useApp();
  const eu = useEu();
  const v = useVisaoAluno(eu.id);
  const navigate = useNavigate();
  const config = useConfigTextos();
  const hero = useBoasVindas()?.hero || {};
  const avisos = useNotificacoes(eu.id) || [];
  const t = useFrases(v.aluno || eu);
  const ir = (tela) => navigate(`/aluno/${tela}`);
  const proxima = [...(v.atrasadas || []), ...(v.metasHoje || [])].find((m) => !m.done);
  const aviso = avisos.find((n) => !n.lidaEm);
  const cor = ind?.vestibular(v.aluno?.vestibularId)?.cor;
  const c30 = v.consistencia30;

  return (
    <Cinema
      nav={navDoMenu(MENU_ALUNO, ir)}
      acoes={<>
        <Botao variante="vidro" className="opcional aparece aparece--escala" style={{ "--d": "0.3s" }} onClick={sair}>Sair</Botao>
        <Botao variante="solido" className="aparece aparece--escala" style={{ "--d": "0.34s" }} onClick={() => ir("inicio")}>Acessar a plataforma</Botao>
      </>}
      rodapeMenu={<Botao variante="vidro" onClick={sair}>Sair</Botao>}
      selo={<span className="selo-topo aparece aparece--pop" style={{ "--d": "0.22s", "--cor": cor }}><i />{t("boasvindas.selo")}</span>}
      titulo={`${t("boasvindas.saudacao")}\n${t(v.metasHoje?.length ? "boasvindas.comMetas" : "boasvindas.semMetas")}`}
      corDestaque={config?.corDestaque || COR_DESTAQUE_PADRAO}
      lede={aviso ? <>“{aviso.titulo}”<cite>{aviso.autorNome || hero.nome} · aviso novo</cite></> : hero.subtitulo}
      stats={v.carregando ? [] : [
        { icone: <CalendarCheck aria-hidden="true" />, texto: <>Você estudou <b>{c30?.diasEstudados ?? 0} dos últimos 30 dias</b></> },
        { icone: <Flame aria-hidden="true" />, texto: <><b>{plural(c30?.sequenciaAtual ?? 0, "dia", "dias")}</b> seguidos estudando</> },
        ...(v.progressoPlano ? [{ icone: <Target aria-hidden="true" />, texto: <><b>{String(v.progressoPlano.pct).replace(".", ",")}%</b> do plano concluído</> }] : []),
        ...(v.atrasos?.quantidade ? [{ icone: <AlertTriangle aria-hidden="true" />, texto: <><b>{plural(v.atrasos.quantidade, "conteúdo", "conteúdos")}</b> em atraso</> }] : []),
      ]}
    >
      <div className="capsula">
        <div className="capsula-texto">
          {proxima ? <><span>Próxima meta ·</span>{ind?.nomeMateria(proxima.materiaId)} · {fmtMin(proxima.minutos)}</> : v.plano === null ? "Seu plano ainda não foi criado" : "Nenhuma meta pendente hoje"}
        </div>
        <Botao variante="solido" onClick={() => ir("inicio")}>{proxima ? "Começar" : "Ver o painel"}</Botao>
      </div>
      {!v.carregando && v.totalHoje > 0 && (
        <p className="cine-dica">{plural(v.totalHoje - v.feitasHoje, "meta aberta", "metas abertas")} hoje{v.atrasadas.some((m) => !m.done) ? ", incluindo atrasadas" : ""}</p>
      )}
    </Cinema>
  );
}

/* Tela de entrada do moderador. */
function GateModerador() {
  const { usuario, sair } = useApp();
  const navigate = useNavigate();
  const config = useConfigTextos();
  const hero = useBoasVindas()?.hero || {};
  const alunos = (useAlunos() || []).filter((a) => a.ativo !== false);
  const planos = useTodosPlanos() || [];
  const devolutivas = useDevolutivas() || [];
  const ir = (tela) => navigate(`/moderador/${tela}`);
  const semPlano = alunos.filter((a) => !planos.some((p) => p.id === a.id)).length;
  const rascunhos = devolutivas.filter((d) => d.status === "rascunho").length;

  return (
    <Cinema
      nav={navDoMenu(MENU_MODERADOR, ir)}
      acoes={<>
        <Botao variante="vidro" className="opcional aparece aparece--escala" style={{ "--d": "0.3s" }} onClick={sair}>Sair</Botao>
        <Botao variante="solido" className="aparece aparece--escala" style={{ "--d": "0.34s" }} onClick={() => ir("alunos")}>Acessar o painel</Botao>
      </>}
      rodapeMenu={<Botao variante="vidro" onClick={sair}>Sair</Botao>}
      selo={<span className="selo-topo aparece aparece--pop" style={{ "--d": "0.22s" }}><Estrela />Painel do professor</span>}
      titulo={`${saudacao()}, ${primeiroNome(usuario.nome)}.\nSua turma *está esperando*.`}
      corDestaque={config?.corDestaque || COR_DESTAQUE_PADRAO}
      lede={hero.subtitulo}
      stats={[
        { icone: <Users aria-hidden="true" />, texto: <><b>{alunos.length}</b> {alunos.length === 1 ? "aluno ativo" : "alunos ativos"}</> },
        { icone: <UserX aria-hidden="true" />, texto: <><b>{semPlano}</b> sem plano de estudos</> },
        { icone: <PenLine aria-hidden="true" />, texto: <><b>{rascunhos}</b> {rascunhos === 1 ? "devolutiva" : "devolutivas"} em rascunho</> },
      ]}
    >
      <div className="capsula">
        <div className="capsula-texto"><span>Acompanhamento ·</span>{plural(alunos.length, "aluno", "alunos")}</div>
        <Botao variante="solido" onClick={() => ir("alunos")}>Ver alunos</Botao>
      </div>
    </Cinema>
  );
}

export default function BoasVindas() {
  const { usuario } = useApp();
  if (!usuario) return null;
  return usuario.role === "moderador" ? <GateModerador /> : <GateAluno />;
}
