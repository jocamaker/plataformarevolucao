/* Contrato de dados do módulo de flashcards.

   Tudo do aluno fica numa árvore própria, isolada do resto da plataforma:

     flashcards_alunos/{uid}                      configurações do aluno
       flashcards_materias/{id}                   Matéria (nome, ordem)
       flashcards_topicos/{id}                    Tópico (materiaId, nome, ordem)
       flashcards_notas/{id}                      texto-fonte de um cartão (básico, cloze, oclusão)
       flashcards_cartoes/{notaId}__{ordinal}     cartão de revisão gerado da nota (estado FSRS e fila)
       flashcards_revisoes/{id}                   cada resposta dada (histórico, desfazer, estatísticas)
       flashcards_dias/{AAAA-MM-DD}               resumo do dia (estatísticas e sequência de dias)

   Os adaptadores (Firestore e demonstração) implementam a mesma interface:

     obter(colecao, id)                 → documento | null
     listar(colecao, consulta)          → documentos
     contar(colecao, consulta)          → número
     observar(colecao, consulta, cb)    → parar()          tempo real
     observarDoc(colecao, id, cb)       → parar()
     lote(ops)                          → { pendente }     tudo ou nada
     novoId()                           → id novo
     enviarImagem(blob), urlImagem(ref), apagarImagem(ref)

   colecao: "config" (o documento raiz) ou uma chave de COLECOES.
   consulta: { onde: [[campo, op, valor]], ordem: [campo, "asc"|"desc"], limite }
     op: "==", "<", "<=", ">", ">=", "array-contains"
     Como no Firestore: filtro de intervalo só casa valores do mesmo tipo
     (datas com datas, números com números); null e ausente ficam de fora.
   ops: { tipo: "definir" | "mesclar" | "atualizar" | "remover", colecao, id, dados }
     "atualizar" aceita caminhos com ponto ("revisoes.abc") e APAGAR.
   Datas entram e saem como Date. */

export const RAIZ = "flashcards_alunos";

export const COLECOES = Object.freeze({
  materias: "flashcards_materias",
  topicos: "flashcards_topicos",
  notas: "flashcards_notas",
  cartoes: "flashcards_cartoes",
  revisoes: "flashcards_revisoes",
  dias: "flashcards_dias",
});

export const COLECAO_CONFIG = "config";
export const ID_CONFIG = "config";

// valor especial: remove o campo (em "atualizar" e "mesclar")
export const APAGAR = Symbol.for("flashcards.apagar");

export const OPERADORES = ["==", "<", "<=", ">", ">=", "array-contains"];

export class ErroFlashcards extends Error {
  constructor(mensagem, { codigo = "erro", campos = null } = {}) {
    super(mensagem);
    this.name = "ErroFlashcards";
    this.codigo = codigo;
    this.campos = campos;
  }
}

export const colecaoValida = (colecao) => colecao === COLECAO_CONFIG || Object.hasOwn(COLECOES, colecao);

export function exigirColecao(colecao) {
  if (!colecaoValida(colecao)) throw new ErroFlashcards(`Coleção desconhecida: ${colecao}`, { codigo: "colecao" });
}

// id aleatório, 20 caracteres, como os do Firestore
const ALFABETO = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
export function novoIdAleatorio() {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALFABETO[b % ALFABETO.length]).join("");
}
