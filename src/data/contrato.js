/* Contrato do repositório. Os dois adaptadores (local e Firebase) implementam:

   Coleções
     listar(colecao, filtros?)           → Promise<doc[]>
     obter(colecao, id)                  → Promise<doc | null>
     observar(colecao, filtros, cb)      → cancelar()        tempo real
     observarDoc(colecao, id, cb)        → cancelar()
     criar(colecao, dados, id?)          → Promise<id>
     definir(colecao, id, dados)         → Promise           substitui o documento
     mesclar(colecao, id, dados)         → Promise           cria ou mescla em profundidade (objetos aninhados)
     atualizar(colecao, id, patch)       → Promise           chaves com caminho "a.b"; aceita incrementar/apagarCampo
     remover(colecao, id)                → Promise
     lote(operacoes)                     → Promise           atômico: [{ tipo: criar|definir|mesclar|atualizar|remover, colecao, id, dados }]

   Arquivos (o banco guarda só metadados e a referência)
     enviarArquivo(caminho, blob, { aoProgredir }) → Promise<{ ref, nome, tamanho, tipo }>
     urlArquivo(ref)                     → Promise<string>
     removerArquivo(ref)                 → Promise

   Autenticação
     entrar(email, senha)                → Promise<uid>
     sair()                              → Promise
     observarSessao(cb)                  → cancelar()        cb(uid | null)
     criarConta(email, senha, { entrar }) → Promise<uid>     sem trocar a sessão atual (a não ser com entrar)

   Filtros: [["campo", "==", valor], ["campo", "in", [..]], ["campo", "array-contains", v],
             ["campo", ">=", v], ["campo", "<=", v], ["campo", ">", v], ["campo", "<", v]]
   Ordem e limite ficam com quem chama (ordenar no cliente). */

export const incrementar = (n) => ({ __op: "incrementar", n });
export const apagarCampo = () => ({ __op: "apagar" });
export const carimbo = () => ({ __op: "carimbo" }); // hora do servidor (Firebase) ou do aparelho (local)

export const ehOperacao = (v, op) => !!v && typeof v === "object" && v.__op === op;

export class ErroDados extends Error {
  constructor(mensagem, codigo = "erro") {
    super(mensagem);
    this.name = "ErroDados";
    this.codigo = codigo;
  }
}

// ids no estilo do Firestore (20 caracteres)
const ALFABETO = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
export function novoId() {
  let id = "";
  const bytes = globalThis.crypto?.getRandomValues ? globalThis.crypto.getRandomValues(new Uint8Array(20)) : null;
  for (let i = 0; i < 20; i++) id += ALFABETO[(bytes ? bytes[i] : Math.floor(Math.random() * 256)) % ALFABETO.length];
  return id;
}

export function passaFiltros(doc, filtros = []) {
  return filtros.every(([campo, op, valor]) => {
    const v = campo.split(".").reduce((o, k) => o?.[k], doc);
    if (op === "==") return v === valor;
    if (op === "!=") return v !== valor;
    if (op === "in") return valor.includes(v);
    if (op === "array-contains") return Array.isArray(v) && v.includes(valor);
    if (op === ">=") return v != null && v >= valor;
    if (op === "<=") return v != null && v <= valor;
    if (op === ">") return v != null && v > valor;
    if (op === "<") return v != null && v < valor;
    throw new ErroDados(`Filtro não suportado: ${op}`);
  });
}
