import { describe, expect, it } from 'vitest';
import { resumoDeCheckins, type CheckinResumo } from './checkin';

/**
 * Os números do painel de check-in.
 *
 * A conta era um serviço do NestJS e virou função pura aqui, pelo mesmo motivo
 * das séries de evolução: é conta sobre linhas que quem pergunta já pode ler.
 *
 * O que este arquivo mais protege é o DENOMINADOR da adesão. Trocá-lo por
 * "dias do período" não quebra nada — só devolve um número menor, plausível, e
 * errado. O personal liga cobrando quem treina certo e só esqueceu de marcar.
 */
const dia = (data: string, treinou: boolean, energia = 3, teveDor = false): CheckinResumo => ({
  id: data,
  data,
  treinou,
  energia,
  teveDor,
  localDor: null,
  observacao: null,
  criadoEm: `${data}T12:00:00.000Z`,
});

const AGORA = new Date('2026-03-10T15:00:00.000Z');

describe('resumoDeCheckins', () => {
  it('a adesão é sobre dias COM check-in, não sobre o período', () => {
    // Três registros em trinta dias, dois com treino. 2/3, e não 2/30.
    const r = resumoDeCheckins(
      [dia('2026-03-10', true), dia('2026-03-09', false), dia('2026-03-08', true)],
      30,
      AGORA,
    );
    expect(r.comCheckin).toBe(3);
    expect(r.treinou).toBe(2);
    expect(r.aderencia).toBe(67);
    // O período continua no resultado, para a tela poder dizer "em 30 dias".
    expect(r.dias).toBe(30);
  });

  it('sem nenhum check-in, adesão e energia são nulas — e não zero', () => {
    /*
      Zero diria "não treinou nada"; nulo diz "não há o que dizer". A tela
      mostra coisas diferentes, e quem sumiu tem campo próprio.
    */
    const r = resumoDeCheckins([], 30, AGORA);
    expect(r.aderencia).toBeNull();
    expect(r.energiaMedia).toBeNull();
    expect(r.comCheckin).toBe(0);
    expect(r.ultimoEm).toBeNull();
    expect(r.diasSemCheckin).toBeNull();
  });

  it('energia média sai com uma casa', () => {
    const r = resumoDeCheckins(
      [dia('2026-03-10', true, 4), dia('2026-03-09', true, 3), dia('2026-03-08', true, 2)],
      30,
      AGORA,
    );
    expect(r.energiaMedia).toBe(3);

    const quebrado = resumoDeCheckins(
      [dia('2026-03-10', true, 4), dia('2026-03-09', true, 3)],
      30,
      AGORA,
    );
    expect(quebrado.energiaMedia).toBe(3.5);
  });

  it('conta os dias com dor', () => {
    const r = resumoDeCheckins(
      [dia('2026-03-10', true, 3, true), dia('2026-03-09', true, 3, false)],
      30,
      AGORA,
    );
    expect(r.diasComDor).toBe(1);
  });

  it('dias sem check-in conta do ÚLTIMO registro até hoje', () => {
    // É o campo que responde "sumiu?", separado da adesão de propósito.
    const r = resumoDeCheckins([dia('2026-03-04', true)], 30, AGORA);
    expect(r.ultimoEm).toBe('2026-03-04');
    expect(r.diasSemCheckin).toBe(6);
  });

  it('quem registrou hoje está com zero dias sem check-in', () => {
    const r = resumoDeCheckins([dia('2026-03-10', true)], 30, AGORA);
    expect(r.diasSemCheckin).toBe(0);
  });

  it('adesão de 100% e de 0% são as duas possíveis', () => {
    expect(resumoDeCheckins([dia('2026-03-10', true)], 7, AGORA).aderencia).toBe(100);
    expect(resumoDeCheckins([dia('2026-03-10', false)], 7, AGORA).aderencia).toBe(0);
  });
});
