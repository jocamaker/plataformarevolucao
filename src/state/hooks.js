/* Hooks de leitura em tempo real, todos sobre os serviços. */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "./AppContext.jsx";
import { preencher, primeiroNome, saudacao, textoDe } from "../textos.js";

/* Assinatura genérica: assinar(cb) → cancelar. dados undefined = carregando. */
export function useAssinatura(assinar, deps) {
  const [estado, setEstado] = useState({ dados: undefined, erro: null });
  useEffect(() => {
    setEstado({ dados: undefined, erro: null });
    if (!assinar) return undefined;
    let cancelar;
    try {
      cancelar = assinar((dados) => setEstado({ dados, erro: null }));
    } catch (erro) {
      setEstado({ dados: undefined, erro });
    }
    return () => cancelar?.();
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return estado;
}

const usar = (fabrica, deps) => {
  const { s } = useApp();
  return useAssinatura(s && fabrica ? (cb) => fabrica(s, cb) : null, [s, ...deps]).dados;
};

// dados de um aluno (o próprio ou, para o moderador, qualquer um)
export const useAluno = (id) => usar(id && ((s, cb) => s.alunos.observar(id, cb)), [id]);
export const usePlano = (id) => usar(id && ((s, cb) => s.planos.observarPlano(id, cb)), [id]);
export const useProgresso = (id) => usar(id && ((s, cb) => s.planos.observarProgresso(id, cb)), [id]);
export const useSemanaDoc = (id) => usar(id && ((s, cb) => s.estudo.observarSemana(id, cb)), [id]);
export const useSessoes = (id) => usar(id && ((s, cb) => s.estudo.observarSessoes(id, cb)), [id]);
export const useRevisoes = (id) => usar(id && ((s, cb) => s.estudo.observarRevisoes(id, cb)), [id]);
export const useResumosSemana = (id) => usar(id && ((s, cb) => s.estudo.observarResumosSemana(id, cb)), [id]);
export const useQuestoes = (id) => usar(id && ((s, cb) => s.questoes.observar(id, cb)), [id]);
export const useSimulados = (id) => usar(id && ((s, cb) => s.simulados.observar(id, cb)), [id]);
export const useNotificacoes = (id) => usar(id && ((s, cb) => s.notificacoes.observarDoAluno(id, cb)), [id]);
export const useLogs = (id) => usar(id && ((s, cb) => s.logs.observarDoAluno(id, cb)), [id]);
export const useAssistidos = (id) => usar(id && ((s, cb) => s.playlists.observarAssistidos(id, cb)), [id]);
export const useDevolutivas = (id) => usar((s, cb) => s.redacao.observar(id, cb), [id]);
export const useVistos = (id) => usar(id && ((s, cb) => s.planos.observarVistos(id, cb)), [id]);
export const usePlanosAnteriores = (id) => usar(id && ((s, cb) => s.planos.observarPlanosAnteriores(id, cb)), [id]);

// conteúdo e configuração
export const useMateriais = () => usar((s, cb) => s.materiais.observar(cb), []);
export const useAreasMateriais = () => usar((s, cb) => s.materiais.observarAreas(cb), []);
export const useProvas = () => usar((s, cb) => s.provas.observar(cb), []);
export const usePlaylists = () => usar((s, cb) => s.playlists.observar(cb), []);
export const useConfigTextos = () => usar((s, cb) => s.textos.observar(cb), []);
export const useTextosDoAluno = (id) => usar(id && ((s, cb) => s.textos.observarDoAluno(id, cb)), [id]);
export const useBoasVindas = () => usar((s, cb) => s.textos.observarBoasVindas(cb), []);
export const useConfigRedacao = () => usar((s, cb) => s.redacao.observarConfig(cb), []);

// só moderador
export const useAlunos = () => usar((s, cb) => s.alunos.observarTodos(cb), []);
export const useModelos = () => usar((s, cb) => s.planos.observarModelos(cb), []);
export const useTodosPlanos = () => usar((s, cb) => s.planos.observarTodosPlanos(cb), []);
export const useTodoProgresso = () => usar((s, cb) => s.planos.observarTodoProgresso(cb), []);
export const useQuestoesDesde = (inicio) => usar((s, cb) => s.questoes.observarDesde(inicio, cb), [inicio]);
export const useSessoesDesde = (inicio) => usar((s, cb) => s.estudo.observarSessoesDesde(inicio, cb), [inicio]);
export const useTodosSimulados = () => usar((s, cb) => s.simulados.observarTodos(cb), []);
export const useEnviosAvisos = () => usar((s, cb) => s.notificacoes.observarEnvios(cb), []);
export const useTextosDeTodos = () => usar((s, cb) => s.textos.observarTodosDosAlunos(cb), []);

/* Data de hoje que acompanha a virada do dia (volta à aba, relógio). */
export function useHoje() {
  const { s } = useApp();
  const [hoje, setHoje] = useState(() => s?.ctx.hoje() || null);
  useEffect(() => {
    if (!s) return undefined;
    const ver = () => setHoje(s.ctx.hoje());
    ver();
    const t = setInterval(ver, 60000);
    document.addEventListener("visibilitychange", ver);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", ver); };
  }, [s]);
  return hoje;
}

/* Semana de metas válida hoje: garante a virada (grava) e acompanha o doc. */
export function useSemana(alunoId) {
  const { s } = useApp();
  const hoje = useHoje();
  const doc = useSemanaDoc(alunoId);
  const [erro, setErro] = useState(null);
  useEffect(() => {
    if (!s || !alunoId || !hoje) return;
    s.estudo.garantirSemana(alunoId).catch(setErro);
  }, [s, alunoId, hoje]);
  return { semana: doc, erro, hoje };
}

/* Frases do painel já resolvidas para o aluno, com as variáveis preenchidas. */
export function useFrases(aluno) {
  const { ind } = useApp();
  const config = useConfigTextos();
  const doAluno = useTextosDoAluno(aluno?.id);
  return useCallback((chave, extras = {}) => {
    const texto = textoDe(config, chave, { doAluno, vestibularId: aluno?.vestibularId, cursoId: aluno?.cursoId });
    return preencher(texto, {
      nome: primeiroNome(aluno?.nome || ""),
      saudacao: saudacao(),
      vestibular: ind?.nomeVestibular(aluno?.vestibularId) || "",
      ...extras,
    });
  }, [config, doAluno, aluno, ind]);
}

/* Perfil do aluno logado (o próprio usuário, com id). */
export function useEu() {
  const { usuario } = useApp();
  return useMemo(() => (usuario ? { ...usuario, id: usuario.uid } : null), [usuario]);
}

/* URL de um arquivo (Storage, IndexedDB ou endereço comum). */
export function useArquivoUrl(ref) {
  const { s } = useApp();
  const [estado, setEstado] = useState({ url: null, carregando: !!ref, faltando: false });
  useEffect(() => {
    if (!ref) { setEstado({ url: null, carregando: false, faltando: false }); return undefined; }
    if (!s) return undefined;
    let vivo = true;
    let criada = null;
    setEstado({ url: null, carregando: true, faltando: false });
    s.repo.urlArquivo(ref)
      .then((url) => {
        if (!vivo) { if (url?.startsWith("blob:")) URL.revokeObjectURL(url); return; }
        if (url?.startsWith("blob:")) criada = url;
        setEstado({ url, carregando: false, faltando: !url });
      })
      .catch(() => vivo && setEstado({ url: null, carregando: false, faltando: true }));
    return () => { vivo = false; if (criada) URL.revokeObjectURL(criada); };
  }, [s, ref]);
  return estado;
}

/* Ação assíncrona com estado de envio e mensagem de erro amigável. */
export function useAcao() {
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState(null);
  const vivo = useRef(true);
  useEffect(() => () => { vivo.current = false; }, []);
  const executar = useCallback(async (fn) => {
    setOcupado(true);
    setErro(null);
    try {
      return await fn();
    } catch (e) {
      if (vivo.current) setErro(e);
      return undefined;
    } finally {
      if (vivo.current) setOcupado(false);
    }
  }, []);
  return { executar, ocupado, erro, limparErro: () => setErro(null) };
}

// mensagem para a tela (validação, permissão, dados)
export const mensagemDeErro = (e) => (e ? e.message || "Algo deu errado. Tente de novo." : "");
export const errosDeCampo = (e) => (e?.name === "ErroValidacao" ? e.erros : {});
