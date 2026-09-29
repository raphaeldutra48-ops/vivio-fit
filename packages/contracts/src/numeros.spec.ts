import { describe, expect, it } from 'vitest';
import { numeroDoCampo } from './numeros';

/**
 * A conversão que decide se o treino salva.
 *
 * Todo caso aqui é um jeito de alguém digitar de verdade num teclado de celular
 * no meio de uma série, e o que se prova é que nenhum deles produz `NaN` — o
 * valor que atravessa a tela calada, vira `null` no JSON e só aparece como
 * "não foi possível salvar" depois do treino inteiro.
 */
describe('numeroDoCampo', () => {
  it('aceita vírgula, que é como se escreve decimal em português', () => {
    // O teclado decimal do Brasil oferece vírgula. `Number('22,5')` é NaN.
    expect(numeroDoCampo('22,5')).toBe(22.5);
  });

  it('aceita ponto também, para quem tem teclado em inglês', () => {
    expect(numeroDoCampo('22.5')).toBe(22.5);
  });

  it('campo vazio é null, e não zero', () => {
    /*
      A distinção que o resto do sistema precisa: zero é um valor que alguém
      escolheu, vazio é a ausência de escolha. Trocar um pelo outro grava série
      com 0 kg como se a pessoa tivesse levantado a barra vazia.
    */
    expect(numeroDoCampo('')).toBeNull();
    expect(numeroDoCampo('   ')).toBeNull();
    expect(numeroDoCampo(undefined)).toBeNull();
  });

  it('texto ilegível é null, e nunca NaN', () => {
    expect(numeroDoCampo('abc')).toBeNull();
    expect(numeroDoCampo('12kg')).toBeNull();
    // Duas vírgulas: acontece ao corrigir o número sem apagar a anterior.
    expect(numeroDoCampo('22,,5')).toBeNull();
  });

  it('zero digitado é zero, e não some', () => {
    expect(numeroDoCampo('0')).toBe(0);
    expect(numeroDoCampo('0,0')).toBe(0);
  });

  it('espaço em volta não atrapalha', () => {
    // Colar de outro lugar traz espaço, e o teclado de alguns aparelhos também.
    expect(numeroDoCampo(' 80 ')).toBe(80);
  });

  it('infinito não passa: é número, mas não é peso nem repetição', () => {
    expect(numeroDoCampo('Infinity')).toBeNull();
    expect(numeroDoCampo('1e999')).toBeNull();
  });
});
