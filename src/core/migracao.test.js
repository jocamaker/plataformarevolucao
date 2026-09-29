import { describe, expect, it } from "vitest";
import { migrarDisponibilidade, migrarPlanoV2, pesoPelaIncidencia } from "./migracao.js";

const antigo = () => ({
  alunoId: "ana",
  disponibilidade: { seg: 45, ter: 75, qua: 15, qui: 100, sex: 0, sab: 200, dom: 50 },
  revisao: { intervalos: [7, 15, 30], duracaoMin: 20 },
  materias: [
    { materiaId: "matematica", minutosSemanais: 360, maxSessao: 90, prioridade: 1 },
    { materiaId: "fisica", minutosSemanais: 285, maxSessao: 80, prioridade: 2 },
    { materiaId: "historia", minutosSemanais: 165, maxSessao: 45, prioridade: 2 },
    { materiaId: "filosofia", minutosSemanais: 60, maxSessao: 60, prioridade: 3 },
  ],
});

describe("migração para o motor v2", () => {
  it("peso pela incidência: r ≥ 0,75 → 3; 0,45 a 0,75 → 2; abaixo → 1; tudo zero → 2", () => {
    expect([360, 270, 162, 161, 60].map((m) => pesoPelaIncidencia(m, 360))).toEqual([3, 3, 2, 1, 1]);
    expect(pesoPelaIncidencia(0, 0)).toBe(2);
  });

  it("plano antigo, com minutos de 15 em 15 e sem peso, vira v2", () => {
    const { plano, mudou } = migrarPlanoV2(antigo(), { minimo: 120 });
    expect(mudou).toBe(true);
    expect(plano.motorVersao).toBe(2);
    expect(plano.materias.map((m) => [m.materiaId, m.peso, m.maxSessao])).toEqual([
      ["matematica", 3, 90], ["fisica", 3, 90], ["historia", 2, 60], ["filosofia", 1, 60],
    ]);
    expect(plano.materias[0]).toMatchObject({ minutosSemanais: 360, prioridade: 1 }); // o antigo fica, sem efeito
    expect(plano.disponibilidade).toEqual({ seg: 60, ter: 90, qua: 30, qui: 90, sex: 0, sab: 210, dom: 60 });
    expect(plano.revisao).toEqual({ intervalos: [7, 15, 30] });
    expect(plano.limitesTempo).toEqual({ minDia: 0, maxDia: 480 });
  });

  it("uma segunda execução não muda nada", () => {
    const { plano } = migrarPlanoV2(antigo(), { minimo: 120 });
    const de_novo = migrarPlanoV2(plano, { minimo: 120 });
    expect(de_novo.mudou).toBe(false);
    expect(de_novo.plano).toBe(plano);
  });

  it("abaixo do mínimo semanal, os dias com mais tempo sobem de 30 em 30", () => {
    expect(migrarDisponibilidade({ seg: 30, ter: 15 }, undefined, 120)).toEqual({ seg: 90, ter: 30, qua: 0, qui: 0, sex: 0, sab: 0, dom: 0 });
    expect(migrarDisponibilidade({ seg: 600 }, { minDia: 0, maxDia: 480 }, 0).seg).toBe(480);
  });

  it("jornada sem disponibilidade migra só pesos, metas e revisões", () => {
    const { disponibilidade: _d, alunoId: _a, ...jornada } = antigo();
    const { plano } = migrarPlanoV2(jornada);
    expect(plano.disponibilidade).toBeUndefined();
    expect(plano.materias.every((m) => [1, 2, 3].includes(m.peso))).toBe(true);
  });
});
