import { describe, expect, it } from 'vitest';
import { Limitador } from './limitador';

const MINUTO = 60_000;

describe('Limitador', () => {
  it('libera enquanto está abaixo do máximo', () => {
    const l = new Limitador(3, MINUTO);
    l.registrar('ip:1', 0);
    l.registrar('ip:1', 0);
    expect(l.bloqueadoPor('ip:1', 0)).toBe(0);
  });

  it('bloqueia ao atingir o máximo e informa quanto falta', () => {
    const l = new Limitador(3, MINUTO);
    l.registrar('ip:1', 0);
    l.registrar('ip:1', 0);
    l.registrar('ip:1', 0);
    expect(l.bloqueadoPor('ip:1', 0)).toBe(60);
    expect(l.bloqueadoPor('ip:1', 30_000)).toBe(30);
  });

  it('chaves diferentes não interferem — um ataque não tranca o vizinho', () => {
    const l = new Limitador(1, MINUTO);
    l.registrar('ip:1', 0);
    expect(l.bloqueadoPor('ip:1', 0)).toBeGreaterThan(0);
    expect(l.bloqueadoPor('ip:2', 0)).toBe(0);
  });

  it('a janela expira e a contagem recomeça do zero', () => {
    const l = new Limitador(2, MINUTO);
    l.registrar('a', 0);
    l.registrar('a', 0);
    expect(l.bloqueadoPor('a', MINUTO)).toBe(0);

    l.registrar('a', MINUTO);
    expect(l.tentativas('a', MINUTO)).toBe(1);
  });

  /**
   * O ponto da janela fixa: insistir durante o bloqueio não estende a punição.
   * Com janela deslizante, quem erra a senha a cada 10s ficaria preso para
   * sempre — e quem faz isso costuma ser a pessoa dona da conta.
   */
  it('falhar durante o bloqueio não empurra o prazo para frente', () => {
    const l = new Limitador(2, MINUTO);
    l.registrar('a', 0);
    l.registrar('a', 0);
    l.registrar('a', 50_000);
    expect(l.bloqueadoPor('a', 59_000)).toBe(1);
    expect(l.bloqueadoPor('a', MINUTO)).toBe(0);
  });

  it('acertar a senha zera o histórico', () => {
    const l = new Limitador(2, MINUTO);
    l.registrar('a', 0);
    l.registrar('a', 0);
    expect(l.bloqueadoPor('a', 0)).toBeGreaterThan(0);

    l.esquecer('a');
    expect(l.bloqueadoPor('a', 0)).toBe(0);
  });

  it('não cresce sem limite quando o atacante troca de chave a cada tentativa', () => {
    const l = new Limitador(5, MINUTO, 100);
    for (let i = 0; i < 5_000; i++) l.registrar(`ip:${i}`, 0);
    expect(l['baldes'].size).toBeLessThanOrEqual(100);
  });

  it('ao podar, prefere descartar as chaves já vencidas', () => {
    const l = new Limitador(5, MINUTO, 10);
    for (let i = 0; i < 9; i++) l.registrar(`velha:${i}`, 0);

    // Passou a janela das velhas; as novas entram e as vencidas é que saem.
    for (let i = 0; i < 9; i++) l.registrar(`nova:${i}`, MINUTO + 1);

    expect(l.tentativas('nova:0', MINUTO + 1)).toBe(1);
  });
});
