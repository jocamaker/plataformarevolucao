# Módulo de flashcards

Flashcards com repetição espaçada (FSRS), isolado do resto da plataforma.
Tudo do módulo mora nesta pasta; o que ele toca fora dela está listado
abaixo, para dar para remover ou reverter por partes.

## Dados

Cada aluno tem a própria árvore; nada é compartilhado entre alunos.

```
flashcards_alunos/{uid}                      configurações (retenção, limites por dia, passos…)
  flashcards_materias/{id}                   { nome, ordem }
  flashcards_topicos/{id}                    { materiaId, nome, ordem }
  flashcards_notas/{id}                      texto-fonte: { tipo, materiaId, topicoId, campos, tags, imagens }
  flashcards_cartoes/{notaId}__{ordinal}     cartão de revisão: { estado FSRS, fila, ordemNovo, suspenso, enterradoAte, … }
  flashcards_revisoes/{id}                   cada resposta: { cartaoId, avaliacao, antes, depois, feitaEm, dia }
  flashcards_dias/{AAAA-MM-DD}               resumo do dia: { dia, revisoes: { idDaRevisao: {…} } }
```

- **Nota × cartão** (como no Anki): básico gera 1 cartão; cloze, um por
  lacuna (`{{c1::…}}`, `{{c2::…}}`); oclusão de imagem, um por forma.
  Editar a nota mantém o progresso dos cartões que continuam.
- **Fila sem índice composto:** `fila` é a data em que um cartão já estudado
  volta (null se novo ou suspenso) e `ordemNovo` é a posição na fila de
  novos (null se já estudado ou suspenso). "Pendentes hoje" é
  `fila <= fim do dia`, que usa o índice automático de um campo.
- **Índices compostos** (`firestore.indexes.json`): novos por matéria, por
  tópico e por tag; histórico de um cartão.
- **Dias** começam às 4h (configurável), no fuso do aparelho.
- **Resumo do dia** guarda cada revisão por id: regravar a mesma revisão
  (ao reenviar depois de uma queda) não conta duas vezes.

## Onde fica gravado

- **Com Firebase configurado:** no Firestore, na árvore do aluno. As regras
  (bloco "Flashcards" em `firestore.rules`) só deixam o próprio aluno ler e
  gravar ali; outro aluno e o moderador não têm acesso. Imagens no Storage
  em `flashcards/{uid}/` (só o dono; imagem até 3 MB).
- **Sem Firebase (demonstração):** no IndexedDB deste navegador, num banco
  só do módulo (`aprova-flashcards`), separado por aluno. A tela avisa.
- **Sem conexão:** o cache persistente do Firestore guarda o que foi feito e
  envia quando a conexão volta, mesmo depois de fechar a aba.

## Telas (rotas dentro de `…/flashcards/`)

| Rota | Tela |
|---|---|
| (início) | Baralhos: o que há para hoje, "Rever antes do prazo", árvore Matéria → Tópico com contagens, arrastar para reordenar, estudo por recorte e por tag |
| `estudar?materia=…\|topico=…\|tag=…` | Estudo em tela cheia: espaço revela, 1–4 avaliam, Z desfaz, `-` enterra, `@` suspende, E edita, I informações |
| `estudar?…&rever=1` | Rever antes do prazo: todos os já estudados do recorte, os menos lembrados primeiro (não gasta o limite do dia) |
| `novo`, `nota/:id` | Editor único (Frente/Verso): "Esconder" um trecho da frente vira lacuna (cloze); "Esconder partes de uma imagem" vira oclusão; prévia ao vivo |
| `navegar` | Navegar: busca, filtros, seleção em lote ("Rever hoje", mover, tags, suspender), arrastar cartões para um tópico |
| `estatisticas` | Estatísticas: hoje, sequência, acerto nas revisões, aprendidos, últimos 30 dias, progresso por matéria, próximos 7 dias |
| `configuracoes` | Ajustes: intervalo máximo (padrão 90 dias) e limites por dia; em "Avançado", retenção-alvo, passos e início do dia; reagendar opcional |

