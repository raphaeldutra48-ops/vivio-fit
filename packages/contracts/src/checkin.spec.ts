import { describe, expect, it } from 'vitest';
import { dataLocalDoCheckin, registrarCheckinSchema } from './checkin';

describe('dataLocalDoCheckin', () => {
  it('devolve o dia do relógio local, com zero à esquerda', () => {
    expect(dataLocalDoCheckin(new Date(2026, 7, 9, 14, 0))).toBe('2026-08-09');
    expect(dataLocalDoCheckin(new Date(2026, 0, 5, 8, 30))).toBe('2026-01-05');
  });

  /*
    O motivo de a função existir. Às 22h de 9 de agosto no horário de Brasília
    (UTC-3), `toISOString()` já está em 10 de agosto — e o check-in de quem
    registra antes de dormir cairia no dia seguinte, deixando hoje como dia
    sem registro no alerta de adesão do personal.
  */
  it('não pula para o dia seguinte à noite', () => {
    const noiteDeNove = new Date(2026, 7, 9, 22, 30);
    expect(dataLocalDoCheckin(noiteDeNove)).toBe('2026-08-09');
    expect(dataLocalDoCheckin(noiteDeNove)).not.toBe(noiteDeNove.toISOString().slice(0, 10));
  });

  it('nem volta um dia de madrugada', () => {
    expect(dataLocalDoCheckin(new Date(2026, 7, 9, 0, 15))).toBe('2026-08-09');
  });

  it('o formato passa no schema que o servidor exige', () => {
    const corpo = {
      data: dataLocalDoCheckin(new Date(2026, 10, 3, 23, 59)),
      treinou: true,
      energia: 4,
    };
    expect(registrarCheckinSchema.safeParse(corpo).success).toBe(true);
  });
});

describe('registrarCheckinSchema', () => {
  const base = { data: '2026-08-09', treinou: false, energia: 3 };

  /*
    "Não treinei" é o registro mais valioso do check-in: é a ausência que
    antecede a desistência, e é ela que o alerta consome.
  */
  it('não ter treinado é um check-in válido', () => {
    expect(registrarCheckinSchema.safeParse(base).success).toBe(true);
  });

  it('energia fora de 1 a 5 é recusada', () => {
    expect(registrarCheckinSchema.safeParse({ ...base, energia: 0 }).success).toBe(false);
    expect(registrarCheckinSchema.safeParse({ ...base, energia: 6 }).success).toBe(false);
  });

  it('data em outro formato é recusada', () => {
    expect(registrarCheckinSchema.safeParse({ ...base, data: '09/08/2026' }).success).toBe(false);
    expect(registrarCheckinSchema.safeParse({ ...base, data: '2026-08-09T10:00:00Z' }).success).toBe(
      false,
    );
  });

  it('dor sem local continua válida — nem todo mundo sabe apontar', () => {
    expect(registrarCheckinSchema.safeParse({ ...base, teveDor: true }).success).toBe(true);
  });
});
