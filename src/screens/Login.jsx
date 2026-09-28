import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Clock4, GraduationCap, Target } from "lucide-react";
import { useApp } from "../state/AppContext.jsx";
import { useArquivoUrl, useBoasVindas, useConfigTextos } from "../state/hooks.js";
import { SENHA_DEMO } from "../data/semente.js";
import { BOAS_VINDAS_PADRAO } from "../data/semente.js";
import { COR_DESTAQUE_PADRAO, textoDe } from "../textos.js";
import { Cinema } from "../ui/Cinema.jsx";
import { Botao, Dialogo, Estrela } from "../ui/ui.jsx";

const ICONES_DESTAQUE = [GraduationCap, Target, Clock4];

function Avatar({ hero }) {
  const { url } = useArquivoUrl(hero.foto);
  return <span className="avatar" style={{ "--cor": hero.cor }}>{url ? <img src={url} alt="" /> : (hero.nome || "?").charAt(0)}</span>;
}

function ConteudoFolha({ folha, welcome }) {
  const hero = welcome.hero || {};
  if (folha === "metodo") {
    const destaque = welcome.blocos.find((b) => b.tipo === "destaque");
    return (
      <>
        {destaque?.itens?.length > 0 && (
          <div className="destaques">
            {destaque.itens.map((d) => <div key={d.label}><strong>{d.valor}</strong><span>{d.label}</span></div>)}
          </div>
        )}
        {welcome.blocos.map((b) => {
          if (b.tipo === "titulo") return <h3 key={b.id}>{b.texto}</h3>;
          if (b.tipo === "texto") return <p key={b.id} style={{ whiteSpace: "pre-line" }}>{b.texto}</p>;
          return null;
        })}
      </>
    );
  }
  if (folha === "professores") {
    return (
      <div className="professor">
        <Avatar hero={hero} />
        <div>
          <span className="eyebrow">Seus professores</span>
          <strong>{hero.nome}</strong>
          <p>{hero.subtitulo}</p>
        </div>
      </div>
    );
  }
  return <p>O acesso é criado pelo seu professor. Entre com o e-mail cadastrado e a senha que você recebeu. Se esqueceu a senha, fale com a coordenação.</p>;
}

const TITULOS_FOLHA = { metodo: "Método", professores: "Professores", acesso: "Acesso" };

export default function Login() {
  const { s, modo } = useApp();
  const config = useConfigTextos();
  const welcome = useBoasVindas() || BOAS_VINDAS_PADRAO;
  const [passo, setPasso] = useState("email");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [folha, setFolha] = useState(null);
  const [instalar, setInstalar] = useState(false);
  const campo = useRef(null);
  const t = (chave) => textoDe(config, chave);

  useEffect(() => { s.auth.precisaInstalar().then(setInstalar).catch(() => {}); }, [s]);

  const focar = () => setTimeout(() => campo.current?.focus(), 30);
  const irParaEmail = () => { setPasso("email"); setSenha(""); setErro(""); focar(); };

  const enviar = async (e) => {
    e.preventDefault();
    if (passo === "email") {
      if (!/.+@.+\..+/.test(email.trim())) { setErro("Digite um e-mail válido para continuar."); return; }
      setErro(""); setPasso("senha"); focar();
      return;
    }
    // se der certo, a rota /entrar redireciona para as boas-vindas
    setEnviando(true);
    try {
      await s.auth.entrar(email, senha);
    } catch (err) {
      setErro(err.codigo === "credenciais" ? "E-mail ou senha não conferem. Confira os dados e tente de novo." : err.message);
      setEnviando(false);
    }
  };

  const destaque = welcome.blocos.find((b) => b.tipo === "destaque")?.itens || [];

  return (
    <>
      <Cinema
        nav={[
          { label: "Método", onClick: () => setFolha("metodo") },
          { label: "Professores", onClick: () => setFolha("professores") },
          { label: "Acesso", onClick: () => setFolha("acesso") },
        ]}
        acoes={<Botao variante="solido" className="aparece aparece--escala" style={{ "--d": "0.34s" }} onClick={irParaEmail}>Entrar</Botao>}
        selo={<span className="selo-topo aparece aparece--pop" style={{ "--d": "0.22s" }}><Estrela />{t("inicial.selo")}</span>}
        titulo={t("inicial.titulo")}
        corDestaque={config?.corDestaque || COR_DESTAQUE_PADRAO}
        lede={t("inicial.lede")}
        stats={destaque.map((d, i) => {
          const Icone = ICONES_DESTAQUE[i % ICONES_DESTAQUE.length];
          return { icone: <Icone aria-hidden="true" />, texto: <><b>{d.valor}</b> {d.label}</> };
        })}
      >
        <form className="capsula" onSubmit={enviar} noValidate>
          {passo === "email" ? (
            <input ref={campo} key="email" id="login-email" type="email" autoComplete="email" inputMode="email"
              placeholder="Digite seu e-mail" aria-label="E-mail" value={email}
              onChange={(e) => { setEmail(e.target.value); setErro(""); }} />
          ) : (
            <input ref={campo} key="senha" id="login-senha" type="password" autoComplete="current-password"
              placeholder="Sua senha" aria-label="Senha" value={senha}
              onChange={(e) => { setSenha(e.target.value); setErro(""); }} />
          )}
          <Botao type="submit" variante="solido" disabled={enviando}>{passo === "email" ? "Continuar" : enviando ? "Entrando…" : "Entrar"}</Botao>
        </form>
        <p className="cine-dica" aria-live="polite">
          {erro ? <span className="erro">{erro}</span>
            : passo === "senha" ? <>{email} · <button type="button" onClick={irParaEmail}>trocar e-mail</button></>
              : instalar ? <Link to="/instalar">Primeiro acesso: criar a conta do moderador</Link>
                : modo === "local" ? `Demonstração: aluno@curso.com ou moderador@curso.com · senha ${SENHA_DEMO}` : "Entre com o e-mail cadastrado pelo seu professor."}
        </p>
      </Cinema>

      <Dialogo className="folha" data-theme="dark" aberto={!!folha} aoFechar={() => setFolha(null)} titulo={TITULOS_FOLHA[folha]}>
        <ConteudoFolha folha={folha} welcome={welcome} />
      </Dialogo>
    </>
  );
}
