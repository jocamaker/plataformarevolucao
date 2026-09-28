import { useCallback, useEffect, useState } from "react";

const CHAVE = "aprova:tema";

function inicial() {
  try { return localStorage.getItem(CHAVE) === "light" ? "light" : "dark"; } catch { return "dark"; }
}

// Tema das telas internas. Login e boas-vindas ficam sempre escuros (vídeo).
export function useTema() {
  const [tema, setTema] = useState(inicial);

  useEffect(() => {
    const raiz = document.documentElement;
    raiz.dataset.theme = tema;
    raiz.style.background = tema === "light" ? "#f3f3f1" : "#000000";
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", tema === "light" ? "#f3f3f1" : "#000000");
    try { localStorage.setItem(CHAVE, tema); } catch { /* sem armazenamento */ }
  }, [tema]);

  const alternar = useCallback(() => setTema((t) => (t === "light" ? "dark" : "light")), []);
  return [tema, alternar];
}
