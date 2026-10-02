import { describe, expect, it } from 'vitest';
import { numeroDoCampo, textoDoNumero } from './numeros';

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

describe('textoDoNumero', () => {
  it('decimal sai com vírgula, como se escreve em português', () => {
    expect(textoDoNumero(22.5)).toBe('22,5');
    expect(textoDoNumero(12.34, 2)).toBe('12,34');
  });

  it('milhar sai com ponto, e não se confunde com o decimal', () => {
    // "1.500,75" é a leitura certa; "1,500.75" é a americana, e aqui ela
    // significaria mil e quinhentos vezes menos.
    expect(textoDoNumero(1500.75, 2)).toBe('1.500,75');
    expect(textoDoNumero(1234567.8)).toBe('1.234.567,8');
  });

  it('zero casa não deixa vírgula sobrando', () => {
    expect(textoDoNumero(1500, 0)).toBe('1.500');
    expect(textoDoNumero(7, 0)).toBe('7');
  });

  it('negativo mantém o sinal e o milhar no lugar', () => {
    expect(textoDoNumero(-1234.5)).toBe('-1.234,5');
  });

  it('arredonda em vez de truncar', () => {
    expect(textoDoNumero(22.46, 1)).toBe('22,5');
    expect(textoDoNumero(0.04, 1)).toBe('0,0');
  });

  /*
    A razão de não usar `toLocaleString('pt-BR')`: o motor do aplicativo pode vir
    sem a tabela de locales, e aí ele cai calado no formato americano. Esta prova
    não depende de `Intl` nenhum.
  */
  it('não depende do Intl de quem roda', () => {
    expect(textoDoNumero(1000.5)).toBe('1.000,5');
  });

  it('o que sai volta por numeroDoCampo — ida e volta sem perda', () => {
    for (const valor of [22.5, 0.5, 1500.75, -3.25]) {
      expect(numeroDoCampo(textoDoNumero(valor, 2).replace(/\./g, ''))).toBe(valor);
    }
  });
});
