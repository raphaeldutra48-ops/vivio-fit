import { describe, expect, it } from 'vitest';
import { montarEvolucaoCorporal } from './evolucao';

/**
 * As séries de evolução corporal.
 *
 * A conta era um serviço do NestJS e virou função pura aqui, porque é conta
 * sobre linhas que quem pergunta já pode ler — e uma agregação assim não
 * precisa de servidor, precisa de um lugar com teste. Este é o lugar.
 *
 * Os números aceitam string de propósito: o Postgres devolve `numeric` como
 * texto pelo PostgREST e como `Decimal` pelo Prisma, e a mesma função atende
 * os dois.
 */
describe('montarEvolucaoCorporal', () => {
  it('deriva massa gorda e massa magra de peso e percentual', () => {
    // É o que permite o gráfico existir com uma balança comum e um adipômetro,
    // sem bioimpedância.
    const r = montarEvolucaoCorporal([
      { data: '2026-01-10', pesoKg: 80, percentualGordura: 25 },
    ]);
    const gorda = r.series.find((s) => s.metrica === 'MASSA_GORDA');
    const magra = r.series.find((s) => s.metrica === 'MASSA_MAGRA');
    expect(gorda?.pontos[0]?.valor).toBe(20);
    expect(magra?.pontos[0]?.valor).toBe(60);
  });

  it('a bioimpedância ganha da derivação quando existe', () => {
    const r = montarEvolucaoCorporal([
      { data: '2026-01-10', pesoKg: 80, percentualGordura: 25, massaMagraKg: 58.4 },
    ]);
    expect(r.series.find((s) => s.metrica === 'MASSA_MAGRA')?.pontos[0]?.valor).toBe(58.4);
  });

  it('numérico em texto conta igual a numérico em número', () => {
    // O PostgREST devolve `"80.00"`; o Prisma devolve 80. Se a conversão
    // falhasse, a soma viraria concatenação e o gráfico mentiria.
    const comTexto = montarEvolucaoCorporal([
      { data: '2026-01-10', pesoKg: '80.00', percentualGordura: '25.0' },
    ]);
    const comNumero = montarEvolucaoCorporal([
      { data: '2026-01-10', pesoKg: 80, percentualGordura: 25 },
    ]);
    expect(comTexto).toEqual(comNumero);
  });

  it('um ponto só não tem variação — é um retrato, não uma evolução', () => {
    const r = montarEvolucaoCorporal([{ data: '2026-01-10', pesoKg: 80 }]);
    const peso = r.series.find((s) => s.metrica === 'PESO');
    expect(peso?.variacao).toBeNull();
    expect(peso?.variacaoPercentual).toBeNull();
    expect(peso?.evoluiuBem).toBeNull();
  });

  it('a variação sai do primeiro e do último ponto', () => {
    const r = montarEvolucaoCorporal([
      { data: '2026-01-10', pesoKg: 80 },
      { data: '2026-02-10', pesoKg: 78 },
      { data: '2026-03-10', pesoKg: 76 },
    ]);
    const peso = r.series.find((s) => s.metrica === 'PESO');
    expect(peso?.primeiro).toBe(80);
    expect(peso?.ultimo).toBe(76);
    expect(peso?.variacao).toBe(-4);
    expect(peso?.variacaoPercentual).toBe(-5);
    expect(r.de).toBe('2026-01-10');
    expect(r.ate).toBe('2026-03-10');
    expect(r.totalMedicoes).toBe(3);
  });

  it('para cintura e gordura, cair é progresso', () => {
    /*
      É o que decide a cor do indicador na tela. Inverter isto pintaria de
      verde um aluno que engordou — e o profissional confia na cor antes de
      ler o número.
    */
    const r = montarEvolucaoCorporal([
      { data: '2026-01-10', cinturaCm: 95, bracoCm: 32 },
      { data: '2026-02-10', cinturaCm: 90, bracoCm: 34 },
    ]);
    expect(r.series.find((s) => s.metrica === 'CINTURA')?.evoluiuBem).toBe(true);
    expect(r.series.find((s) => s.metrica === 'BRACO')?.evoluiuBem).toBe(true);
  });

  it('subir a cintura e cair o braço são os dois ruins', () => {
    const r = montarEvolucaoCorporal([
      { data: '2026-01-10', cinturaCm: 90, bracoCm: 34 },
      { data: '2026-02-10', cinturaCm: 95, bracoCm: 32 },
    ]);
    expect(r.series.find((s) => s.metrica === 'CINTURA')?.evoluiuBem).toBe(false);
    expect(r.series.find((s) => s.metrica === 'BRACO')?.evoluiuBem).toBe(false);
  });

  it('métrica sem nenhuma medição não vira gráfico vazio', () => {
    const r = montarEvolucaoCorporal([{ data: '2026-01-10', pesoKg: 80 }]);
    expect(r.series.every((s) => s.pontos.length > 0)).toBe(true);
    expect(r.series.some((s) => s.metrica === 'QUADRIL')).toBe(false);
  });

  it('buraco no meio não vira ponto: a série pula a medição sem aquele campo', () => {
    // Pesar toda semana e medir a cintura uma vez por mês é o caso comum.
    const r = montarEvolucaoCorporal([
      { data: '2026-01-10', pesoKg: 80, cinturaCm: 95 },
      { data: '2026-01-17', pesoKg: 79 },
      { data: '2026-01-24', pesoKg: 78, cinturaCm: 92 },
    ]);
    expect(r.series.find((s) => s.metrica === 'PESO')?.pontos).toHaveLength(3);
    expect(r.series.find((s) => s.metrica === 'CINTURA')?.pontos).toHaveLength(2);
  });

  it('lista vazia não estoura', () => {
    const r = montarEvolucaoCorporal([]);
    expect(r).toEqual({ de: '', ate: '', totalMedicoes: 0, series: [] });
  });

  it('data como Date chega igual a data como texto', () => {
    // O Prisma devolve `Date`; o PostgREST devolve `"2026-01-10"`.
    expect(montarEvolucaoCorporal([{ data: new Date('2026-01-10T00:00:00Z'), pesoKg: 80 }])).toEqual(
      montarEvolucaoCorporal([{ data: '2026-01-10', pesoKg: 80 }]),
    );
  });
});
