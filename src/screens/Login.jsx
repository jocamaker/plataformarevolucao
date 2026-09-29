/* Entrada: fundo de cores parado (sem vídeo nem animação) e um cartão
   branco: à esquerda, o acesso; à direita, a marca do curso (frase, texto e
   foto do professor, que o moderador edita em Textos). */

import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useApp } from "../state/AppContext.jsx";
import { useArquivoUrl, useBoasVindas, useConfigTextos } from "../state/hooks.js";
import { BOAS_VINDAS_PADRAO, SENHA_DEMO } from "../data/semente.js";
import { COR_DESTAQUE_PADRAO, textoDe } from "../textos.js";
import { Dialogo, Frase, Marca } from "../ui/ui.jsx";
import { AvatarProfessor, Bloco } from "./Paginas.jsx";

const INFORMACOES = [
  { k: "metodo", titulo: "Método" },
  { k: "professores", titulo: "Professores" },
  { k: "acesso", titulo: "Acesso" },
];

function Informacao({ qual, conteudo }) {
  const hero = conteudo.hero || {};
  if (qual === "metodo") return <div className="blocos">{conteudo.blocos.map((b) => <Bloco key={b.id} bloco={b} />)}</div>;
  if (qual === "professores") {
    return (
      <div className="professor">
        <AvatarProfessor hero={hero} />
        <div>
          <strong>{hero.nome}</strong>
          {hero.subtitulo && <p>{hero.subtitulo}</p>}
        </div>
      </div>
    );
  }
  return <p className="texto-dialogo">O acesso é criado pelo seu professor. Entre com o e-mail cadastrado e a senha que você recebeu. Se esqueceu a senha, fale com a coordenação.</p>;
}

function FotoProfessor({ hero }) {
  const { url } = useArquivoUrl(hero.foto);
  return (
    <div className="login-foto" aria-hidden={!url}>
      <span className="login-aneis" aria-hidden="true" />
      {url && <img src={url} alt={hero.nome || "Professor"} />}
    </div>
  );
}

export default function Login() {
  const { s, modo } = useApp();
  const config = useConfigTextos();
  const conteudo = useBoasVindas() || BOAS_VINDAS_PADRAO;
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [info, setInfo] = useState(null);
  const [instalar, setInstalar] = useState(false);
  const campoSenha = useRef(null);
  const t = (chave) => textoDe(config, chave);

  useEffect(() => { s.auth.precisaInstalar().then(setInstalar).catch(() => {}); }, [s]);

  // se der certo, a rota /entrar leva para a primeira tela da plataforma
  const entrar = async (e) => {
    e.preventDefault();
    if (!/.+@.+\..+/.test(email.trim())) { setErro("Digite um e-mail válido."); return; }
    if (!senha) { setErro("Digite a sua senha."); campoSenha.current?.focus(); return; }
    setEnviando(true);
    setErro("");
    try {
      await s.auth.entrar(email, senha);
    } catch (err) {
      setErro(err.codigo === "credenciais" ? "E-mail ou senha não conferem. Confira e tente de novo." : err.message);
      setEnviando(false);
    }
  };

  return (
    <div className="login fundo-cores" data-theme="light" style={{ "--destaque": config?.corDestaque || COR_DESTAQUE_PADRAO }}>
      <main className="login-cartao">
        <section className="login-acesso" aria-labelledby="login-titulo">
          <Marca className="login-logo" />
          <h1 id="login-titulo" className="login-titulo">Entrar na plataforma</h1>
          <p className="login-sub">{t("inicial.selo")}</p>
          <form className="login-form" onSubmit={entrar} noValidate>
            <label className="campo" htmlFor="login-email">
              <span>E-mail</span>
              <input id="login-email" className="entrada" type="email" autoComplete="email" inputMode="email" placeholder="seu@email.com"
                value={email} onChange={(e) => { setEmail(e.target.value); setErro(""); }} />
            </label>
            <label className="campo" htmlFor="login-senha">
              <span>Senha</span>
              <input id="login-senha" ref={campoSenha} className="entrada" type="password" autoComplete="current-password" placeholder="Sua senha"
                value={senha} onChange={(e) => { setSenha(e.target.value); setErro(""); }} />
            </label>
            {erro && <p className="login-erro" role="alert">{erro}</p>}
            <button type="submit" className="login-botao" disabled={enviando}>{enviando ? "Entrando…" : "Entrar"}</button>
          </form>
          <p className="login-dica">
            {instalar ? <Link to="/instalar">Primeiro acesso: criar a conta do moderador</Link>
              : modo === "local" ? <>Demonstração: aluno@curso.com ou moderador@curso.com · senha {SENHA_DEMO}</>
                : "O acesso é criado pelo seu professor."}
          </p>
        </section>

        <aside className="login-marca">
          <h2><Frase texto={t("inicial.titulo")} /></h2>
          <p>{t("inicial.lede")}</p>
          <FotoProfessor hero={conteudo.hero || {}} />
        </aside>
      </main>

      <nav className="login-links" aria-label="Sobre o curso">
        {INFORMACOES.map((i) => <button key={i.k} type="button" onClick={() => setInfo(i.k)}>{i.titulo}</button>)}
      </nav>

      <Dialogo aberto={!!info} aoFechar={() => setInfo(null)} titulo={INFORMACOES.find((i) => i.k === info)?.titulo} largura={560}>
        {info && <Informacao qual={info} conteudo={conteudo} />}
      </Dialogo>
    </div>
  );
}