## Arquivos

```
index.jsx                  ponto de montagem: abas, avisos e rotas internas
flashcards.css             estilos (prefixo fc-, tokens próprios claro/escuro)

dados/contrato.js          nomes das coleções e interface dos adaptadores
dados/modelo.js            validação, geração de cartões e campos de fila
dados/datas.js             dias de estudo no fuso do aparelho
dados/consultas.js         consultas em memória com a semântica do Firestore
dados/repoMemoria.js       adaptador em memória (base da demonstração e dos testes)
dados/repoDemonstracao.js  demonstração no IndexedDB
dados/repoFirestore.js     adaptador Firestore + Storage
dados/sessao.js            quem é o aluno logado (único ponto que lê algo da plataforma)
dados/index.js             abre o repositório certo

motor/agendador.js         FSRS pela biblioteca ts-fsrs (previsões, resposta, teto, reagendar)
motor/fila.js              a sessão de estudo (ordem do Anki, intercalação, desfazer)

servicos/agenda.js         responder, desfazer, suspender, enterrar, adiar, definir data, resetar, reagendar
servicos/arvore.js         matérias e tópicos
servicos/notas.js          salvar/apagar/mover notas e tags
servicos/exemplos.js       cartões de exemplo para começar

estado/loja.js             estado em tempo real fora do React (um por aluno)
estado/contagens.js        contagens do dia (novos, aprendendo, revisar)
estado/estatisticas.js     números das estatísticas (funções puras)
estado/hooks.js            ganchos do React

ui/                        telas (Inicio, Estudo, Editor, Navegar, Estatisticas, Configuracoes)
                           e peças (comum, Cartao, CampoRico, EditorOclusao, graficos, html, imagens)
                           html.js também converte a lacuna marcada no editor para {{cN::…}} e de volta
```

Testes (`npm test`): modelo, adaptadores (mesma bateria de contrato),
agendador FSRS, fila, serviços e estatísticas. `npm run test:emuladores`:
regras e o adaptador Firestore nos emuladores.

## O que o módulo toca fora desta pasta

| Arquivo | O quê |
|---|---|
| `src/App.jsx` | uma rota `flashcards/*` na área do aluno (componente carregado sob demanda) |
| `src/navegacao.js` | um item "Flashcards" no menu do aluno |
| `firestore.rules` | bloco "Flashcards" no fim (só adição) |
| `storage.rules` | bloco "Flashcards" no fim (só adição) |
| `firestore.indexes.json` | índices das coleções `flashcards_*` |
| `package.json` | `ts-fsrs` (FSRS), `@dnd-kit/*` (arrastar), `@tiptap/*` (texto formatado), `dompurify` (limpeza do HTML); `fake-indexeddb` só nos testes |

Mudanças na plataforma autorizadas à parte ("a plataforma ter memória"),
que servem a ela toda e não só aos flashcards:

| Arquivo | O quê |
|---|---|
| `src/data/firebase.js` | cache persistente do Firestore (funciona sem conexão e sobrevive a fechar a aba) e nova tentativa quando uma escuta é negada logo depois do cadastro |

Para remover o módulo: apague esta pasta, a rota, o item do menu, os blocos
nas regras e os índices `flashcards_*`.

Dependência da plataforma: a sessão (Firebase Auth, ou a chave
`aprova:sessao:v3` no modo demonstração, em `dados/sessao.js`) e, nas
regras, o perfil ativo em `usuarios/{uid}` (`fcPerfilAtivo()`).

## Limites conhecidos

- Parâmetros do FSRS: os padrões do FSRS-6. Não há otimizador com o
  histórico do aluno (o Anki tem).
- Busca e Navegar leem todos os cartões e notas do aluno no aparelho; as
  estatísticas leem os cartões e os últimos 120 dias de resumos de dias.
  Para coleções de dezenas de milhares de cartões, vale paginar.
- Mover é por nota: os cartões irmãos (cloze, oclusão) vão juntos.
