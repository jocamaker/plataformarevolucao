/* Quem pode fazer o quê. Os serviços consultam estas regras antes de gravar;
   no Firebase, as mesmas regras estão em firestore.rules e storage.rules
   (lá é que a proteção é de verdade: no navegador tudo pode ser burlado). */

export const PAPEIS = { ALUNO: "aluno", MODERADOR: "moderador" };
export const JANELA_CORRECAO_H = 24; // o aluno corrige/apaga os próprios registros por 24 h

export class ErroPermissao extends Error {
  constructor(mensagem = "Você não tem permissão para fazer isso.") {
    super(mensagem);
    this.name = "ErroPermissao";
  }
}

const moderador = (u) => u?.role === PAPEIS.MODERADOR;
const proprio = (u, alunoId) => !!u && u.role === PAPEIS.ALUNO && u.uid === alunoId;
const recente = (registro, agora = Date.now()) =>
  !!registro?.criadoEm && agora - new Date(registro.criadoEm).getTime() < JANELA_CORRECAO_H * 3600000;

/* pode(usuario, acao, alvo) — alvo traz o que a regra precisa (alunoId,
   registro, plano, campo). */
export function pode(u, acao, alvo = {}, agora = Date.now()) {
  if (!u) return false;
  switch (acao) {
    // conteúdo e estrutura (moderador escreve, todos leem)
    case "gerenciar:estrutura":
    case "gerenciar:modelos":
    case "gerenciar:playlists":
    case "gerenciar:materiais":
    case "gerenciar:textos":
    case "gerenciar:redacao":
    case "gerenciar:alunos":
    case "enviar:notificacao":
    case "ver:painelModerador":
      return moderador(u);

    // dados de um aluno
    case "ver:aluno":
      return moderador(u) || proprio(u, alvo.alunoId);

    // plano individual: moderador sempre; aluno só no que o plano permite
    case "alterar:plano":
      return moderador(u) || (proprio(u, alvo.alunoId) && !!alvo.plano?.permissoesAluno?.[alvo.permissao]);

    // estudo e registros próprios
    case "registrar:estudo":
    case "registrar:questoes":
    case "registrar:simulado":
      return moderador(u) || proprio(u, alvo.alunoId);
    case "corrigir:registro":
      return moderador(u) || (proprio(u, alvo.registro?.alunoId) && recente(alvo.registro, agora));

    // notificações
    case "ler:notificacao":
      return moderador(u) || proprio(u, alvo.notificacao?.alunoId);
    case "marcarLida:notificacao":
      return proprio(u, alvo.notificacao?.alunoId);

    default:
      return false;
  }
}

export function exigir(u, acao, alvo, agora) {
  if (!pode(u, acao, alvo, agora)) throw new ErroPermissao();
}
