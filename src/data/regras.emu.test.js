/* Regras de segurança (firestore.rules e storage.rules) nos emuladores. */

import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import {
  Timestamp, collection, deleteDoc, doc, getDoc, getDocs, increment, query, serverTimestamp, setDoc, updateDoc, where, writeBatch,
} from "firebase/firestore";
import { ref, uploadBytes } from "firebase/storage";

let env;
const PERM = { concluirItens: true, reordenar: true, disponibilidade: true, ritmo: true, recalcular: true };
const antigo = Timestamp.fromDate(new Date(Date.now() - 30 * 3600000));
const hojeIso = new Date().toISOString().slice(0, 10);

const db = (uid) => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).firestore();
const st = (uid) => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).storage();
const questao = (alunoId, extra = {}) => ({ alunoId, data: hojeIso, materiaId: "biologia", topicoId: "bi1", total: 10, acertos: 6, erros: 3, criadoPor: alunoId, criadoEm: serverTimestamp(), ...extra });
const log = (autorId, alunoId, extra = {}) => ({ alunoId, autorId, entidade: "teste", tipo: "t", descricao: "", em: serverTimestamp(), ...extra });

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
      setDoc(doc(d, "config/instalacao"), { moderadorId: "mod" }),
      setDoc(doc(d, "usuarios/mod"), { role: "moderador", nome: "Mod", ativo: true }),
      setDoc(doc(d, "usuarios/ana"), { role: "aluno", nome: "Ana", ativo: true, vestibularId: "fuvest" }),
      setDoc(doc(d, "usuarios/carlos"), { role: "aluno", nome: "Carlos", ativo: true }),
      setDoc(doc(d, "usuarios/bloq"), { role: "aluno", nome: "Bloqueado", ativo: false }),
      setDoc(doc(d, "planos/ana"), { alunoId: "ana", ritmo: 1, disponibilidade: { seg: 60 }, materias: [{ materiaId: "biologia" }], cronograma: {}, permissoesAluno: PERM }),
      setDoc(doc(d, "planos/bloq"), { alunoId: "bloq", permissoesAluno: PERM }),
      setDoc(doc(d, "questoes/q-antiga"), { ...questao("ana"), criadoEm: antigo }),
      setDoc(doc(d, "questoes/q-carlos"), { ...questao("carlos"), criadoEm: Timestamp.now() }),
      setDoc(doc(d, "materias/biologia"), { nome: "Biologia", areaId: "naturais" }),
      setDoc(doc(d, "materiais/pub"), { titulo: "Pub", publicado: true }),
      setDoc(doc(d, "materiais/rascunho"), { titulo: "Rascunho", publicado: false }),
      setDoc(doc(d, "notificacoes/n1"), { alunoId: "ana", titulo: "Oi", mensagem: "m", autorId: "mod", lidaEm: null }),
      setDoc(doc(d, "sessoesEstudo/s-antiga"), { alunoId: "ana", minutos: 30, criadoPor: "ana", criadoEm: antigo }),
    ]);
  });
});

describe("perfis e papéis", () => {
  it("cada um lê o próprio perfil; aluno não lê o de outro nem muda o papel", async () => {
    await assertSucceeds(getDoc(doc(db("ana"), "usuarios/ana")));
    await assertFails(getDoc(doc(db("ana"), "usuarios/carlos")));
    await assertFails(updateDoc(doc(db("ana"), "usuarios/ana"), { role: "moderador" }));
    await assertSucceeds(updateDoc(doc(db("ana"), "usuarios/ana"), { ultimoAcessoEm: serverTimestamp() }));
    await assertSucceeds(getDocs(query(collection(db("mod"), "usuarios"), where("role", "==", "aluno"))));
    await assertFails(getDocs(query(collection(db("ana"), "usuarios"), where("role", "==", "aluno"))));
    await assertFails(getDoc(doc(db(null), "usuarios/ana")));
  });

  it("acesso bloqueado não lê nem o próprio plano", async () => {
    await assertFails(getDoc(doc(db("bloq"), "planos/bloq")));
  });

  it("instalação: não dá para criar um segundo moderador por fora", async () => {
    const i = db("intruso");
    const b = writeBatch(i);
    b.set(doc(i, "usuarios/intruso"), { role: "moderador", nome: "X" });
    b.set(doc(i, "config/instalacao"), { moderadorId: "intruso" });
    await assertFails(b.commit());
    await assertFails(setDoc(doc(i, "usuarios/intruso"), { role: "moderador", nome: "X" }));
  });
});

