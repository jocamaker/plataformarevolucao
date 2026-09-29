import { beforeEach, describe, expect, it } from "vitest";
import { criarRepositorioLocal } from "../data/local.js";
import { semearDemonstracao, SENHA_DEMO } from "../data/semente.js";
import { ErroPermissao } from "../core/permissoes.js";
import { DIAS } from "../core/nucleo.js";
import { itensDoPlano, estadoItem, pesoDe, duracaoRevisao } from "../core/plano.js";
import { permissaoDaOperacao } from "./planos.js";
import { chaveDoDia } from "../core/semana.js";
import { criarServicos } from "./index.js";
import { ErroValidacao } from "./base.js";
import { painelDoAluno, metricasAluno } from "./desempenho.js";

// segunda-feira, 28/09/2026, 10h (horário local)
let agora;
const relogio = () => agora;
const esperar = () => new Promise((r) => setTimeout(r, 0));

function memoria() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

async function montar() {
  const repo = criarRepositorioLocal({ armazenamento: memoria(), arquivos: { salvar: async () => {} }, relogio });
  await semearDemonstracao(repo, { agora });
  const s = criarServicos(repo, { relogio });
  let usuario;
  s.auth.observar((u) => { usuario = u; });
  const entrar = async (email) => {
    await s.auth.entrar(email, SENHA_DEMO);
    await esperar();
    return usuario;
  };
  const uidDe = async (email) => (await repo.listar("usuarios", [["email", "==", email]]))[0].id;
  return { repo, s, entrar, uidDe };
}

const pdf = (nome = "prova.pdf", conteudo = "%PDF-1.4\n%fim") => new File([conteudo], nome, { type: "application/pdf" });

let t;
beforeEach(async () => {
  agora = new Date(2026, 8, 28, 10, 0);
  t = await montar();
});

describe("instalação de demonstração", () => {
  it("cria estrutura, planos gerais e planos individuais, sem histórico inventado", async () => {
    const { repo, uidDe } = t;
    const ana = await uidDe("aluno@curso.com");
    expect((await repo.listar("materias")).map((m) => m.nome)).toEqual(["Biologia", "Física", "Química", "Matemática", "Linguagens", "Obras literárias", "Filosofia", "Sociologia", "Geografia", "História"]);
    expect((await repo.listar("modelosPlano")).length).toBe(7);
    const plano = await repo.obter("planos", ana);
    expect(plano.modeloId).toBe("modelo-fuvest");
    expect(Object.keys(plano.cronograma).length).toBeGreaterThan(0);
    for (const c of ["questoes", "simulados", "sessoesEstudo", "devolutivas", "notificacoes", "playlists"]) {
      expect(await repo.listar(c)).toEqual([]);
    }
  });

  it("entra com e-mail e senha e carrega o perfil com o papel", async () => {
    const u = await t.entrar("aluno@curso.com");
    expect(u.role).toBe("aluno");
    expect(u.nome).toBe("Ana Beatriz");
    await expect(t.s.auth.entrar("aluno@curso.com", "errada")).rejects.toThrow(/não conferem/);
  });
});

describe("permissões reais nos serviços", () => {
  it("aluno não vê outro aluno nem o painel do moderador", async () => {
    const carlos = await t.uidDe("carlos@curso.com");
    await t.entrar("aluno@curso.com");
    expect(() => t.s.questoes.observar(carlos, () => {})).toThrow(ErroPermissao);
    expect(() => t.s.alunos.observarTodos(() => {})).toThrow(ErroPermissao);
    expect(() => t.s.planos.observarPlano(carlos, () => {})).toThrow(ErroPermissao);
    await expect(t.s.questoes.registrar(carlos, { data: "2026-09-28", materiaId: "biologia", topicoId: "bi1", total: 10, acertos: 5, erros: 5 })).rejects.toThrow(ErroPermissao);
  });

  it("aluno não altera plano geral nem o que só o moderador define", async () => {
    const ana = await t.uidDe("aluno@curso.com");
    await t.entrar("aluno@curso.com");
    await expect(t.s.planos.salvarModelo({ id: "modelo-fuvest", nome: "Hack" })).rejects.toThrow(ErroPermissao);
    await expect(t.s.planos.alterar(ana, { tipo: "definirMateria", materiaId: "biologia", campos: { peso: 3 } })).rejects.toThrow(ErroPermissao);
    await expect(t.s.planos.alterar(ana, { tipo: "definirMateria", materiaId: "biologia", campos: { ativa: false } })).rejects.toThrow(ErroPermissao);
    await expect(t.s.planos.alterar(ana, { tipo: "definirPlano", campos: { limitesTempo: { minDia: 0, maxDia: 960 } } })).rejects.toThrow(ErroPermissao);
    await expect(t.s.planos.aplicarModelo(ana, "modelo-enem", { substituir: true })).rejects.toThrow(ErroPermissao);
  });

  it("o que o aluno pode no plano depende das permissões que o moderador deu", async () => {
    const ana = await t.uidDe("aluno@curso.com");
    await t.entrar("aluno@curso.com");
    await t.s.planos.alterar(ana, { tipo: "definirPlano", campos: { ritmo: 1.25 } });
    expect((await t.repo.obter("planos", ana)).ritmo).toBe(1.25);

    await t.entrar("moderador@curso.com");
    const plano = await t.repo.obter("planos", ana);
    await t.s.planos.alterar(ana, { tipo: "definirPlano", campos: { permissoesAluno: { ...plano.permissoesAluno, ritmo: false, recalcular: false } } });

    await t.entrar("aluno@curso.com");
    await expect(t.s.planos.alterar(ana, { tipo: "definirPlano", campos: { ritmo: 1 } })).rejects.toThrow(ErroPermissao);
    await expect(t.s.planos.recalcular(ana)).rejects.toThrow(ErroPermissao);
  });
});

describe("questões", () => {
  it("valida acertos + erros ≤ total, inteiros não negativos e data não futura", async () => {
    const ana = await t.uidDe("aluno@curso.com");
    await t.entrar("aluno@curso.com");
    const base = { data: "2026-09-28", materiaId: "biologia", topicoId: "bi1", total: 10, acertos: 6, erros: 3 };
    await expect(t.s.questoes.registrar(ana, { ...base, erros: 5 })).rejects.toThrow(ErroValidacao);
    await expect(t.s.questoes.registrar(ana, { ...base, acertos: -1 })).rejects.toThrow(ErroValidacao);
    await expect(t.s.questoes.registrar(ana, { ...base, data: "2026-09-29" })).rejects.toThrow(ErroValidacao);
    await expect(t.s.questoes.registrar(ana, { ...base, topicoId: "q1" })).rejects.toThrow(ErroValidacao); // tópico de outra matéria
    const id = await t.s.questoes.registrar(ana, base);
    const r = await t.repo.obter("questoes", id);
    expect(r).toMatchObject({ alunoId: ana, total: 10, acertos: 6, erros: 3, subtopicoId: null });
  });

  it("aluno corrige só nas primeiras 24 h; toda correção vai para o histórico", async () => {
    const ana = await t.uidDe("aluno@curso.com");
    await t.entrar("aluno@curso.com");
    const id = await t.s.questoes.registrar(ana, { data: "2026-09-28", materiaId: "biologia", topicoId: "bi1", total: 10, acertos: 6, erros: 3 });
    await t.s.questoes.corrigir(id, { acertos: 7 });
    let logs = await t.repo.listar("logs", [["entidadeId", "==", id]]);
    expect(logs[0]).toMatchObject({ papel: "aluno", antes: { acertos: 6 }, depois: { acertos: 7 } });

    agora = new Date(2026, 8, 29, 11, 0); // 25 h depois
    await expect(t.s.questoes.corrigir(id, { acertos: 8 })).rejects.toThrow(ErroPermissao);
    await expect(t.s.questoes.remover(id)).rejects.toThrow(ErroPermissao);

    await t.entrar("moderador@curso.com");
    await expect(t.s.questoes.corrigir(id, { acertos: 8 })).rejects.toThrow(ErroValidacao); // 8 + 3 > 10
    await t.s.questoes.corrigir(id, { acertos: 8, erros: 2 }, { motivo: "conferido com a folha" });
    logs = await t.repo.listar("logs", [["entidadeId", "==", id]]);
    expect(logs.find((l) => l.papel === "moderador")).toMatchObject({ motivo: "conferido com a folha", antes: { acertos: 7, erros: 3 }, depois: { acertos: 8, erros: 2 } });
  });
});

