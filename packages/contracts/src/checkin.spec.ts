import { describe, expect, it } from 'vitest';
import { registrarCheckinSchema } from './checkin';

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