describe("dados de outro aluno e conteúdo do moderador", () => {
  it("aluno não lê plano nem questões de outro", async () => {
    await assertSucceeds(getDoc(doc(db("ana"), "planos/ana")));
    await assertFails(getDoc(doc(db("carlos"), "planos/ana")));
    await assertSucceeds(getDocs(query(collection(db("ana"), "questoes"), where("alunoId", "==", "ana"))));
    await assertFails(getDocs(query(collection(db("ana"), "questoes"), where("alunoId", "==", "carlos"))));
    await assertFails(getDocs(collection(db("ana"), "questoes")));
  });

  it("aluno não altera plano geral nem estrutura; moderador sim", async () => {
    await assertFails(setDoc(doc(db("ana"), "modelosPlano/m1"), { nome: "x" }));
    await assertFails(setDoc(doc(db("ana"), "materias/biologia"), { nome: "Hack" }));
    await assertSucceeds(setDoc(doc(db("mod"), "modelosPlano/m1"), { nome: "x" }));
    await assertSucceeds(setDoc(doc(db("mod"), "materias/biologia"), { nome: "Biologia", areaId: "naturais" }));
  });

  it("materiais: aluno lê só os publicados e não publica", async () => {
    await assertSucceeds(getDocs(query(collection(db("ana"), "materiais"), where("publicado", "==", true))));
    await assertFails(getDoc(doc(db("ana"), "materiais/rascunho")));
    await assertFails(setDoc(doc(db("ana"), "materiais/x"), { titulo: "x", publicado: true }));
  });
});

describe("questões: histórico protegido", () => {
  it("cria registro válido do próprio aluno; recusa contagem inválida e autoria falsa", async () => {
    await assertSucceeds(setDoc(doc(db("ana"), "questoes/q1"), questao("ana")));
    await assertFails(setDoc(doc(db("ana"), "questoes/q2"), questao("ana", { acertos: 8, erros: 5 })));
    await assertFails(setDoc(doc(db("ana"), "questoes/q3"), questao("ana", { acertos: -1 })));
    await assertFails(setDoc(doc(db("ana"), "questoes/q4"), questao("carlos", { criadoPor: "ana" })));
    await assertFails(setDoc(doc(db("ana"), "questoes/q5"), questao("ana", { data: "2099-01-01" })));
  });

  it("correção do aluno só em 24 h e sempre com log no mesmo lote", async () => {
    const a = db("ana");
    await assertSucceeds(setDoc(doc(a, "questoes/q1"), questao("ana")));
    await assertFails(updateDoc(doc(a, "questoes/q1"), { acertos: 7 })); // sem log
    const b = writeBatch(a);
    b.set(doc(a, "logs/l1"), log("ana", "ana"));
    b.update(doc(a, "questoes/q1"), { acertos: 7, ultimoLogId: "l1" });
    await assertSucceeds(b.commit());

    const velho = writeBatch(a);
    velho.set(doc(a, "logs/l2"), log("ana", "ana"));
    velho.update(doc(a, "questoes/q-antiga"), { acertos: 7, ultimoLogId: "l2" });
    await assertFails(velho.commit()); // passou das 24 h

    const m = db("mod");
    const mod = writeBatch(m);
    mod.set(doc(m, "logs/l3"), log("mod", "ana"));
    mod.update(doc(m, "questoes/q-antiga"), { acertos: 7, ultimoLogId: "l3" });
    await assertSucceeds(mod.commit());
  });

  it("exclusão exige logs/rm_<id>; aluno não apaga registro antigo", async () => {
    const a = db("ana");
    await assertSucceeds(setDoc(doc(a, "questoes/q1"), questao("ana")));
    await assertFails(deleteDoc(doc(a, "questoes/q1")));
    const b = writeBatch(a);
    b.delete(doc(a, "questoes/q1"));
    b.set(doc(a, "logs/rm_q1"), log("ana", "ana"));
    await assertSucceeds(b.commit());
    const c = writeBatch(a);
    c.delete(doc(a, "questoes/q-antiga"));
    c.set(doc(a, "logs/rm_q-antiga"), log("ana", "ana"));
    await assertFails(c.commit());
  });

  it("logs não se editam nem se apagam, e o aluno não registra em nome de outro", async () => {
    await assertSucceeds(setDoc(doc(db("ana"), "logs/l1"), log("ana", "ana")));
    await assertFails(updateDoc(doc(db("ana"), "logs/l1"), { descricao: "outra" }));
    await assertFails(deleteDoc(doc(db("mod"), "logs/l1")));
    await assertFails(setDoc(doc(db("ana"), "logs/l2"), log("ana", "carlos")));
    await assertFails(setDoc(doc(db("ana"), "logs/l3"), log("carlos", "ana")));
  });
});

