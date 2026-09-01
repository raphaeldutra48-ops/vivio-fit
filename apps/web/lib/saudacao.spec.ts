import { describe, expect, it } from 'vitest';
import { haQuantoTempo, saudacao } from './saudacao';

/**
 * Limites de faixa e de plural — os dois lugares onde este tipo de código erra
 * e ninguém percebe, porque o erro dura um minuto por dia ou um caso por lista.
 */

describe('saudacao', () => {
  it('de madrugada até 11h59 é bom dia', () => {
    expect(saudacao(0)).toBe('Bom dia');
    expect(saudacao(11)).toBe('Bom dia');
  });

  /* Meio-dia em ponto já é tarde no uso brasileiro. */
  it('o meio-dia vira a tarde', () => {
    expect(saudacao(12)).toBe('Boa tarde');
    expect(saudacao(17)).toBe('Boa tarde');
  });

  it('às 18h vira noite', () => {
    expect(saudacao(18)).toBe('Boa noite');
    expect(saudacao(23)).toBe('Boa noite');
  });

  /*
    Uma saudação não derruba tela. Se a hora vier estranha — fuso, relógio
    errado, teste mal escrito — o cumprimento sai neutro e o resumo carrega.
  */
  it('hora inválida não lança', () => {
    expect(saudacao(-1)).toBe('Boa tarde');
    expect(saudacao(24)).toBe('Boa tarde');
    expect(saudacao(9.5)).toBe('Boa tarde');
    expect(saudacao(Number.NaN)).toBe('Boa tarde');
  });
});

describe('haQuantoTempo', () => {
  it('zero é hoje, um é ontem', () => {
    expect(haQuantoTempo(0)).toBe('hoje');
    expect(haQuantoTempo(1)).toBe('ontem');
  });

  /* "há 1 dias" é a marca de quem não tratou o singular. */
  it('a partir de dois, conta os dias', () => {
    expect(haQuantoTempo(2)).toBe('há 2 dias');
    expect(haQuantoTempo(45)).toBe('há 45 dias');
  });

  it('negativo não vira "há -3 dias"', () => {
    expect(haQuantoTempo(-3)).toBe('hoje');
  });
});
