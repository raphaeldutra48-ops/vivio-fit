import { describe, expect, it } from 'vitest';
import {
  FATOR_COTIDIANO,
  gastoDiario,
  idadeEmAnos,
  taxaMetabolicaBasal,
  type DadosParaTmb,
} from './metabolismo';

const completo: DadosParaTmb = {
  pesoKg: 63,
  alturaCm: 165,
  idade: 31,
  sexo: 'F',
  massaMagraKg: null,
};

describe('taxaMetabolicaBasal', () => {
  /*
    Mifflin-St Jeor, mulher: 10×63 + 6,25×165 − 5×31 − 161
    = 630 + 1031,25 − 155 − 161 = 1345,25 → 1345.
  */
  it('calcula Mifflin-St Jeor para mulher', () => {
    const r = taxaMetabolicaBasal(completo);
    expect(r.tmb).toBe(1345);
    expect(r.formula).toBe('MIFFLIN_ST_JEOR');
  });

  /* Mesmo corpo, homem: +5 em vez de −161, ou seja, 166 kcal a mais. */
  it('o sexo muda o resultado em 166 kcal', () => {
    const mulher = taxaMetabolicaBasal(completo).tmb!;
    const homem = taxaMetabolicaBasal({ ...completo, sexo: 'M' }).tmb!;
    expect(homem - mulher).toBe(166);
  });

  /*
    A decisão central do módulo. Tendo massa magra medida, o sexo vira ruído:
    ele existia só como atalho para adivinhar composição corporal, e aqui a
    composição está medida.
  */
  it('com massa magra, usa Katch-McArdle e ignora o sexo', () => {
    const comMassa = { ...completo, massaMagraKg: 48 };
    const comoMulher = taxaMetabolicaBasal(comMassa);
    const comoHomem = taxaMetabolicaBasal({ ...comMassa, sexo: 'M' });

    // 370 + 21,6 × 48 = 1406,8 → 1407
    expect(comoMulher.tmb).toBe(1407);
    expect(comoMulher.formula).toBe('KATCH_MCARDLE');
    expect(comoHomem.tmb).toBe(comoMulher.tmb);
  });

  it('Katch-McArdle dispensa altura, idade e sexo', () => {
    const r = taxaMetabolicaBasal({
      pesoKg: null,
      alturaCm: null,
      idade: null,
      sexo: null,
      massaMagraKg: 48,
    });
    expect(r.tmb).toBe(1407);
    expect(r.faltando).toEqual([]);
  });

  /*
    Sem dado, `null` e a lista do que falta — nunca uma pessoa média. O número
    assumido apareceria idêntico para gente muito diferente e seria lido como
    medida.
  */
  it('sem sexo e sem massa magra, não calcula e diz o que falta', () => {
    const r = taxaMetabolicaBasal({ ...completo, sexo: null });
    expect(r.tmb).toBeNull();
    expect(r.faltando).toContain('sexo biológico');
  });

  it('lista todos os dados que faltam de uma vez', () => {
    const r = taxaMetabolicaBasal({
      pesoKg: null,
      alturaCm: null,
      idade: null,
      sexo: null,
      massaMagraKg: null,
    });
    expect(r.faltando).toEqual(['peso', 'altura', 'data de nascimento', 'sexo biológico']);
  });
});

describe('gastoDiario', () => {
  /*
    A armadilha que este módulo existe para evitar: a tabela clássica de
    atividade (1,55 "moderadamente ativo") já embute o exercício. Usá-la e
    ainda somar o treino conta duas vezes.

    Por isso o fator é 1,2 — só a vida cotidiana — e o exercício entra pelo
    que foi registrado.
  */
  it('usa 1,2 e soma o exercício registrado por fora', () => {
    const r = gastoDiario(completo, 2100, 7);

    expect(r.tmb).toBe(1345);
    expect(r.cotidiano).toBe(Math.round((1345 * FATOR_COTIDIANO) / 10) * 10);
    expect(r.exercicioPorDia).toBe(300);
    expect(r.totalPorDia).toBe(r.cotidiano! + 300);
  });

  it('o fator cotidiano não embute treino', () => {
    // Se alguém trocar por 1,55, o exercício passaria a ser contado duas vezes.
    expect(FATOR_COTIDIANO).toBe(1.2);
  });

  it('sem exercício registrado, o total é só o cotidiano', () => {
    const r = gastoDiario(completo, null, 7);
    expect(r.exercicioPorDia).toBeNull();
    expect(r.totalPorDia).toBe(r.cotidiano);
  });

  it('sem TMB não há total, mesmo com exercício registrado', () => {
    const r = gastoDiario({ ...completo, sexo: null }, 2100, 7);
    expect(r.totalPorDia).toBeNull();
    // O exercício continua sendo mostrado: aquele número existe e é medido.
    expect(r.exercicioPorDia).toBe(300);
  });

  it('arredonda para dezenas — a margem da TMB já é de 10% a 15%', () => {
    const r = gastoDiario(completo, 2000, 7);
    expect(r.cotidiano! % 10).toBe(0);
    expect(r.totalPorDia! % 10).toBe(0);
  });
});

describe('idadeEmAnos', () => {
  it('conta os anos completos', () => {
    expect(idadeEmAnos(new Date(1995, 3, 12), new Date(2026, 7, 13))).toBe(31);
  });

  /* Antes do aniversário do ano, ainda não completou. */
  it('não conta o ano em que o aniversário ainda não chegou', () => {
    expect(idadeEmAnos(new Date(1995, 11, 20), new Date(2026, 7, 13))).toBe(30);
  });

  it('sem data, sem idade', () => {
    expect(idadeEmAnos(null)).toBeNull();
  });
});