describe("plano e progresso", () => {
  it("aluno muda só o que foi liberado, com log", async () => {
    const a = db("ana");
    const ok = writeBatch(a);
    ok.set(doc(a, "logs/p1"), log("ana", "ana"));
    ok.update(doc(a, "planos/ana"), { ritmo: 1.25, cronograma: { x: { fim: "2027-01-01" } }, ultimoLogId: "p1" });
    await assertSucceeds(ok.commit());

    await assertFails(updateDoc(doc(a, "planos/ana"), { ritmo: 1.5 })); // sem log
    // a ordem dos tópicos é dela; as matérias (incidência, visibilidade) não
    const ordem = writeBatch(a);
    ordem.set(doc(a, "logs/p5"), log("ana", "ana"));
    ordem.update(doc(a, "planos/ana"), { ordemTopicos: { biologia: ["bi2", "bi1"] }, cronograma: { y: { fim: "2027-02-01" } }, ultimoLogId: "p5" });
    await assertSucceeds(ordem.commit());
    const materias = writeBatch(a);
    materias.set(doc(a, "logs/p6"), log("ana", "ana"));
    materias.update(doc(a, "planos/ana"), { materias: [{ materiaId: "biologia", ativa: true, minutosSemanais: 900 }], ultimoLogId: "p6" });
    await assertFails(materias.commit());
    const perm = writeBatch(a);
    perm.set(doc(a, "logs/p2"), log("ana", "ana"));
    perm.update(doc(a, "planos/ana"), { permissoesAluno: { ...PERM, ritmo: true }, dataAlvo: "2030-01-01", ultimoLogId: "p2" });
    await assertFails(perm.commit());

    await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), "planos/ana"), { permissoesAluno: { ...PERM, ritmo: false, recalcular: false } }));
    const r = writeBatch(a);
    r.set(doc(a, "logs/p3"), log("ana", "ana"));
    r.update(doc(a, "planos/ana"), { ritmo: 2, ultimoLogId: "p3" });
    await assertFails(r.commit());
    const cron = writeBatch(a);
    cron.set(doc(a, "logs/p4"), log("ana", "ana"));
    cron.update(doc(a, "planos/ana"), { cronograma: {}, ultimoLogId: "p4" });
    await assertFails(cron.commit()); // apagar atrasos sem permissão de recalcular
  });

  it("progresso só muda junto com a sessão de estudo", async () => {
    const a = db("ana");
    await assertFails(setDoc(doc(a, "progresso/ana"), { alunoId: "ana", itens: { x: { minutos: increment(600) } } }, { merge: true }));
    const b = writeBatch(a);
    b.set(doc(a, "sessoesEstudo/s1"), { alunoId: "ana", minutos: 30, criadoPor: "ana", criadoEm: serverTimestamp() });
    b.set(doc(a, "progresso/ana"), { alunoId: "ana", ultimaOperacao: { tipo: "sessao", id: "s1" }, itens: { x: { minutos: increment(30) } } }, { merge: true });
    await assertSucceeds(b.commit());
    const reuso = writeBatch(a);
    reuso.set(doc(a, "progresso/ana"), { alunoId: "ana", ultimaOperacao: { tipo: "sessao", id: "s1" }, itens: { x: { minutos: increment(30) } } }, { merge: true });
    await assertFails(reuso.commit()); // sessão já existia
  });

  it("sessão de estudo: aluno apaga só nas primeiras 24 h e com log", async () => {
    const a = db("ana");
    const ok = writeBatch(a);
    ok.set(doc(a, "sessoesEstudo/s2"), { alunoId: "ana", minutos: 45, criadoPor: "ana", criadoEm: serverTimestamp() });
    await assertSucceeds(ok.commit());
    await assertFails(deleteDoc(doc(a, "sessoesEstudo/s2")));
    const d = writeBatch(a);
    d.delete(doc(a, "sessoesEstudo/s2"));
    d.set(doc(a, "logs/rm_s2"), log("ana", "ana"));
    await assertSucceeds(d.commit());
    const v = writeBatch(a);
    v.delete(doc(a, "sessoesEstudo/s-antiga"));
    v.set(doc(a, "logs/rm_s-antiga"), log("ana", "ana"));
    await assertFails(v.commit());
    await assertFails(updateDoc(doc(a, "sessoesEstudo/s-antiga"), { minutos: 999 }));
  });
});

