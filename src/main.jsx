import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles/base.css";
import "./styles/ui.css";
import "./styles/hero.css";
import "./styles/app.css";
import "./styles/conteudo.css";
import "./styles/plataforma.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
