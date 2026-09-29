/* Motor de agendamento: FSRS pela biblioteca ts-fsrs (a implementação da
   organização open-spaced-repetition, a mesma família de algoritmo que o
   Anki usa). Nada da fórmula é reimplementado aqui: este arquivo só traduz
   as configurações do aluno, prevê o intervalo de cada botão e converte o
   estado do cartão entre o banco e a biblioteca. */

import { createEmptyCard, fsrs, generatorParameters, Rating, State } from "ts-fsrs";
import { fsrsDoDoc, fsrsParaDoc, normalizarConfig } from "../dados/modelo.js";

export const AVALIACOES = Object.freeze([
  { valor: Rating.Again, chave: "novamente", rotulo: "Novamente", tecla: "1" },
  { valor: Rating.Hard, chave: "dificil", rotulo: "Difícil", tecla: "2" },
  { valor: Rating.Good, chave: "bom", rotulo: "Bom", tecla: "3" },
  { valor: Rating.Easy, chave: "facil", rotulo: "Fácil", tecla: "4" },
]);

export const ESTADO_FSRS = State;

/* config: as configurações do aluno (normalizadas aqui).
   fuzz: um pequeno sorteio nos intervalos longos, como no Anki, para os
   cartões criados juntos não vencerem todos no mesmo dia (desligado nos
   testes, para os números serem exatos). */
export function criarAgendador(config = {}, { fuzz = true } = {}) {
  const cfg = normalizarConfig(config);
  const f = fsrs(generatorParameters({
    request_retention: cfg.retencao,
    maximum_interval: cfg.intervaloMaximo,
    enable_fuzz: fuzz,
    enable_short_term: true,
    learning_steps: cfg.passosAprendizado,
    relearning_steps: cfg.passosReaprendizado,
  }));

  /* A biblioteca obriga Fácil > Bom > Difícil em pelo menos um dia depois de
     aplicar o intervalo máximo (com máximo 30: 30, 31 e 32 dias). O aluno
     pediu "nunca passar do limite": o teto vale por último. A estabilidade
     e a dificuldade (o modelo de memória) não mudam. */
  const tetoMs = cfg.intervaloMaximo * 86400000;
  function comTeto(card, agora) {
    const doc = fsrsParaDoc(card);
    if (doc.due.getTime() - agora.getTime() > tetoMs) {
      doc.due = new Date(agora.getTime() + tetoMs);
      doc.scheduled_days = cfg.intervaloMaximo;
    }
    return doc;
  }

  return {
    config: cfg,

    // o que cada botão faria agora (para mostrar "volta em…" acima dele)
    previsoes(cartao, agora) {
      const r = f.repeat(fsrsDoDoc(cartao.fsrs), agora);
      const p = {};
      for (const a of AVALIACOES) {
        const doc = comTeto(r[a.valor].card, agora);
        p[a.valor] = { fsrs: doc, intervaloMs: doc.due.getTime() - agora.getTime() };
      }
      return p;
    },

    // a resposta do aluno: o novo estado FSRS do cartão
    responder(cartao, avaliacao, agora) {
      if (!AVALIACOES.some((a) => a.valor === avaliacao)) throw new Error(`Avaliação inválida: ${avaliacao}`);
      return comTeto(f.next(fsrsDoDoc(cartao.fsrs), agora, avaliacao).card, agora);
    },

    // probabilidade de lembrar agora (0 a 1); null para cartão novo
    retencao(cartao, agora) {
      if (cartao.fsrs.state === State.New || !cartao.fsrs.last_review) return null;
      return f.get_retrievability(fsrsDoDoc(cartao.fsrs), agora, false);
    },

    // curva de esquecimento: R depois de "dias" com estabilidade S
    curva: (dias, estabilidade) => f.forgetting_curve(dias, estabilidade),

    // intervalo ÷ estabilidade com esta retenção-alvo (1 com 90%; maior = intervalos mais longos)
    modificadorIntervalo: f.interval_modifier,

    /* Reagendar (depois de mudar a retenção-alvo ou o intervalo máximo, como
       a opção do Anki): o cartão em revisão ganha o intervalo que a
       estabilidade dele pede com as configurações novas, contado da última
       revisão. A memória (estabilidade, dificuldade) não muda. Os demais
       estados voltam sem mudança (null). */
    reagendar(cartao, agora) {
      const doc = cartao.fsrs;
      if (doc?.state !== State.Review || !doc.last_review || !(doc.stability > 0)) return null;
      const ultima = new Date(doc.last_review);
      const dias = Math.min(Math.max(1, Math.round(doc.stability * f.interval_modifier)), cfg.intervaloMaximo);
      const due = new Date(ultima.getTime() + dias * 86400000);
      // o teto vale a partir de agora também (nada além do intervalo máximo)
      const limite = new Date(agora.getTime() + tetoMs);
      return { ...doc, due: due > limite ? limite : due, scheduled_days: dias };
    },

    // volta a "novo"
    novo: (agora) => fsrsParaDoc(createEmptyCard(agora)),
  };
}

/* "<1 min", "10 min", "3 h", "1 dia", "4 dias", "1,3 mês", "2,1 anos" */
export function formatarIntervalo(ms) {
  const min = ms / 60000;
  if (min < 1) return "<1 min";
  if (min < 60) return `${Math.round(min)} min`;
  const h = min / 60;
  if (h < 24) return `${Math.round(h)} h`;
  const d = h / 24;
  if (d < 30) { const n = Math.round(d); return `${n} ${n === 1 ? "dia" : "dias"}`; }
  const um = (x) => x.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  if (d < 365) { const m = d / 30.4; return `${um(m)} ${m < 1.95 ? "mês" : "meses"}`; }
  const a = d / 365;
  return `${um(a)} ${a < 1.95 ? "ano" : "anos"}`;
}