describe("áreas de materiais e provas", () => {
  it("aluno lê áreas e provas publicadas; só o moderador escreve", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const d = ctx.firestore();
      await Promise.all([
        setDoc(doc(d, "provas/pub"), { titulo: "ENEM 2018 · Dia 2", publicado: true }),
        setDoc(doc(d, "provas/rascunho"), { titulo: "Rascunho", publicado: false }),
        setDoc(doc(d, "areasMateriais/fis"), { nome: "Física", rotulo: "Listas de" }),
      ]);
    });
    await assertSucceeds(getDoc(doc(db("ana"), "provas/pub")));
    await assertFails(getDoc(doc(db("ana"), "provas/rascunho")));
    await assertSucceeds(getDocs(query(collection(db("ana"), "provas"), where("publicado", "==", true))));
    await assertSucceeds(getDoc(doc(db("ana"), "areasMateriais/fis")));
    await assertFails(setDoc(doc(db("ana"), "areasMateriais/nova"), { nome: "Minha" }));
    await assertFails(setDoc(doc(db("ana"), "provas/minha"), { titulo: "Minha", publicado: true }));
    await assertSucceeds(setDoc(doc(db("mod"), "provas/nova"), { titulo: "Nova", publicado: false }));
    await assertFails(getDoc(doc(db("bloq"), "areasMateriais/fis")));
  });
});

describe("subtópicos vistos", () => {
  it("o aluno marca os próprios (se pode concluir); não mexe nos de outro", async () => {
    await assertSucceeds(setDoc(doc(db("ana"), "vistos/ana"), { alunoId: "ana", subtopicos: { s1: true } }));
    await assertFails(setDoc(doc(db("ana"), "vistos/carlos"), { alunoId: "carlos", subtopicos: { s1: true } }));
    await assertFails(setDoc(doc(db("ana"), "vistos/ana"), { alunoId: "carlos", subtopicos: {} }));
    await assertFails(getDoc(doc(db("carlos"), "vistos/ana")));
    await assertSucceeds(getDoc(doc(db("mod"), "vistos/ana")));
  });
});

describe("notificações", () => {
  it("só o destinatário marca como lida, uma vez, sem mexer no resto", async () => {
    await assertFails(setDoc(doc(db("ana"), "notificacoes/n2"), { alunoId: "ana", titulo: "x", autorId: "ana", lidaEm: null }));
    await assertFails(updateDoc(doc(db("carlos"), "notificacoes/n1"), { lidaEm: serverTimestamp() }));
    await assertFails(updateDoc(doc(db("mod"), "notificacoes/n1"), { lidaEm: serverTimestamp() }));
    await assertFails(updateDoc(doc(db("ana"), "notificacoes/n1"), { titulo: "outro", lidaEm: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(db("ana"), "notificacoes/n1"), { lidaEm: serverTimestamp() }));
    await assertFails(updateDoc(doc(db("ana"), "notificacoes/n1"), { lidaEm: serverTimestamp() }));
  });
});

describe("arquivos (Storage)", () => {
  const pdf = new TextEncoder().encode("%PDF-1.4 teste");
  it("PDF do simulado: no próprio caminho, só PDF", async () => {
    await assertSucceeds(uploadBytes(ref(st("ana"), "simulados/ana/s1.pdf"), pdf, { contentType: "application/pdf" }));
    await assertFails(uploadBytes(ref(st("ana"), "simulados/carlos/s1.pdf"), pdf, { contentType: "application/pdf" }));
    await assertFails(uploadBytes(ref(st("ana"), "simulados/ana/foto.png"), pdf, { contentType: "image/png" }));
  });
  it("redação: moderador anexa foto ou PDF na pasta do aluno; o aluno só lê a própria", async () => {
    await assertSucceeds(uploadBytes(ref(st("mod"), "redacoes/ana/anexo-1.pdf"), pdf, { contentType: "application/pdf" }));
    await assertSucceeds(uploadBytes(ref(st("mod"), "redacoes/ana/foto.jpg"), pdf, { contentType: "image/jpeg" }));
    await assertFails(uploadBytes(ref(st("mod"), "redacoes/ana/nota.txt"), pdf, { contentType: "text/plain" }));
    await assertFails(uploadBytes(ref(st("ana"), "redacoes/ana/anexo-2.pdf"), pdf, { contentType: "application/pdf" }));
  });
  it("provas: PDF e capa só o moderador envia; qualquer logado lê", async () => {
    await assertFails(uploadBytes(ref(st("ana"), "provas/p1/prova.pdf"), pdf, { contentType: "application/pdf" }));
    await assertSucceeds(uploadBytes(ref(st("mod"), "provas/p1/prova.pdf"), pdf, { contentType: "application/pdf" }));
    await assertSucceeds(uploadBytes(ref(st("mod"), "provas/p1/capa.jpg"), pdf, { contentType: "image/jpeg" }));
    await assertFails(uploadBytes(ref(st("mod"), "provas/p1/nota.txt"), pdf, { contentType: "text/plain" }));
  });
  it("materiais: só o moderador envia", async () => {
    await assertFails(uploadBytes(ref(st("ana"), "materiais/m1/a.pdf"), pdf, { contentType: "application/pdf" }));
    await assertSucceeds(uploadBytes(ref(st("mod"), "materiais/m1/a.pdf"), pdf, { contentType: "application/pdf" }));
  });
});
