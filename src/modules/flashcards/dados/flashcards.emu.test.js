/* Flashcards nos emuladores: isolamento por aluno (regras do Firestore e do
   Storage) e o adaptador Firestore passando pela mesma bateria de contrato
   do adaptador em memória. Rode com: npm run test:emuladores */

import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, doc, getDoc, getDocs, setDoc } from "firebase/firestore";
import { getBytes, ref, uploadBytes } from "firebase/storage";
import { contratoDoRepositorio } from "./contrato.suite.js";
import { criarRepoFirestore } from "./repoFirestore.js";

let env;
const db = (uid) => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).firestore();
const st = (uid) => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).storage();
const imagem = new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80]);

beforeAll(async () => {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080").split(":");
  const [sHost, sPort] = (process.env.FIREBASE_STORAGE_EMULATOR_HOST || "127.0.0.1:9199").split(":");
  env = await initializeTestEnvironment({
    projectId: "demo-aprova",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host, port: Number(port) },
    storage: { rules: readFileSync("storage.rules", "utf8"), host: sHost, port: Number(sPort) },
  });
});
afterAll(() => env?.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const d = ctx.firestore();
    await Promise.all([
      setDoc(doc(d, "usuarios/ana"), { role: "aluno", nome: "Ana", ativo: true }),
      setDoc(doc(d, "usuarios/carlos"), { role: "aluno", nome: "Carlos", ativo: true }),
      setDoc(doc(d, "usuarios/mod"), { role: "moderador", nome: "Mod", ativo: true }),
      setDoc(doc(d, "usuarios/bloq"), { role: "aluno", nome: "Bloqueado", ativo: false }),
      setDoc(doc(d, "flashcards_alunos/ana"), { retencao: 0.9 }),
      setDoc(doc(d, "flashcards_alunos/ana/flashcards_cartoes/n1__1"), { notaId: "n1", ordinal: "1" }),
      setDoc(doc(d, "flashcards_alunos/bloq/flashcards_materias/m1"), { nome: "Física" }),
    ]);
  });
});

describe("regras do Firestore: cada aluno só na própria árvore", () => {
  it("o aluno lê e grava tudo o que é dele", async () => {
    await assertSucceeds(getDoc(doc(db("ana"), "flashcards_alunos/ana")));
    await assertSucceeds(getDocs(collection(db("ana"), "flashcards_alunos/ana/flashcards_cartoes")));
    for (const c of ["flashcards_materias", "flashcards_topicos", "flashcards_notas", "flashcards_cartoes", "flashcards_revisoes", "flashcards_dias"]) {
      await assertSucceeds(setDoc(doc(db("ana"), `flashcards_alunos/ana/${c}/x`), { ok: true }));
    }
  });

  it("outro aluno, o moderador e quem não entrou não leem nem gravam", async () => {
    for (const quem of ["carlos", "mod", null]) {
      await assertFails(getDoc(doc(db(quem), "flashcards_alunos/ana")));
      await assertFails(getDoc(doc(db(quem), "flashcards_alunos/ana/flashcards_cartoes/n1__1")));
      await assertFails(getDocs(collection(db(quem), "flashcards_alunos/ana/flashcards_cartoes")));
      await assertFails(setDoc(doc(db(quem), "flashcards_alunos/ana/flashcards_cartoes/intruso"), { ok: true }));
    }
  });

  it("bloqueado pelo moderador ou sem perfil na plataforma: sem acesso nem ao que é seu", async () => {
    await assertFails(getDocs(collection(db("bloq"), "flashcards_alunos/bloq/flashcards_materias")));
    await assertFails(setDoc(doc(db("sem-perfil"), "flashcards_alunos/sem-perfil"), { retencao: 0.9 }));
  });

  it("nada fora das coleções do módulo, nem dentro da própria árvore", async () => {
    await assertFails(setDoc(doc(db("ana"), "flashcards_alunos/ana/outra_colecao/x"), { ok: true }));
    await assertFails(setDoc(doc(db("ana"), "flashcards_alunos/ana/flashcards_cartoes/x/sub/y"), { ok: true }));
  });
});

describe("regras do Storage: imagens dos cartões só do dono", () => {
  it("o dono envia e lê; outro aluno e o moderador não", async () => {
    await assertSucceeds(uploadBytes(ref(st("ana"), "flashcards/ana/a.webp"), imagem, { contentType: "image/webp" }));
    await assertSucceeds(getBytes(ref(st("ana"), "flashcards/ana/a.webp")));
    await assertFails(getBytes(ref(st("carlos"), "flashcards/ana/a.webp")));
    await assertFails(getBytes(ref(st("mod"), "flashcards/ana/a.webp")));
    await assertFails(uploadBytes(ref(st("carlos"), "flashcards/ana/b.webp"), imagem, { contentType: "image/webp" }));
  });
  it("só imagem, até 3 MB", async () => {
    await assertFails(uploadBytes(ref(st("ana"), "flashcards/ana/x.pdf"), imagem, { contentType: "application/pdf" }));
    await assertFails(uploadBytes(ref(st("ana"), "flashcards/ana/grande.jpg"), new Uint8Array(3 * 1024 * 1024 + 1), { contentType: "image/jpeg" }));
    await assertSucceeds(uploadBytes(ref(st("ana"), "flashcards/ana/ok.jpg"), new Uint8Array(1024), { contentType: "image/jpeg" }));
  });
});

// o adaptador de verdade, com as regras valendo, na mesma bateria do adaptador em memória
contratoDoRepositorio("Firestore (emulador, com regras)", async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), "usuarios/ana"), { role: "aluno", nome: "Ana", ativo: true }));
  return criarRepoFirestore({ db: db("ana"), storage: st("ana"), uid: "ana" });
});

describe("adaptador Firestore: um aluno não alcança o outro", () => {
  it("o repositório do Carlos não vê nem grava na árvore da Ana", async () => {
    const carlos = criarRepoFirestore({ db: db("carlos"), storage: st("carlos"), uid: "carlos" });
    expect(await carlos.listar("cartoes")).toEqual([]); // a árvore dele está vazia; a da Ana tem n1__1
    const intruso = criarRepoFirestore({ db: db("carlos"), storage: st("carlos"), uid: "ana" });
    await expect(intruso.listar("cartoes")).rejects.toMatchObject({ codigo: "permissao" });
    await expect(intruso.lote([{ tipo: "definir", colecao: "cartoes", id: "x", dados: { ok: true } }])).rejects.toMatchObject({ codigo: "permissao" });
  });
  it("imagem: envia comprimida, lê o endereço e apaga", async () => {
    const ana = criarRepoFirestore({ db: db("ana"), storage: st("ana"), uid: "ana" });
    const refImg = await ana.enviarImagem(new Blob([imagem], { type: "image/webp" }));
    expect(refImg).toMatch(/^st:flashcards\/ana\/.+\.webp$/);
    expect(await ana.urlImagem(refImg)).toMatch(/^http/);
    await ana.apagarImagem(refImg);
    await ana.apagarImagem(refImg); // apagar de novo não é erro
  });
});