describe("simulados e materiais (PDF no armazenamento, metadados no banco)", () => {
  it("simulado com PDF opcional; arquivo que não é PDF é recusado", async () => {
    const ana = await t.uidDe("aluno@curso.com");
    await t.entrar("aluno@curso.com");
    const dados = { vestibularId: "fuvest", nome: "1ª fase 2025", ano: 2025, data: "2026-09-27", total: 90, acertos: 60, erros: 30 };
    await expect(t.s.simulados.registrar(ana, dados, { arquivo: new File(["oi"], "foto.png", { type: "image/png" }) })).rejects.toThrow(ErroValidacao);
    await expect(t.s.simulados.registrar(ana, dados, { arquivo: pdf("falso.pdf", "não é pdf") })).rejects.toThrow(ErroValidacao);
    const id = await t.s.simulados.registrar(ana, dados, { arquivo: pdf() });
    const doc = await t.repo.obter("simulados", id);
    expect(doc.arquivo.ref).toMatch(/^mem:simulados\//);
    expect(JSON.stringify(doc)).not.toContain("%PDF");
    const semPdf = await t.s.simulados.registrar(ana, { ...dados, nome: "sem pdf" });
    expect((await t.repo.obter("simulados", semPdf)).arquivo).toBeNull();
  });

  it("material: só o moderador publica; aluno vê só os publicados", async () => {
    await t.entrar("aluno@curso.com");
    await expect(t.s.materiais.salvar({ titulo: "x", tipo: "resumo" }, { arquivo: pdf() })).rejects.toThrow(ErroPermissao);

    await t.entrar("moderador@curso.com");
    const estados = [];
    await expect(t.s.materiais.salvar({ titulo: "Sem arquivo", tipo: "resumo" })).rejects.toThrow(ErroValidacao);
    const id = await t.s.materiais.salvar({ titulo: "Citologia", tipo: "resumo", materiaId: "biologia", topicoId: "bi1", tags: "célula, membrana" }, { arquivo: pdf("citologia.pdf"), aoEstado: (e) => estados.push(e) });
    await t.s.materiais.salvar({ titulo: "Rascunho", tipo: "lista", publicado: false }, { arquivo: pdf() });
    expect(estados).toEqual(["validando", "enviando", "enviando", "enviando", "salvando", "pronto"]);
    expect((await t.repo.obter("materiais", id)).tags).toEqual(["célula", "membrana"]);

    await t.entrar("aluno@curso.com");
    let vistos;
    t.s.materiais.observar((l) => { vistos = l; });
    await esperar();
    expect(vistos.map((m) => m.titulo)).toEqual(["Citologia"]);
  });
});

describe("notificações", () => {
  it("envio para um grupo chega só a quem é do grupo; lida só pelo destinatário", async () => {
    const ana = await t.uidDe("aluno@curso.com");
    const carlos = await t.uidDe("carlos@curso.com");
    await t.entrar("moderador@curso.com");
    const r = await t.s.notificacoes.enviar({ titulo: "Simulado", mensagem: "Sábado, 8h.", prioridade: "alta", destino: { tipo: "grupo", vestibularId: "fuvest" } });
    expect(r.destinatarios).toBe(1);
    const [n] = await t.repo.listar("notificacoes");
    expect(n).toMatchObject({ alunoId: ana, lidaEm: null, prioridade: "alta" });
    await expect(t.s.notificacoes.marcarLida(n.id)).rejects.toThrow(ErroPermissao);

    await t.entrar("carlos@curso.com");
    expect(() => t.s.notificacoes.observarDoAluno(ana, () => {})).toThrow(ErroPermissao);
    await expect(t.s.notificacoes.marcarLida(n.id)).rejects.toThrow(ErroPermissao);
    expect(carlos).toBeTruthy();

    await t.entrar("aluno@curso.com");
    expect(await t.s.notificacoes.marcarLida(n.id)).toBe(true);
    expect((await t.repo.obter("notificacoes", n.id)).lidaEm).toBeTruthy();
    expect(await t.s.notificacoes.marcarLida(n.id)).toBe(false); // uma vez só
  });
});

describe("semana, sessões e progresso", () => {
  it("marcar meta cria sessão e soma progresso; desfazer volta e registra no histórico", async () => {
    const ana = await t.uidDe("aluno@curso.com");
    await t.entrar("aluno@curso.com");
    const est = await t.s.estudo.garantirSemana(ana);
    expect(est.chave).toBe("2026-09-28");
    const meta = est.metas[chaveDoDia("2026-09-28")].find((m) => m.tipo === "ciclo");
    expect(meta).toBeTruthy();

    const r = await t.s.estudo.alternarMeta(ana, meta.id);
    expect(r.feita).toBe(true);
    const sessao = await t.repo.obter("sessoesEstudo", r.sessaoId);
    expect(sessao).toMatchObject({ alunoId: ana, minutos: meta.minutos, materiaId: meta.materiaId, data: "2026-09-28", origem: "meta" });
    const prog = (await t.repo.obter("progresso", ana)).itens;
    const somado = sessao.partes.reduce((s, p) => s + prog[p.itemId].minutos, 0);
    expect(somado).toBe(meta.minutos);

    await t.s.estudo.alternarMeta(ana, meta.id);
    expect(await t.repo.obter("sessoesEstudo", r.sessaoId)).toBeNull();
    const prog2 = (await t.repo.obter("progresso", ana)).itens;
    expect(sessao.partes.every((p) => prog2[p.itemId].minutos === 0)).toBe(true);
    const logs = await t.repo.listar("logs", [["alunoId", "==", ana], ["tipo", "==", "desfazerMeta"]]);
    expect(logs).toHaveLength(1);
  });

  it("depois de 24 h o aluno não desfaz a meta de ontem", async () => {
    const ana = await t.uidDe("aluno@curso.com");
    await t.entrar("aluno@curso.com");
    const est = await t.s.estudo.garantirSemana(ana);
    const meta = est.metas.seg.find((m) => m.tipo === "ciclo");
    await t.s.estudo.alternarMeta(ana, meta.id);
    agora = new Date(2026, 8, 29, 12, 0);
    await expect(t.s.estudo.alternarMeta(ana, meta.id)).rejects.toThrow(ErroPermissao);
  });

  it("concluir conteúdo agenda revisões (7/15/30 dias); reabrir tira só as que não aconteceram", async () => {
    const ana = await t.uidDe("aluno@curso.com");
    await t.entrar("aluno@curso.com");
    const plano = await t.repo.obter("planos", ana);
    const ind = await t.s.ctx.indice();
    const item = itensDoPlano(plano, ind)[0];
    await t.s.planos.concluirItem(ana, item.itemId);
    const [rev] = await t.repo.listar("revisoes", [["alunoId", "==", ana]]);
    expect(rev.sessoes.map((s) => s.dia)).toEqual(["2026-10-05", "2026-10-13", "2026-10-28"]);
    expect(rev.sessoes.every((s) => s.status === "agendada")).toBe(true);

    await t.s.planos.reabrirItem(ana, item.itemId);
    expect(await t.repo.listar("revisoes", [["alunoId", "==", ana]])).toEqual([]);
    const prog = (await t.repo.obter("progresso", ana)).itens;
    expect(estadoItem(item, prog).concluido).toBe(false);
  });

  it("revisão agendada para esta semana entra como meta no dia certo", async () => {
    const ana = await t.uidDe("aluno@curso.com");
    await t.entrar("aluno@curso.com");
    await t.s.estudo.garantirSemana(ana);
    const plano = await t.repo.obter("planos", ana);
    await t.entrar("moderador@curso.com");
    await t.s.planos.alterar(ana, { tipo: "definirPlano", campos: { revisao: { intervalos: [2] } } });
    const planoNovo = await t.repo.obter("planos", ana);
    const item = itensDoPlano(planoNovo, await t.s.ctx.indice())[1];
    await t.s.planos.concluirItem(ana, item.itemId);
    const semana = await t.repo.obter("semanas", ana);
    const rev = semana.metas.qua.find((m) => m.tipo === "revisao");
    const peso = pesoDe(planoNovo.materias.find((m) => m.materiaId === item.materiaId));
    expect(rev).toMatchObject({ dia: "2026-09-30", minutos: duracaoRevisao(peso), itemId: item.itemId });
    expect(semana.metas.qua[0]).toBe(rev); // revisões vêm primeiro no dia
    expect(plano).toBeTruthy();
  });

  it("virada de semana: pendências viram atrasadas e a semana fechada vai para o histórico", async () => {
    const ana = await t.uidDe("aluno@curso.com");
    await t.entrar("aluno@curso.com");
    const est = await t.s.estudo.garantirSemana(ana);
    const meta = est.metas.seg.find((m) => m.tipo === "ciclo");
    await t.s.estudo.alternarMeta(ana, meta.id);
    const total = Object.values(est.metas).flat().length;

    agora = new Date(2026, 9, 6, 9, 0); // terça da semana seguinte
    const nova = await t.s.estudo.garantirSemana(ana);
    expect(nova.chave).toBe("2026-10-05");
    expect(nova.pendentes.length).toBe(Object.values(est.metas).flat().filter((m) => m.tipo === "ciclo").length - 1);
    const resumo = await t.repo.obter("resumosSemana", `${ana}_2026-09-28`);
    expect(resumo).toMatchObject({ metas: total, cumpridas: 1, naoCumpridas: total - 1 });
  });
});

describe("plano individual: alterações, histórico e recálculo", () => {
  it("alteração do moderador registra antes/depois e preserva o que já foi estudado", async () => {
    const ana = await t.uidDe("aluno@curso.com");
    await t.entrar("aluno@curso.com");
    const est = await t.s.estudo.garantirSemana(ana);
    const meta = est.metas.seg.find((m) => m.tipo === "ciclo");
    const { sessaoId } = await t.s.estudo.alternarMeta(ana, meta.id);
    const progAntes = (await t.repo.obter("progresso", ana)).itens;

    await t.entrar("moderador@curso.com");
    const atual = pesoDe((await t.repo.obter("planos", ana)).materias.find((m) => m.materiaId === "biologia"));
    const novo = atual === 3 ? 1 : 3;
    const previa = await t.s.planos.previa(ana, { tipo: "definirMateria", materiaId: "biologia", campos: { peso: novo } });
    expect(previa.alteracoes[0]).toMatchObject({ antes: expect.stringMatching(/^\d · /), depois: novo === 3 ? "3 · Alta" : "1 · Baixa" });
    expect(previa.conteudosRemarcados).toBeGreaterThan(0);
    const r = await t.s.planos.alterar(ana, { tipo: "definirMateria", materiaId: "biologia", campos: { peso: novo } }, { motivo: "reforço" });
    expect(r.mudou).toBe(true);

    expect(await t.repo.obter("sessoesEstudo", sessaoId)).toBeTruthy();
    expect((await t.repo.obter("progresso", ana)).itens).toEqual(progAntes);
    const semana = await t.repo.obter("semanas", ana);
    expect(semana.metas.seg.find((m) => m.id === meta.id)?.done).toBe(true);
    const [log] = await t.repo.listar("logs", [["alunoId", "==", ana], ["tipo", "==", "definirMateria"]]);
    expect(log).toMatchObject({ autorNome: "Prof. Moderador", papel: "moderador", depois: novo === 3 ? "3 · Alta" : "1 · Baixa", motivo: "reforço" });
  });

  it("não substitui o plano existente sem confirmação; com confirmação guarda o anterior", async () => {
    const ana = await t.uidDe("aluno@curso.com");
    await t.entrar("moderador@curso.com");
    await expect(t.s.planos.aplicarModelo(ana, "modelo-enem")).rejects.toMatchObject({ codigo: "plano-existente" });
    await t.s.planos.aplicarModelo(ana, "modelo-enem", { substituir: true });
    expect((await t.repo.obter("planos", ana)).modeloId).toBe("modelo-enem");
    const anteriores = await t.repo.listar("planosAnteriores", [["alunoId", "==", ana]]);
    expect(anteriores[0].plano.modeloId).toBe("modelo-fuvest");
  });

  it("recalcular com data-alvo mantém o cronograma dos concluídos", async () => {
    const ana = await t.uidDe("aluno@curso.com");
    await t.entrar("moderador@curso.com");
    const ind = await t.s.ctx.indice();
    const item = itensDoPlano(await t.repo.obter("planos", ana), ind)[0];
    await t.s.planos.concluirItem(ana, item.itemId);
    const antes = (await t.repo.obter("planos", ana)).cronograma[item.itemId];
    await t.s.planos.alterar(ana, { tipo: "definirPlano", campos: { dataAlvo: "2027-06-30" } });
    const depois = await t.repo.obter("planos", ana);
    expect(depois.cronograma[item.itemId]).toEqual(antes);
    expect(depois.dataAlvo).toBe("2027-06-30");
  });
});

describe("desempenho calculado dos registros", () => {
  it("painel e métricas saem dos registros reais", async () => {
    const ana = await t.uidDe("aluno@curso.com");
    await t.entrar("aluno@curso.com");
    await t.s.questoes.registrar(ana, { data: "2026-09-28", materiaId: "biologia", topicoId: "bi1", total: 20, acertos: 15, erros: 5 });
    await t.s.questoes.registrar(ana, { data: "2026-09-27", materiaId: "quimica", topicoId: "qu1", total: 10, acertos: 4, erros: 5 });
    await t.s.simulados.registrar(ana, { vestibularId: "fuvest", nome: "1ª fase", data: "2026-09-26", total: 90, acertos: 54, erros: 36 });
    const [questoes, simulados, plano, progDoc] = await Promise.all([
      t.repo.listar("questoes"), t.repo.listar("simulados"), t.repo.obter("planos", ana), t.repo.obter("progresso", ana),
    ]);
    const ind = await t.s.ctx.indice();
    const p = painelDoAluno({ questoes, simulados, sessoes: [], plano, progresso: progDoc.itens, ind, hojeIso: "2026-09-28" });
    expect(p.questoes).toMatchObject({ total: 30, acertos: 19, erros: 10, emBranco: 1, pct: 63.3 });
    expect(p.simulados.porVestibular[0]).toMatchObject({ vestibularId: "fuvest", mediaPct: 60 });
    expect(p.ultimos30.diasEstudados).toBe(3);
    expect(p.porMateria.map((m) => m.id)).toEqual(["biologia", "quimica"]);
    const m = metricasAluno({ aluno: { id: ana }, plano, progresso: progDoc.itens, questoes, simulados, sessoes: [], ind, hojeIso: "2026-09-28" });
    expect(m).toMatchObject({ questoes30: 30, pct30: 63.3, diasEstudados30: 3, diasSemEstudar: 0, situacao: "em_dia" });
  });
});

describe("estrutura acadêmica", () => {
  it("ids gerados; arquivar tira da lista mas mantém o nome para o histórico", async () => {
    await t.entrar("moderador@curso.com");
    const id = await t.s.estrutura.salvar("topico", { nome: "Bioquímica", materiaId: "biologia", cargaMin: 120 });
    expect(id).toMatch(/^[A-Za-z0-9]{20}$/);
    await expect(t.s.estrutura.salvar("topico", { nome: "Sem matéria" })).rejects.toThrow(ErroValidacao);
    await t.s.estrutura.arquivar("topico", id);
    const ind = await t.s.ctx.indice();
    expect(ind.topicosDaMateria("biologia").some((x) => x.id === id)).toBe(false);
    expect(ind.nomeTopico(id)).toBe("Bioquímica");
  });
});

describe("jornadas práticas e edital por aluno", () => {
  it("jornada em um passo: todas as matérias, todos os tópicos, peso 2", async () => {
    await t.entrar("moderador@curso.com");
    const id = await t.s.planos.criarJornada({ vestibularId: "fuvest", cursoId: "medicina", horasSemanais: 20 });
    const m = await t.repo.obter("modelosPlano", id);
    expect(m.nome).toBe("FUVEST · Medicina");
    expect(m.materias).toHaveLength((await t.repo.listar("materias")).length);
    expect(m.materias.every((x) => x.peso === 2 && x.maxSessao === 60)).toBe(true);
    expect(m).toMatchObject({ cargaReferencia: 1200, motorVersao: 3, revisao: { intervalos: [7, 15, 30] }, limitesTempo: { minDia: 0, maxDia: 960 } });
    expect(m.materias.find((x) => x.materiaId === "geografia").topicos.map((x) => x.topicoId)).toEqual(["g1", "g2"]);
  });

  it("tópico novo na jornada entra na estrutura, na jornada e nos alunos dela, com log", async () => {
    const ana = await t.uidDe("aluno@curso.com");
    await t.entrar("moderador@curso.com");
    const topicoId = await t.s.planos.novoTopico({ materiaId: "geografia", nome: "Geografia urbana", cargaMin: 90, modeloId: "modelo-fuvest", propagar: true });
    const sub = await t.s.planos.novoSubtopico({ materiaId: "geografia", topicoId, nome: "Metrópoles", modeloId: "modelo-fuvest", propagar: true });
    const modelo = await t.repo.obter("modelosPlano", "modelo-fuvest");
    const plano = await t.repo.obter("planos", ana);
    for (const p of [modelo, plano]) {
      const geo = p.materias.find((x) => x.materiaId === "geografia");
      expect(geo.topicos.at(-1)).toMatchObject({ topicoId, subtopicos: [{ subtopicoId: sub }] });
    }
    const carlos = await t.repo.obter("planos", await t.uidDe("carlos@curso.com"));
    expect(JSON.stringify(carlos)).not.toContain(topicoId); // outra jornada
    const logs = await t.repo.listar("logs", [["alunoId", "==", ana], ["tipo", "==", "adicionarTopico"]]);
    expect(logs[0]).toMatchObject({ motivo: "Incluído pela jornada", papel: "moderador" });
  });

  it("moderador oculta uma matéria do aluno: some das metas, fica no plano", async () => {
    const ana = await t.uidDe("aluno@curso.com");
    await t.entrar("moderador@curso.com");
    await t.s.planos.alterar(ana, { tipo: "definirMateria", materiaId: "historia", campos: { ativa: false } });
    await t.entrar("aluno@curso.com");
    const est = await t.s.estudo.garantirSemana(ana);
    const materias = new Set(Object.values(est.metas).flat().map((m) => m.materiaId));
    expect(materias.has("historia")).toBe(false);
    expect((await t.repo.obter("planos", ana)).materias.find((m) => m.materiaId === "historia").ativa).toBe(false);
  });

  it("levar a mudança da jornada aos alunos mantém o ajuste individual de cada um e nunca leva o peso", async () => {
    const ana = await t.uidDe("aluno@curso.com");
    await t.entrar("moderador@curso.com");
    const jornada = await t.repo.obter("modelosPlano", "modelo-fuvest");
    const pj = (id) => pesoDe(jornada.materias.find((x) => x.materiaId === id));
    const outro = (p, evitar = []) => [1, 2, 3].find((x) => x !== p && !evitar.includes(x));
    // Ana ganhou um peso próprio em Biologia; História segue igual à jornada
    const daAna = outro(pj("biologia"));
    const daJornada = outro(pj("biologia"), [daAna]);
    await t.s.planos.alterar(ana, { tipo: "definirMateria", materiaId: "biologia", campos: { peso: daAna } });
    const r = await t.s.planos.alterarJornada("modelo-fuvest", [
      { tipo: "definirMateria", materiaId: "biologia", campos: { peso: daJornada } },
      { tipo: "definirMateria", materiaId: "historia", campos: { peso: outro(pj("historia")), maxSessao: 90, ativa: false } },
      { tipo: "moverTopico", materiaId: "geografia", topicoId: "g2", passo: -1 },
    ], { propagar: true });
    expect(r).toMatchObject({ mudou: true, alunos: 1 });
    const modelo = await t.repo.obter("modelosPlano", "modelo-fuvest");
    const plano = await t.repo.obter("planos", ana);
    const m = (p, id) => p.materias.find((x) => x.materiaId === id);
    expect(m(modelo, "biologia").peso).toBe(daJornada);
    expect(m(plano, "biologia").peso).toBe(daAna); // ajuste da Ana fica
    // o peso é individual: nunca vai da jornada para o aluno; duração e ativa vão
    expect(m(plano, "historia")).toMatchObject({ peso: pj("historia"), maxSessao: 90, ativa: false });
    expect(m(modelo, "geografia").topicos[0].topicoId).toBe("g2");
    expect(m(plano, "geografia").topicos[0].topicoId).toBe("g1"); // ordem fica só na jornada
    const logs = await t.repo.listar("logs", [["alunoId", "==", ana], ["motivo", "==", "Levado pela jornada"]]);
    expect(logs.length).toBeGreaterThan(0);
  });

  it("sem levar aos alunos, a jornada muda sozinha", async () => {
    const ana = await t.uidDe("aluno@curso.com");
    await t.entrar("moderador@curso.com");
    const antes = await t.repo.obter("planos", ana);
    const fisica = pesoDe((await t.repo.obter("modelosPlano", "modelo-fuvest")).materias.find((x) => x.materiaId === "fisica"));
    const r = await t.s.planos.alterarJornada("modelo-fuvest", { tipo: "definirMateria", materiaId: "fisica", campos: { peso: fisica === 1 ? 2 : 1 } });
    expect(r).toEqual({ mudou: true, alunos: 0 });
    expect((await t.repo.obter("planos", ana)).materias).toEqual(antes.materias);
  });

  it("devolutiva com textos anexados: PDF ou imagem; o resto é recusado", async () => {
    const ana = await t.uidDe("aluno@curso.com");
    await t.entrar("moderador@curso.com");
    const anexo = await t.s.redacao.enviarAnexo(ana, pdf("proposta.pdf"));
    expect(anexo).toMatchObject({ nome: "proposta.pdf", tipo: "application/pdf" });
    await expect(t.s.redacao.enviarAnexo(ana, new File(["x"], "nota.txt", { type: "text/plain" }))).rejects.toThrow(ErroValidacao);
    await expect(t.s.redacao.enviarAnexo(ana, pdf("falso.pdf", "nada"))).rejects.toThrow(ErroValidacao);
    const id = await t.s.redacao.salvar({ alunoId: ana, tema: "Tema", status: "enviada", enviadaEm: "2026-09-28", anexos: [anexo] });
    await t.entrar("aluno@curso.com");
    let minhas;
    t.s.redacao.observar(ana, (l) => { minhas = l; });
    await esperar();
    expect(minhas.find((d) => d.id === id).anexos[0].nome).toBe("proposta.pdf");
    await t.entrar("aluno@curso.com");
    await expect(t.s.redacao.enviarAnexo(ana, pdf())).rejects.toThrow(ErroPermissao);
  });

  it("aluno muda a ordem dos tópicos sem tocar nas matérias do edital", async () => {
    const ana = await t.uidDe("aluno@curso.com");
    await t.entrar("aluno@curso.com");
    const antes = await t.repo.obter("planos", ana);
    await t.s.planos.alterar(ana, { tipo: "moverTopico", materiaId: "geografia", topicoId: "g2", passo: -1 });
    const depois = await t.repo.obter("planos", ana);
    expect(depois.materias).toEqual(antes.materias);
    expect(depois.ordemTopicos.geografia).toEqual(["g2", "g1"]);
    const ind = await t.s.ctx.indice();
    expect(itensDoPlano(depois, ind).filter((it) => it.materiaId === "geografia").map((it) => it.topicoId)).toEqual(["g2", "g1"]);
    await expect(t.s.planos.alterar(ana, { tipo: "moverMateria", materiaId: "historia", passo: -1 })).rejects.toThrow(ErroPermissao);
    await expect(t.s.planos.alterar(ana, { tipo: "definirMateria", materiaId: "historia", campos: { ativa: false } })).rejects.toThrow(ErroPermissao);
  });

  it("aluno marca subtópico como visto (se pode concluir conteúdos)", async () => {
    const ana = await t.uidDe("aluno@curso.com");
    await t.entrar("aluno@curso.com");
    await t.s.planos.marcarSubtopico(ana, "g2-tecnicas-e-cultivo", true);
    expect((await t.repo.obter("vistos", ana)).subtopicos).toEqual({ "g2-tecnicas-e-cultivo": true });
    await t.s.planos.marcarSubtopico(ana, "g2-tecnicas-e-cultivo", false);
    expect((await t.repo.obter("vistos", ana)).subtopicos).toEqual({});
    const carlos = await t.uidDe("carlos@curso.com");
    await expect(t.s.planos.marcarSubtopico(carlos, "g2-tecnicas-e-cultivo", true)).rejects.toThrow(ErroPermissao);
  });
});

describe("áreas de materiais e provas para simulado", () => {
  const imagem = () => new File([new Uint8Array([255, 216, 255, 224, 0, 16])], "capa.jpg", { type: "image/jpeg" });

  it("cria as áreas das matérias de uma vez; material entra na área; apagar a área não apaga o material", async () => {
    await t.entrar("moderador@curso.com");
    const antigo = await t.s.materiais.salvar({ titulo: "Resumo de Citologia", materiaId: "biologia" }, { arquivo: pdf("citologia.pdf") });
    const semMateria = await t.s.materiais.salvar({ titulo: "Cronograma geral" }, { arquivo: pdf("geral.pdf") });
    expect(await t.s.materiais.criarAreasDasMaterias()).toBe((await t.repo.listar("materias")).length); // uma por matéria
    expect(await t.s.materiais.criarAreasDasMaterias()).toBe(0); // não duplica
    const areas = await t.repo.listar("areasMateriais");
    const fisica = areas.find((a) => a.materiaId === "fisica");
    expect(fisica).toMatchObject({ nome: "Física", rotulo: "Listas de", icone: "atomo", cor: "#EF4444" });
    // o material que já existia foi para a área da matéria dele; o sem matéria fica em "Outros"
    expect((await t.repo.obter("materiais", antigo)).areaId).toBe(areas.find((a) => a.materiaId === "biologia").id);
    expect((await t.repo.obter("materiais", semMateria)).areaId).toBeNull();
    const id = await t.s.materiais.salvar({ titulo: "Eletrostática", materiaId: "fisica", areaId: fisica.id, questoes: 72, tipo: "lista" }, { arquivo: pdf("eletro.pdf") });
    expect(await t.repo.obter("materiais", id)).toMatchObject({ areaId: fisica.id, questoes: 72 });
    await expect(t.s.materiais.salvar({ titulo: "X", areaId: "nao-existe" }, { arquivo: pdf() })).rejects.toThrow(ErroValidacao);
    await expect(t.s.materiais.salvar({ titulo: "X", questoes: 0 }, { arquivo: pdf() })).rejects.toThrow(ErroValidacao);
    await t.s.materiais.removerArea(fisica.id);
    expect(await t.repo.obter("materiais", id)).toMatchObject({ titulo: "Eletrostática", areaId: null });
    await t.entrar("aluno@curso.com");
    await expect(t.s.materiais.salvarArea({ nome: "Minha" })).rejects.toThrow(ErroPermissao);
  });

  it("prova com PDF e capa; o aluno vê só publicadas; o simulado registrado guarda a prova", async () => {
    const ana = await t.uidDe("aluno@curso.com");
    await t.entrar("moderador@curso.com");
    await expect(t.s.provas.salvar({ titulo: "ENEM 2018 · Dia 2 · Prova verde" })).rejects.toThrow(ErroValidacao); // sem PDF
    await expect(t.s.provas.salvar({ titulo: "X" }, { arquivo: pdf(), capa: new File(["x"], "c.txt", { type: "text/plain" }) })).rejects.toThrow(ErroValidacao);
    const id = await t.s.provas.salvar({ titulo: "ENEM 2018 · Dia 2 · Prova verde", vestibularId: "enem", ano: 2018 }, { arquivo: pdf("enem-2018-d2.pdf"), capa: imagem() });
    await t.s.provas.salvar({ titulo: "Rascunho", publicado: false }, { arquivo: pdf() });
    const prova = await t.repo.obter("provas", id);
    expect(prova).toMatchObject({ vestibularId: "enem", ano: 2018, publicado: true, arquivo: { nome: "enem-2018-d2.pdf" } });
    expect(prova.capa.ref).toBeTruthy();
    await t.entrar("aluno@curso.com");
    let vistas;
    t.s.provas.observar((l) => { vistas = l; });
    await esperar();
    expect(vistas.map((p) => p.titulo)).toEqual(["ENEM 2018 · Dia 2 · Prova verde"]);
    await expect(t.s.provas.remover(id)).rejects.toThrow(ErroPermissao);
    const sim = await t.s.simulados.registrar(ana, { vestibularId: "enem", nome: prova.titulo, ano: 2018, data: "2026-09-27", total: 90, acertos: 54, erros: 36, provaId: id });
    expect((await t.repo.obter("simulados", sim)).provaId).toBe(id);
  });
});


describe("motor de metas: o que o aluno ajusta", () => {
  const todasMetas = (est) => DIAS.flatMap((d) => est.metas[d.k]);

  it("permissaoDaOperacao: nada de matéria para o aluno; disponibilidade, ordem e ritmo com permissão própria", () => {
    for (const campos of [{ peso: 3 }, { ativa: false }, { maxSessao: 90 }, { ritmo: 1.25 }, {}]) {
      expect(permissaoDaOperacao({ tipo: "definirMateria", materiaId: "biologia", campos })).toBeNull();
    }
    expect(permissaoDaOperacao({ tipo: "definirPlano", campos: { ordemMaterias: [] } })).toBe("ordemMaterias");
    expect(permissaoDaOperacao({ tipo: "definirPlano", campos: { disponibilidade: {} } })).toBe("disponibilidade");
    expect(permissaoDaOperacao({ tipo: "definirPlano", campos: { limitesTempo: {} } })).toBeNull();
  });

  it("tempo por dia: passos de 30, dentro dos limites e acima do mínimo semanal; a semana é refeita de hoje em diante", async () => {
    const ana = await t.uidDe("aluno@curso.com");
    await t.entrar("aluno@curso.com");
    await t.s.estudo.garantirSemana(ana);
    const disp = (await t.repo.obter("planos", ana)).disponibilidade;
    const op = (d) => ({ tipo: "definirPlano", campos: { disponibilidade: d } });
    await expect(t.s.planos.alterar(ana, op({ ...disp, qua: 225 }))).rejects.toThrow(ErroValidacao);
    await expect(t.s.planos.alterar(ana, op({ ...disp, qua: 990 }))).rejects.toThrow(ErroValidacao); // passa de 16 h
    const zero = Object.fromEntries(DIAS.map((d) => [d.k, 0]));
    await expect(t.s.planos.alterar(ana, op({ ...zero, seg: 60 }))).rejects.toThrow(/pelo menos .* para caber ao menos um bloco de cada matéria/);
    // quarta de 3 h para 4 h: o dia fecha em 4 h, tudo em blocos de 30
    await t.s.planos.alterar(ana, op({ ...disp, qua: 240 }));
    const est = await t.s.estudo.garantirSemana(ana);
    expect(est.metas.qua.reduce((s, m) => s + m.minutos, 0)).toBe(240);
    expect(todasMetas(est).every((m) => m.minutos % 30 === 0)).toBe(true);
    // o moderador aperta os limites; fora deles, o aluno não grava
    await t.entrar("moderador@curso.com");
    await t.s.planos.alterar(ana, { tipo: "definirPlano", campos: { limitesTempo: { minDia: 0, maxDia: 180 } } });
    await t.entrar("aluno@curso.com");
    await expect(t.s.planos.alterar(ana, op({ ...disp, qua: 240 }))).rejects.toThrow(ErroValidacao);
  });

  it("mover metas: com a permissão, qualquer dia da semana a partir de hoje; sem ela, recusado", async () => {
    const ana = await t.uidDe("aluno@curso.com");
    await t.entrar("aluno@curso.com");
    const est = await t.s.estudo.garantirSemana(ana);
    const dom = est.metas.dom.find((m) => !m.done);
    await t.s.estudo.moverMeta(ana, dom.id, "qua");
    expect((await t.repo.obter("semanas", ana)).metas.qua.some((m) => m.id === dom.id)).toBe(true);
    await expect(t.s.estudo.moverMeta(ana, dom.id, "2026-10-05")).rejects.toThrow(ErroValidacao); // semana seguinte
    agora = new Date(2026, 8, 30, 10, 0); // quarta
    await expect(t.s.estudo.moverMeta(ana, dom.id, "ter")).rejects.toThrow(/passou/);

    await t.entrar("moderador@curso.com");
    const plano = await t.repo.obter("planos", ana);
    await t.s.planos.alterar(ana, { tipo: "definirPlano", campos: { permissoesAluno: { ...plano.permissoesAluno, moverMetas: false } } });
    await t.entrar("aluno@curso.com");
    await expect(t.s.estudo.moverMeta(ana, dom.id, "sab")).rejects.toThrow(ErroPermissao);
    // mover e reordenar não avisam o moderador nem gravam log
    expect(await t.repo.listar("notificacoes")).toEqual([]);
  });

  it("mover uma revisão muda o dia da sessão no mesmo lote", async () => {
    const ana = await t.uidDe("aluno@curso.com");
    await t.entrar("moderador@curso.com");
    await t.s.planos.alterar(ana, { tipo: "definirPlano", campos: { revisao: { intervalos: [3] } } });
    const item = itensDoPlano(await t.repo.obter("planos", ana), await t.s.ctx.indice())[0];
    await t.s.planos.concluirItem(ana, item.itemId); // revisão na quinta, 01/10
    await t.entrar("aluno@curso.com");
    const est = await t.s.estudo.garantirSemana(ana);
    const rev = est.metas.qui.find((m) => m.tipo === "revisao");
    await t.s.estudo.moverMeta(ana, rev.id, "ter");
    const [doc] = await t.repo.listar("revisoes", [["alunoId", "==", ana]]);
    expect(doc.sessoes[0]).toMatchObject({ dia: "2026-09-29", status: "agendada" });
    const depois = await t.s.estudo.garantirSemana(ana); // a sincronização não devolve a revisão à quinta
    expect(depois.metas.ter.find((m) => m.revisaoId === doc.id)).toMatchObject({ dia: "2026-09-29" });
    expect(depois.metas.qui.some((m) => m.revisaoId === doc.id)).toBe(false);
  });

  it("ordem das matérias e das metas do dia: só com a permissão ordemMaterias", async () => {
    const ana = await t.uidDe("aluno@curso.com");
    await t.entrar("aluno@curso.com");
    const antes = await t.s.estudo.garantirSemana(ana);
    const somaPor = (est) => { const o = {}; todasMetas(est).forEach((m) => { o[m.materiaId] = (o[m.materiaId] || 0) + m.minutos; }); return o; };
    await t.s.planos.alterar(ana, { tipo: "definirPlano", campos: { ordemMaterias: ["biologia"] } });
    const depois = await t.s.estudo.garantirSemana(ana);
    expect(somaPor(depois)).toEqual(somaPor(antes)); // só a ordem muda
    DIAS.slice(0).forEach((d) => {
      const ciclo = depois.metas[d.k].filter((m) => m.tipo === "ciclo");
      if (ciclo.some((m) => m.materiaId === "biologia")) expect(ciclo[0].materiaId).toBe("biologia");
    });
    const [a, b] = depois.metas.ter;
    await t.s.estudo.reordenarMeta(ana, "ter", b.id, -1);
    expect((await t.repo.obter("semanas", ana)).metas.ter.slice(0, 2).map((m) => m.id)).toEqual([b.id, a.id]);

    await t.entrar("moderador@curso.com");
    const plano = await t.repo.obter("planos", ana);
    await t.s.planos.alterar(ana, { tipo: "definirPlano", campos: { permissoesAluno: { ...plano.permissoesAluno, ordemMaterias: false } } });
    await t.entrar("aluno@curso.com");
    await expect(t.s.planos.alterar(ana, { tipo: "definirPlano", campos: { ordemMaterias: ["historia"] } })).rejects.toThrow(ErroPermissao);
    await expect(t.s.estudo.reordenarMeta(ana, "ter", a.id, -1)).rejects.toThrow(ErroPermissao);
  });

  it("tempo extra: 60, 90 ou 120 min", async () => {
    const ana = await t.uidDe("aluno@curso.com");
    await t.entrar("aluno@curso.com");
    await t.s.estudo.garantirSemana(ana);
    await expect(t.s.estudo.tempoExtra(ana, { materiaId: "biologia", minutos: 45 })).rejects.toThrow(ErroValidacao);
    await expect(t.s.estudo.tempoExtra(ana, { materiaId: "biologia", minutos: 30 })).rejects.toThrow(ErroValidacao); // meta de estudo começa em 60
    const dia = await t.s.estudo.tempoExtra(ana, { materiaId: "biologia", minutos: 90 });
    const extra = (await t.repo.obter("semanas", ana)).metas[dia.k].find((m) => m.extra);
    expect(extra.minutos).toBe(90);
  });

  it("revisão criada ao concluir: 30 min em matéria de peso 1, 60 min em peso 3", async () => {
    const ana = await t.uidDe("aluno@curso.com");
    await t.entrar("moderador@curso.com");
    await t.s.planos.alterar(ana, [
      { tipo: "definirMateria", materiaId: "biologia", campos: { peso: 1 } },
      { tipo: "definirMateria", materiaId: "historia", campos: { peso: 3 } },
    ]);
    const itens = itensDoPlano(await t.repo.obter("planos", ana), await t.s.ctx.indice());
    await t.s.planos.concluirItem(ana, itens.find((i) => i.materiaId === "biologia").itemId);
    await t.s.planos.concluirItem(ana, itens.find((i) => i.materiaId === "historia").itemId);
    const revs = await t.repo.listar("revisoes", [["alunoId", "==", ana]]);
    expect(Object.fromEntries(revs.map((r) => [r.materiaId, r.duracaoMin]))).toEqual({ biologia: 30, historia: 60 });
    // mudar o peso muda a duração das revisões ainda agendadas na semana
    await t.s.planos.alterar(ana, { tipo: "definirMateria", materiaId: "biologia", campos: { peso: 3 } });
    await t.s.planos.alterar(ana, { tipo: "definirPlano", campos: { revisao: { intervalos: [1] } } });
    await t.s.planos.reabrirItem(ana, itens.find((i) => i.materiaId === "biologia").itemId);
    await t.s.planos.concluirItem(ana, itens.find((i) => i.materiaId === "biologia").itemId);
    const est = await t.s.estudo.garantirSemana(ana);
    expect(est.metas.ter.find((m) => m.tipo === "revisao" && m.materiaId === "biologia")?.minutos).toBe(60);
  });
});

describe("Obras literárias só para FUVEST e UNICAMP", () => {
  it("aparece na semana da Ana (FUVEST) e da Mariana (UNICAMP), não na do Carlos (ENEM MED); não se liga em outra jornada", async () => {
    const semana = async (email) => {
      const id = await t.uidDe(email);
      await t.entrar(email);
      return Object.values((await t.s.estudo.garantirSemana(id)).metas).flat().map((m) => m.materiaId);
    };
    expect(await semana("aluno@curso.com")).toContain("obras-literarias");
    expect(await semana("mariana@curso.com")).toContain("obras-literarias");
    expect(await semana("carlos@curso.com")).not.toContain("obras-literarias");
    await t.entrar("moderador@curso.com");
    await expect(t.s.planos.alterarJornada("modelo-enem", { tipo: "definirMateria", materiaId: "obras-literarias", campos: { ativa: true } })).rejects.toThrow(/só para FUVEST e UNICAMP/);
    // mesmo marcada como ativa no plano, fora da FUVEST e da UNICAMP ela não gera metas
    const carlos = await t.uidDe("carlos@curso.com");
    const plano = await t.repo.obter("planos", carlos);
    await t.repo.lote([{ tipo: "mesclar", colecao: "planos", id: carlos, dados: { materias: plano.materias.map((m) => (m.materiaId === "obras-literarias" ? { ...m, ativa: true } : m)) } }]);
    expect(await semana("carlos@curso.com")).not.toContain("obras-literarias");
  });

  it("metas de estudo de 60 a 180 min; 30 min só em revisão", async () => {
    for (const email of ["aluno@curso.com", "carlos@curso.com", "mariana@curso.com"]) {
      await t.entrar(email);
      const est = await t.s.estudo.garantirSemana(await t.uidDe(email));
      Object.values(est.metas).flat().forEach((m) => {
        if (m.tipo === "ciclo") expect([60, 90, 120, 150, 180]).toContain(m.minutos);
        else expect(m.minutos % 30).toBe(0);
      });
    }
  });
});

describe("semana gravada pelo motor anterior", () => {
  it("metas com tempo quebrado (55 min, 1h20) viram durações válidas, até nos dias que já passaram", async () => {
    const ana = await t.uidDe("aluno@curso.com");
    await t.entrar("aluno@curso.com");
    const est = await t.s.estudo.garantirSemana(ana);
    agora = new Date(2026, 8, 29, 10, 0); // terça
    const velha = {
      ...est, motorVersao: 2,
      metas: { ...est.metas, seg: [{ id: "v1", tipo: "ciclo", materiaId: "quimica", minutos: 55, done: false }, { id: "v2", tipo: "ciclo", materiaId: "matematica", minutos: 80, done: true, feitoEm: "2026-09-28" }],
        qua: [{ id: "v3", tipo: "ciclo", materiaId: "geografia", minutos: 35, done: false }] },
      pendentes: [{ id: "p1", tipo: "ciclo", materiaId: "historia", minutos: 20, done: false }],
    };
    await t.repo.lote([{ tipo: "definir", colecao: "semanas", id: ana, dados: JSON.parse(JSON.stringify({ ...velha, alunoId: ana })) }]);
    const nova = await t.s.estudo.garantirSemana(ana);
    expect(nova.motorVersao).toBe(3);
    expect(nova.metas.seg.find((m) => m.id === "v1").minutos).toBe(60); // aberta de dia passado: 55 → 60
    expect(nova.metas.seg.find((m) => m.id === "v2").minutos).toBe(80); // feita: histórico, fica
    expect(nova.pendentes[0].minutos).toBe(60);
    Object.entries(nova.metas).forEach(([k, l]) => l.filter((m) => !m.done && k !== "seg").forEach((m) => {
      expect(m.tipo === "revisao" ? m.minutos % 30 : m.minutos % 30 + (m.minutos >= 60 ? 0 : 1)).toBe(0);
    }));
  });
});

describe("migração para o motor de blocos e pesos", () => {
  it("plano e jornada antigos viram v3 com log; a segunda execução não muda nada; o aluno já vê metas em blocos de 30", async () => {
    const ana = await t.uidDe("aluno@curso.com");
    // simula dados gravados antes do motor novo
    const plano = await t.repo.obter("planos", ana);
    const { id: _p, ...docPlano } = plano;
    const velho = {
      ...docPlano, motorVersao: undefined, limitesTempo: undefined, revisao: { intervalos: [7, 15, 30], duracaoMin: 20 },
      disponibilidade: { seg: 45, ter: 105, qua: 90, qui: 120, sex: 60, sab: 75, dom: 0 },
      materias: plano.materias.map((m, i) => ({ ...m, peso: undefined, minutosSemanais: [300, 240, 120, 45][i % 4], maxSessao: 45, prioridade: 2 })),
    };
    const { id: _m, ...modelo } = await t.repo.obter("modelosPlano", "modelo-fuvest");
    await t.repo.lote([
      { tipo: "definir", colecao: "planos", id: ana, dados: JSON.parse(JSON.stringify(velho)) },
      { tipo: "definir", colecao: "modelosPlano", id: "modelo-fuvest", dados: JSON.parse(JSON.stringify({ ...modelo, motorVersao: undefined, materias: velho.materias })) },
    ]);
    // antes da migração gravada: o motor converte em memória
    await t.entrar("aluno@curso.com");
    const est = await t.s.estudo.garantirSemana(ana);
    expect(Object.values(est.metas).flat().every((m) => m.minutos % 30 === 0)).toBe(true);

    await t.entrar("moderador@curso.com");
    expect(await t.s.planos.migrarMotor({ alunoId: ana })).toEqual({ modelos: 1, alunos: 1 });
    const novo = await t.repo.obter("planos", ana);
    expect(novo.motorVersao).toBe(3);
    expect(novo.materias.every((m) => [1, 2, 3].includes(m.peso) && m.maxSessao === 60)).toBe(true);
    expect(novo.revisao).toEqual({ intervalos: [7, 15, 30] });
    expect(Object.values(novo.disponibilidade).every((v) => v % 30 === 0)).toBe(true);
    const logs = await t.repo.listar("logs", [["tipo", "==", "migrarMotor"]]);
    expect(logs.map((l) => l.entidade).sort()).toEqual(["modelo", "plano"]);
    expect(await t.s.planos.migrarMotor({ todosAlunos: true })).toEqual({ modelos: 0, alunos: 0 });
    expect(await t.repo.listar("logs", [["tipo", "==", "migrarMotor"]])).toHaveLength(2);
  });
});

describe("peso individual e semana desatualizada", () => {
  it("mudar o peso de uma aluna não muda a jornada nem os outros alunos", async () => {
    const ana = await t.uidDe("aluno@curso.com");
    const carlos = await t.uidDe("carlos@curso.com");
    await t.entrar("moderador@curso.com");
    const jornadaAntes = await t.repo.obter("modelosPlano", "modelo-fuvest");
    const carlosAntes = await t.repo.obter("planos", carlos);
    const atual = pesoDe((await t.repo.obter("planos", ana)).materias.find((m) => m.materiaId === "fisica"));
    await t.s.planos.alterar(ana, { tipo: "definirMateria", materiaId: "fisica", campos: { peso: atual === 3 ? 1 : 3 } });
    expect(pesoDe((await t.repo.obter("planos", ana)).materias.find((m) => m.materiaId === "fisica"))).toBe(atual === 3 ? 1 : 3);
    expect((await t.repo.obter("modelosPlano", "modelo-fuvest")).materias).toEqual(jornadaAntes.materias);
    expect((await t.repo.obter("planos", carlos)).materias).toEqual(carlosAntes.materias);
  });

  it("mover uma meta de uma semana que ficou para trás grava a semana atual e pede para repetir", async () => {
    const ana = await t.uidDe("aluno@curso.com");
    await t.entrar("aluno@curso.com");
    const est = await t.s.estudo.garantirSemana(ana);
    const velha = { ...est, motorVersao: 2, alunoId: ana }; // gravada por um motor anterior
    await t.repo.lote([{ tipo: "definir", colecao: "semanas", id: ana, dados: JSON.parse(JSON.stringify(velha)) }]);
    const meta = velha.metas.sab.find((m) => !m.done);
    await expect(t.s.estudo.moverMeta(ana, `${meta.id}-que-sumiu`, "qui")).rejects.toThrow(/atualizada/);
    const gravada = await t.repo.obter("semanas", ana);
    expect(gravada.motorVersao).toBe(3); // a tela passa a ver a semana válida
    const outra = gravada.metas.sab.find((m) => !m.done);
    await expect(t.s.estudo.moverMeta(ana, outra.id, "qui")).resolves.toBe(true);
  });
});

describe("replanejar e depois mover", () => {
  it("as metas atrasadas vão para os próximos dias e mover continua funcionando", async () => {
    const ana = await t.uidDe("aluno@curso.com");
    await t.entrar("aluno@curso.com");
    const seg = await t.s.estudo.garantirSemana(ana);
    agora = new Date(2026, 8, 30, 10, 0); // quarta: segunda e terça ficaram atrasadas
    const atrasadas = [...seg.metas.seg, ...seg.metas.ter].filter((m) => !m.done && m.tipo === "ciclo");
    expect(atrasadas.length).toBeGreaterThan(0);
    const previa = await t.s.estudo.previaReplanejamento(ana);
    const est = await t.s.estudo.aplicarReplanejamento(ana, previa);
    expect([...est.metas.seg, ...est.metas.ter].filter((m) => !m.done && m.tipo === "ciclo")).toEqual([]);
    expect(est.motorVersao).toBe(3);
    const m = est.metas.sab.find((x) => !x.done);
    await expect(t.s.estudo.moverMeta(ana, m.id, "qui")).resolves.toBe(true);
  });
});
