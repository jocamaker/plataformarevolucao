import { describe, expect, it } from "vitest";
import { ErroPermissao, exigir, pode } from "./permissoes.js";

const mod = { uid: "m1", role: "moderador" };
const ana = { uid: "alu1", role: "aluno" };
const carlos = { uid: "alu2", role: "aluno" };
const agora = new Date("2026-09-27T12:00:00").getTime();

describe("permissões", () => {
  it("aluno vê só os próprios dados; moderador vê todos", () => {
    expect(pode(ana, "ver:aluno", { alunoId: "alu1" })).toBe(true);
    expect(pode(ana, "ver:aluno", { alunoId: "alu2" })).toBe(false);
    expect(pode(mod, "ver:aluno", { alunoId: "alu2" })).toBe(true);
    expect(pode(null, "ver:aluno", { alunoId: "alu1" })).toBe(false);
  });

  it("aluno não acessa painel nem conteúdo do moderador", () => {
    ["ver:painelModerador", "gerenciar:modelos", "gerenciar:estrutura", "gerenciar:materiais", "enviar:notificacao"].forEach((a) => {
      expect(pode(ana, a)).toBe(false);
      expect(pode(mod, a)).toBe(true);
    });
  });

  it("plano: aluno altera só o que o plano permite", () => {
    const plano = { permissoesAluno: { disponibilidade: true, ritmo: false } };
    expect(pode(ana, "alterar:plano", { alunoId: "alu1", plano, permissao: "disponibilidade" })).toBe(true);
    expect(pode(ana, "alterar:plano", { alunoId: "alu1", plano, permissao: "ritmo" })).toBe(false);
    expect(pode(carlos, "alterar:plano", { alunoId: "alu1", plano, permissao: "disponibilidade" })).toBe(false);
    expect(pode(mod, "alterar:plano", { alunoId: "alu1", plano, permissao: "ritmo" })).toBe(true);
  });

  it("registros: aluno registra os próprios e corrige só nas primeiras 24 h", () => {
    expect(pode(ana, "registrar:questoes", { alunoId: "alu1" })).toBe(true);
    expect(pode(ana, "registrar:questoes", { alunoId: "alu2" })).toBe(false);
    const recente = { alunoId: "alu1", criadoEm: "2026-09-27T08:00:00" };
    const antigo = { alunoId: "alu1", criadoEm: "2026-09-25T08:00:00" };
    expect(pode(ana, "corrigir:registro", { registro: recente }, agora)).toBe(true);
    expect(pode(ana, "corrigir:registro", { registro: antigo }, agora)).toBe(false);
    expect(pode(carlos, "corrigir:registro", { registro: recente }, agora)).toBe(false);
    expect(pode(mod, "corrigir:registro", { registro: antigo }, agora)).toBe(true);
  });

  it("notificação: só o destinatário marca como lida", () => {
    const n = { alunoId: "alu1" };
    expect(pode(ana, "marcarLida:notificacao", { notificacao: n })).toBe(true);
    expect(pode(carlos, "ler:notificacao", { notificacao: n })).toBe(false);
    expect(pode(mod, "marcarLida:notificacao", { notificacao: n })).toBe(false);
    expect(() => exigir(carlos, "ler:notificacao", { notificacao: n })).toThrow(ErroPermissao);
  });
});
