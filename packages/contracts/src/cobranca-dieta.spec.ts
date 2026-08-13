import { describe, expect, it } from 'vitest';
import {
  TOLERANCIA_APOS_REFEICAO_MIN,
  cobrancaDaDieta,
  type RefeicaoParaCobranca,
} from './cobranca-dieta';

const cafe: RefeicaoParaCobranca = { id: 'cafe', nome: 'Café da manhã', horarioSugerido: '07:00' };
const almoco: RefeicaoParaCobranca = { id: 'almoco', nome: 'Almoço', horarioSugerido: '12:30' };
const lanche: RefeicaoParaCobranca = { id: 'lanche', nome: 'Lanche da tarde', horarioSugerido: '16:00' };
const jantar: RefeicaoParaCobranca = { id: 'jantar', nome: 'Jantar', horarioSugerido: '20:00' };
const TODAS = [cafe, almoco, lanche, jantar];

/** Um relógio de hoje em `HH:MM`, para não depender da data do teste. */
const as = (hora: number, minuto = 0) => {
  const d = new Date();
  d.setHours(hora, minuto, 0, 0);
  return d;
};

describe('cobrancaDaDieta', () => {
  /*
    A regra que define tudo. Perguntar de manhã sobre o jantar ensina a
    ignorar o aviso — e aviso ignorado não cobra mais nada depois.
  */
  it('não cobra refeição cuja hora ainda não chegou', () => {
    const r = cobrancaDaDieta(TODAS, [], as(9));
    expect(r.pendentes.map((p) => p.id)).toEqual(['cafe']);
    expect(r.pendentes.some((p) => p.id === 'jantar')).toBe(false);
  });

  /*
    Almoçar 12:30 e registrar 12:31 não é como as pessoas vivem. Cobrar no
    minuto exato transforma lembrete em alarme, e alarme se desliga.
  */
  it('respeita a tolerância depois do horário', () => {
    const logoApos = cobrancaDaDieta(TODAS, ['cafe'], as(12, 45));
    expect(logoApos.pendentes).toEqual([]);

    const passadaATolerancia = cobrancaDaDieta(
      TODAS,
      ['cafe'],
      as(12, 30 + TOLERANCIA_APOS_REFEICAO_MIN + 1),
    );
    expect(passadaATolerancia.pendentes.map((p) => p.id)).toEqual(['almoco']);
  });

  it('some quando tudo foi respondido', () => {
    const r = cobrancaDaDieta(TODAS, ['cafe', 'almoco', 'lanche', 'jantar'], as(22));
    expect(r.urgencia).toBe('NADA');
    expect(r.pendentes).toEqual([]);
    expect(r.mensagem).toContain('toda registrada');
  });

  /* Duas atrasadas é o sinal de que o dia vai passar em branco. */
  it('sobe para ATRASADO com duas ou mais pendentes', () => {
    const uma = cobrancaDaDieta(TODAS, ['cafe', 'lanche'], as(22));
    expect(uma.pendentes).toHaveLength(2);
    expect(uma.urgencia).toBe('ATRASADO');

    const soUma = cobrancaDaDieta(TODAS, ['cafe', 'almoco', 'lanche'], as(22));
    expect(soUma.urgencia).toBe('LEMBRETE');
  });

  /*
    Refeição sem horário não é cobrada pelo relógio: chutar uma hora faria o
    app cobrar por algo que o nutricionista nunca prescreveu.
  */
  it('refeição sem horário não entra na cobrança por hora', () => {
    const ceia: RefeicaoParaCobranca = { id: 'ceia', nome: 'Ceia', horarioSugerido: null };
    const r = cobrancaDaDieta([...TODAS, ceia], ['cafe', 'almoco', 'lanche', 'jantar'], as(23, 59));
    expect(r.pendentes).toEqual([]);
    // Mas ela continua contando no total do dia, senão o "4 de 5" mentiria.
    expect(r.total).toBe(5);
    expect(r.respondidas).toBe(4);
  });

  /*
    "Pulei" é uma resposta tão útil quanto "fiz". Quem se sente repreendido por
    ter pulado passa a não responder nada — e aí o nutricionista fica sem os
    dois.
  */
  it('a mensagem convida a registrar o que foi pulado, sem repreender', () => {
    const r = cobrancaDaDieta(TODAS, [], as(22));
    expect(r.mensagem.toLowerCase()).toContain('pulou');
    for (const palavra of ['deveria', 'errado', 'falhou', 'não pode']) {
      expect(r.mensagem.toLowerCase()).not.toContain(palavra);
    }
  });

  it('nomeia a refeição quando é só uma', () => {
    const r = cobrancaDaDieta(TODAS, ['almoco', 'lanche', 'jantar'], as(22));
    expect(r.mensagem).toContain('café da manhã');
  });

  it('sem plano de dieta, não cobra nada', () => {
    const r = cobrancaDaDieta([], [], as(22));
    expect(r.urgencia).toBe('NADA');
    expect(r.mensagem).toBe('');
    expect(r.total).toBe(0);
  });

  it('conta as respondidas do dia inteiro, não só as atrasadas', () => {
    const r = cobrancaDaDieta(TODAS, ['cafe', 'almoco'], as(13));
    expect(r.respondidas).toBe(2);
    expect(r.total).toBe(4);
  });
});
