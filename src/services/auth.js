/* authService: sessão, perfil e instalação (primeiro moderador). */

import { carimbo, ErroDados } from "../data/contrato.js";
import { ErroValidacao } from "./base.js";
import { PAPEIS } from "../core/permissoes.js";

export function servicoAuth(ctx) {
  const { repo } = ctx;

  return {
    /* cb(estado): undefined enquanto carrega; null sem sessão; perfil ativo;
       { uid, semPerfil: true } se a conta não tem perfil; { …perfil, bloqueado: true } se desativada. */
    observar(cb) {
      let cancelarPerfil = () => {};
      let registrouAcesso = null;
      const cancelarSessao = repo.observarSessao((uid) => {
        cancelarPerfil();
        cancelarPerfil = () => {};
        if (!uid) { ctx.usuario = null; cb(null); return; }
        cancelarPerfil = repo.observarDoc("usuarios", uid, (doc) => {
          if (!doc) { ctx.usuario = null; cb({ uid, semPerfil: true }); return; }
          const perfil = { ...doc, uid };
          if (doc.ativo === false) { ctx.usuario = null; cb({ ...perfil, bloqueado: true }); return; }
          ctx.usuario = perfil;
          if (registrouAcesso !== uid) {
            registrouAcesso = uid;
            repo.atualizar("usuarios", uid, { ultimoAcessoEm: carimbo() }).catch(() => {});
          }
          cb(perfil);
        });
      });
      return () => { cancelarPerfil(); cancelarSessao(); };
    },

    async entrar(email, senha) {
      if (!String(email || "").trim() || !senha) throw new ErroValidacao({ email: "Informe e-mail e senha." });
      return repo.entrar(email, senha);
    },

    sair: () => repo.sair(),

    // true quando ainda não existe moderador (instalação nova)
    async precisaInstalar() {
      return !(await repo.obter("config", "instalacao"));
    },

    async instalar({ nome, email, senha }) {
      const erros = {};
      if (!String(nome || "").trim()) erros.nome = "Informe seu nome.";
      if (!/.+@.+\..+/.test(String(email || "").trim())) erros.email = "E-mail inválido.";
      if (String(senha || "").length < 6) erros.senha = "A senha precisa ter ao menos 6 caracteres.";
      if (Object.keys(erros).length) throw new ErroValidacao(erros);
      if (!(await this.precisaInstalar())) throw new ErroDados("A plataforma já tem um moderador.", "ja-instalado");
      const uid = await repo.criarConta(email, senha, { entrar: true });
      await repo.lote([
        { tipo: "definir", colecao: "usuarios", id: uid, dados: { role: PAPEIS.MODERADOR, nome: nome.trim(), email: email.trim().toLowerCase(), ativo: true, criadoEm: carimbo() } },
        { tipo: "definir", colecao: "config", id: "instalacao", dados: { moderadorId: uid, em: carimbo() } },
      ]);
      return uid;
    },
  };
}
