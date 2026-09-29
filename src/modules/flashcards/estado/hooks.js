/* Ganchos do React para o módulo: sessão do aluno, a loja e a base das rotas. */

import { createContext, useContext, useEffect, useState, useSyncExternalStore } from "react";
import { useLocation, useParams } from "react-router-dom";
import { observarAluno } from "../dados/index.js";

// { uid, modo } | undefined enquanto descobre
export function useSessaoAluno() {
  const [sessao, setSessao] = useState(undefined);
  useEffect(() => observarAluno(setSessao), []);
  return sessao;
}

export const LojaCtx = createContext(null);

export function useLoja() {
  const loja = useContext(LojaCtx);
  const estado = useSyncExternalStore(loja.assinar, loja.obter);
  return { loja, estado, repo: loja.repo, agendador: loja.agendador };
}

// endereço base do módulo (onde a plataforma o montou), sem depender dela
export function useBaseDoModulo() {
  const { pathname } = useLocation();
  const resto = useParams()["*"] || "";
  return pathname.slice(0, pathname.length - resto.length).replace(/\/$/, "");
}

export const BaseCtx = createContext("");
export const useBase = () => useContext(BaseCtx);

// preferência só deste aparelho (ex.: matérias abertas); nunca dado do aluno
export function usePreferencia(chave, inicial) {
  const [valor, setValor] = useState(() => {
    try { const v = localStorage.getItem(chave); return v == null ? inicial : JSON.parse(v); } catch { return inicial; }
  });
  const definir = (v) => {
    setValor((atual) => {
      const novo = typeof v === "function" ? v(atual) : v;
      try { localStorage.setItem(chave, JSON.stringify(novo)); } catch { /* sem armazenamento: vale só nesta visita */ }
      return novo;
    });
  };
  return [valor, definir];
}

// sem conexão (para avisar que o que for feito sobe depois)
export function useConectado() {
  const [on, setOn] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  useEffect(() => {
    const a = () => setOn(true);
    const b = () => setOn(false);
    window.addEventListener("online", a);
    window.addEventListener("offline", b);
    return () => { window.removeEventListener("online", a); window.removeEventListener("offline", b); };
  }, []);
  return on;
}
