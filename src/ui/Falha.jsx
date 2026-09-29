/* Rede de segurança: um erro ao desenhar uma tela fica nela, com a mensagem
   à vista (para relatar), em vez de derrubar a plataforma inteira. O Shell
   remonta o limite a cada troca de aba, então ir para outra aba já volta
   ao normal. */

import { Component } from "react";
import { AlertTriangle, RefreshCw, RotateCcw } from "lucide-react";
import { Botao } from "./ui.jsx";

// a tela não chegou (rede instável, ou uma versão nova foi publicada no meio do uso)
export const ehFalhaDeDownload = (e) =>
  /dynamically imported module|Importing a module script failed|error loading dynamically imported module|Failed to fetch|Load failed/i.test(String(e?.message || e));

export class LimiteDeErro extends Component {
  constructor(props) {
    super(props);
    this.state = { erro: null };
  }

  static getDerivedStateFromError(erro) {
    return { erro };
  }

  componentDidCatch(erro, info) {
    console.error("Erro na tela:", erro, info?.componentStack); // eslint-disable-line no-console
  }

  render() {
    const { erro } = this.state;
    if (!erro) return this.props.children;
    const download = ehFalhaDeDownload(erro);
    const cartao = (
      <div className="cartao falha-tela" role="alert">
        <AlertTriangle aria-hidden="true" />
        <h2>{download ? "Esta parte não carregou" : "Esta tela encontrou um erro"}</h2>
        <p>
          {download
            ? "A conexão falhou ou uma versão nova foi publicada. Recarregue a página."
            : "O resto da plataforma continua funcionando: use o menu para ir a outra aba. Se voltar a acontecer, envie a mensagem abaixo."}
        </p>
        <code>{String(erro?.message || erro).slice(0, 400)}</code>
        <div className="linha-acoes">
          {!download && <Botao variante="vidro" icone={RotateCcw} onClick={() => this.setState({ erro: null })}>Tentar de novo</Botao>}
          <Botao variante="solido" icone={RefreshCw} onClick={() => window.location.reload()}>Recarregar a página</Botao>
        </div>
      </div>
    );
    return this.props.telaInteira ? <div className="tela-centro">{cartao}</div> : cartao;
  }
}
