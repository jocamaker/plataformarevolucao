/* Instalação (primeiro moderador) e conta sem acesso. */

import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { useApp } from "../state/AppContext.jsx";
import { errosDeCampo, useAcao } from "../state/hooks.js";
import { Botao, Campo, Carregando, Marca, MensagemErro } from "../ui/ui.jsx";

export function Instalacao() {
  const { s, usuario } = useApp();
  const [precisa, setPrecisa] = useState(null);
  const [f, setF] = useState({ nome: "", email: "", senha: "", confirmar: "" });
  const { executar, ocupado, erro } = useAcao();
  const [erroSenha, setErroSenha] = useState("");

  useEffect(() => { s.auth.precisaInstalar().then(setPrecisa).catch(() => setPrecisa(false)); }, [s]);
  if (usuario?.role) return <Navigate to="/boas-vindas" replace />;
  if (precisa === null) return <div className="tela-centro"><Carregando /></div>;
  if (!precisa) return <Navigate to="/entrar" replace />;
  const erros = errosDeCampo(erro);

  const enviar = (e) => {
    e.preventDefault();
    if (f.senha !== f.confirmar) { setErroSenha("As senhas não conferem."); return; }
    setErroSenha("");
    executar(() => s.auth.instalar(f));
  };

  return (
    <div className="tela-centro">
      <form className="cartao form cartao-acesso" onSubmit={enviar} noValidate>
        <Marca />
        <h1 className="subtitulo">Primeiro acesso</h1>
        <p className="texto-dialogo">Crie a conta do moderador. Ela gerencia alunos, planos, materiais e textos. Só é possível fazer isto uma vez.</p>
        <Campo rotulo="Seu nome" erro={erros.nome}><input className="entrada" value={f.nome} autoComplete="name" onChange={(e) => setF({ ...f, nome: e.target.value })} /></Campo>
        <Campo rotulo="E-mail" erro={erros.email}><input className="entrada" type="email" value={f.email} autoComplete="email" onChange={(e) => setF({ ...f, email: e.target.value })} /></Campo>
        <Campo rotulo="Senha" ajuda="Ao menos 6 caracteres." erro={erros.senha}><input className="entrada" type="password" value={f.senha} autoComplete="new-password" onChange={(e) => setF({ ...f, senha: e.target.value })} /></Campo>
        <Campo rotulo="Confirme a senha" erro={erroSenha}><input className="entrada" type="password" value={f.confirmar} autoComplete="new-password" onChange={(e) => setF({ ...f, confirmar: e.target.value })} /></Campo>
        {!Object.keys(erros).length && <MensagemErro erro={erro} />}
        <Botao type="submit" variante="solido" bloco disabled={ocupado}>{ocupado ? "Criando…" : "Criar moderador"}</Botao>
      </form>
    </div>
  );
}

export function AcessoBloqueado() {
  const { usuario, sair } = useApp();
  return (
    <div className="tela-centro">
      <div className="cartao form cartao-acesso">
        <ShieldAlert aria-hidden="true" className="icone-grande" />
        <h1 className="subtitulo">{usuario?.bloqueado ? "Acesso suspenso" : "Conta sem cadastro"}</h1>
        <p className="texto-dialogo">
          {usuario?.bloqueado
            ? "Seu acesso foi suspenso pela coordenação. Se acha que é engano, fale com o seu professor."
            : "Esta conta existe, mas não está cadastrada na plataforma. Peça ao seu professor para cadastrar o seu e-mail."}
        </p>
        <Botao variante="vidro" onClick={sair}>Sair</Botao>
      </div>
    </div>
  );
}
