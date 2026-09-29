/* Porta de entrada dos dados do módulo: abre o repositório do aluno logado.
   Com Firebase configurado, o banco de verdade; sem, a demonstração no
   navegador. As telas do módulo só falam com o repositório por aqui. */

import { configFirebase, servicosFirebase } from "./sessao.js";

export { observarAluno } from "./sessao.js";
export * from "./contrato.js";

export async function abrirRepositorio({ uid, aoErroTardio } = {}) {
  if (configFirebase()) {
    const [{ criarRepoFirestore }, s] = await Promise.all([import("./repoFirestore.js"), servicosFirebase()]);
    return criarRepoFirestore({ db: s.db, storage: s.storage, uid, aoErroTardio });
  }
  const { abrirRepoDemonstracao } = await import("./repoDemonstracao.js");
  return abrirRepoDemonstracao({ uid });
}
