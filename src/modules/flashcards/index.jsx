/* Módulo de flashcards: ponto de montagem. A plataforma só precisa de uma
   rota "…/flashcards/*" apontando para este componente; o resto (rotas
   internas, estado, dados, estilos) vive nesta pasta. */

import { lazy, Suspense, useMemo } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import { BarChart3, Layers, Plus, Search, Settings, WifiOff } from "lucide-react";
import { lojaDo } from "./estado/loja.js";
import { BaseCtx, LojaCtx, useBaseDoModulo, useConectado, useLoja, useSessaoAluno } from "./estado/hooks.js";
import { Avisos, Carregando, Vazio } from "./ui/comum.jsx";
import Inicio from "./ui/Inicio.jsx";
import "./flashcards.css";

const Estudo = lazy(() => import("./ui/Estudo.jsx"));
const Editor = lazy(() => import("./ui/Editor.jsx"));
const Navegar = lazy(() => import("./ui/Navegar.jsx"));
const Estatisticas = lazy(() => import("./ui/Estatisticas.jsx"));
const Configuracoes = lazy(() => import("./ui/Configuracoes.jsx"));

const ABAS = [
  { para: "", rotulo: "Baralhos", icone: Layers, fim: true },
  { para: "novo", rotulo: "Adicionar", icone: Plus },
  { para: "navegar", rotulo: "Navegar", icone: Search },
  { para: "estatisticas", rotulo: "Estatísticas", icone: BarChart3 },
  { para: "configuracoes", rotulo: "Ajustes", icone: Settings },
];

function Casca() {
  const { estado, loja } = useLoja();
  const base = useBaseDoModulo();
  const conectado = useConectado();
  return (
    <BaseCtx.Provider value={base}>
      <div className="fc">
        <nav className="fc-abas" aria-label="Flashcards">
          {ABAS.map((a) => (
            <NavLink key={a.para} to={a.para ? `${base}/${a.para}` : base} end={a.fim} className="fc-aba">
              <a.icone aria-hidden="true" /><span>{a.rotulo}</span>
            </NavLink>
          ))}
        </nav>
        {estado.modo === "demonstracao" && (
          <p className="fc-faixa">Demonstração: os flashcards ficam salvos só neste navegador. Com o banco configurado, ficam na sua conta, em qualquer aparelho.</p>
        )}
        {estado.modo === "firebase" && !conectado && (
          <p className="fc-faixa fc-faixa--alerta"><WifiOff aria-hidden="true" />Sem conexão. Pode continuar: suas respostas ficam guardadas neste aparelho e sobem quando a conexão voltar.</p>
        )}
        {estado.avisoTardio && (
          <p className="fc-faixa fc-faixa--erro" role="alert">Uma alteração não foi aceita pelo servidor: {estado.avisoTardio} <button type="button" onClick={loja.limparAviso}>Entendi</button></p>
        )}
        {estado.status === "erro" ? <Vazio titulo="Não foi possível abrir os flashcards" texto={estado.erro?.message} />
          : estado.status !== "pronto" ? <Carregando texto="Abrindo seus flashcards…" />
            : (
              <Suspense fallback={<Carregando />}>
                <Routes>
                  <Route index element={<Inicio />} />
                  <Route path="estudar" element={<Estudo />} />
                  <Route path="novo" element={<Editor />} />
                  <Route path="nota/:id" element={<Editor />} />
                  <Route path="navegar" element={<Navegar />} />
                  <Route path="estatisticas" element={<Estatisticas />} />
                  <Route path="configuracoes" element={<Configuracoes />} />
                  <Route path="*" element={<Inicio />} />
                </Routes>
              </Suspense>
            )}
        <Avisos />
      </div>
    </BaseCtx.Provider>
  );
}

export default function Flashcards() {
  const sessao = useSessaoAluno();
  const loja = useMemo(() => (sessao?.uid ? lojaDo(sessao.uid) : null), [sessao?.uid]);
  if (sessao === undefined) return <div className="fc"><Carregando /></div>;
  if (!loja) return <div className="fc"><Vazio titulo="Entre na plataforma para usar os flashcards" /></div>;
  return <LojaCtx.Provider value={loja}><Casca /></LojaCtx.Provider>;
}
