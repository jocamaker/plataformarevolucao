/* Estado global da interface: os serviços (única porta para os dados), o
   usuário logado e a estrutura acadêmica. As telas leem pelos hooks de
   state/hooks.js e escrevem pelos serviços; nenhuma fala com o banco. */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { criarRepositorio } from "../data/index.js";
import { semearDemonstracao } from "../data/semente.js";
import { criarServicos } from "../services/index.js";

const Ctx = createContext(null);

// um repositório por página (o Firebase não aceita inicializar duas vezes)
let iniciando = null;
function iniciar() {
  iniciando ||= (async () => {
    const repo = await criarRepositorio();
    if (repo.modo === "local") await semearDemonstracao(repo);
    return criarServicos(repo);
  })();
  return iniciando;
}

export function AppProvider({ children }) {
  const [s, setS] = useState(null);
  const [erro, setErro] = useState(null);
  const [usuario, setUsuario] = useState(undefined); // undefined: carregando; null: sem sessão
  const [ind, setInd] = useState(null);

  useEffect(() => {
    let parar = () => {};
    let vivo = true;
    iniciar()
      .then((servicos) => {
        if (!vivo) return;
        setS(servicos);
        parar = servicos.auth.observar(setUsuario);
      })
      .catch((e) => vivo && setErro(e));
    return () => { vivo = false; parar(); };
  }, []);

  const logado = !!usuario?.role && !usuario.bloqueado;
  useEffect(() => {
    if (!s || !logado) { setInd(null); return undefined; }
    return s.estrutura.observar(setInd);
  }, [s, logado, usuario?.uid]);

  const sair = useCallback(() => s?.auth.sair(), [s]);

  // modo local: apaga os dados deste navegador e recria a demonstração
  const recomecarDemonstracao = useCallback(async () => {
    if (s?.modo !== "local") return;
    s.repo.apagarTudo();
    const { limparArquivos } = await import("./arquivos.js");
    await limparArquivos();
    await semearDemonstracao(s.repo);
  }, [s]);

  const valor = useMemo(() => ({
    s, erro, usuario, ind, modo: s?.modo, sair, recomecarDemonstracao,
    hoje: s ? s.ctx.hoje() : null,
  }), [s, erro, usuario, ind, sair, recomecarDemonstracao]);
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useApp() {
  return useContext(Ctx);
}

export const rotaInicial = (usuario) => (usuario?.role === "moderador" ? "/moderador/alunos" : "/aluno/inicio");
