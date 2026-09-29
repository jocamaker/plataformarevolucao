import { useCallback, useEffect, useState } from "react";

// Só guarda o tema quando a pessoa escolhe: quem nunca trocou fica no padrão
// (claro). Chave nova porque a antiga gravava o escuro automaticamente.
const CHAVE = "aprova:tema-escolhido";

function inicial() {
  try { return localStorage.getItem(CHAVE) === "dark" ? "dark" : "light"; } catch { return "light"; }
}

// Tema das telas internas. A entrada (login) é sempre clara.
export function useTema() {
  const [tema, setTema] = useState(inicial);

  useEffect(() => {
    const raiz = document.documentElement;
    raiz.dataset.theme = tema;
    raiz.style.background = tema === "light" ? "#f3f3f1" : "#000000";
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", tema === "light" ? "#f3f3f1" : "#000000");
  }, [tema]);

  const alternar = useCallback(() => setTema((t) => {
    const novo = t === "light" ? "dark" : "light";
    try { localStorage.setItem(CHAVE, novo); } catch { /* sem armazenamento: vale só nesta visita */ }
    return novo;
  }), []);
  return [tema, alternar];
}
