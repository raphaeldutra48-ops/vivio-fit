import { describe, expect, it } from 'vitest';
import {
  HORAS_DE_VALIDADE_DO_RASCUNHO,
  rascunhoAindaVale,
  temAlgoAPreservar,
  type SerieEmAndamento,
} from './rascunho-treino';

/**
 * As duas decisões que separam "recuperei o treino do aluno" de "inventei um
 * treino que ele não fez".
 *
 * O erro caro aqui não é perder o rascunho — é retomar o errado. Séries de um
 * treino de peito reaparecendo na tela de perna entrariam no histórico como
 * exercício feito, e o personal ajustaria a carga da semana seguinte em cima
 * de um número que nunca aconteceu.
 */

const AGORA = new Date('2026-08-21T15:00:00.000Z');

const serie = (parcial: Partial<SerieEmAndamento> = {}): SerieEmAndamento => ({
  chave: 'i1-1',
  itemTreinoId: 'i1',
  exercicioId: 'e1',
  serieNum: 1,
  tipo: 'NORMAL',
  repsFeitas: '',
  cargaKg: '40',
  concluida: false,
  ...parcial,
});

describe('rascunhoAindaVale', () => {
  it('rascunho recente da mesma sessão vale', () => {
    expect(
      rascunhoAindaVale({ sessaoId: 's1', salvoEm: '2026-08-21T14:30:00.000Z' }, 's1', AGORA),
    ).toBe(true);
  });

  /* A regra que impede treino de peito virar treino de perna. */
  it('rascunho de outra sessão nunca vale', () => {
    expect(
      rascunhoAindaVale({ sessaoId: 'peito', salvoEm: '2026-08-21T14:59:00.000Z' }, 'perna', AGORA),
    ).toBe(false);
  });

  it('vencido pelo tempo não vale', () => {
    const velho = new Date(
      AGORA.getTime() - (HORAS_DE_VALIDADE_DO_RASCUNHO + 1) * 3_600_000,
    ).toISOString();
    expect(rascunhoAindaVale({ sessaoId: 's1', salvoEm: velho }, 's1', AGORA)).toBe(false);
  });

  /* O limite exato: seis horas em ponto ainda é o mesmo treino. */
  it('o limite é inclusivo', () => {
    const noLimite = new Date(
      AGORA.getTime() - HORAS_DE_VALIDADE_DO_RASCUNHO * 3_600_000,
    ).toISOString();
    const passandoUmMinuto = new Date(
      AGORA.getTime() - (HORAS_DE_VALIDADE_DO_RASCUNHO * 60 + 1) * 60_000,
    ).toISOString();

    expect(rascunhoAindaVale({ sessaoId: 's1', salvoEm: noLimite }, 's1', AGORA)).toBe(true);
    expect(rascunhoAindaVale({ sessaoId: 's1', salvoEm: passandoUmMinuto }, 's1', AGORA)).toBe(false);
  });

  /*
    `new Date('qualquer coisa')` dá `NaN`, e comparação com `NaN` é sempre
    falsa — inclusive a que deveria reprovar. Sem o teste explícito de
    finitude, um `salvoEm` corrompido passaria pela validade por acidente.
  */
  it('data ilegível é tratada como vencida', () => {
    expect(rascunhoAindaVale({ sessaoId: 's1', salvoEm: 'ontem de tarde' }, 's1', AGORA)).toBe(false);
    expect(rascunhoAindaVale({ sessaoId: 's1', salvoEm: '' }, 's1', AGORA)).toBe(false);
  });

  /*
    Relógio do aparelho atrasado, corrigido pela rede no meio do treino: o
    rascunho fica com data no futuro. Descartar aí seria punir a pessoa por um
    acerto de relógio.
  */
  it('rascunho com data no futuro é preservado', () => {
    const futuro = new Date(AGORA.getTime() + 2 * 3_600_000).toISOString();
    expect(rascunhoAindaVale({ sessaoId: 's1', salvoEm: futuro }, 's1', AGORA)).toBe(true);
  });
});

describe('temAlgoAPreservar', () => {
  /*
    A tela nasce assim: uma linha por série do plano, com a carga sugerida já
    preenchida. Anunciar "retomando o treino" neste estado seria mentira.
  */
  it('rascunho recém-aberto não tem nada a preservar', () => {
    expect(temAlgoAPreservar([serie(), serie({ chave: 'i1-2', serieNum: 2 })])).toBe(false);
  });

  it('série marcada conta', () => {
    expect(temAlgoAPreservar([serie(), serie({ concluida: true })])).toBe(true);
  });

  it('repetição digitada conta, mesmo sem marcar', () => {
    expect(temAlgoAPreservar([serie({ repsFeitas: '10' })])).toBe(true);
  });

  /* Espaço em branco não é digitação — vira o mesmo que campo vazio. */
  it('espaço em branco não conta', () => {
    expect(temAlgoAPreservar([serie({ repsFeitas: '   ' })])).toBe(false);
  });

  it('lista vazia não tem nada a preservar', () => {
    expect(temAlgoAPreservar([])).toBe(false);
  });
});
