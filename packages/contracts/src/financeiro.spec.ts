import { describe, expect, it } from 'vitest';
import { formatarDinheiro, paraCentavos } from './financeiro';

describe('paraCentavos', () => {
  it('aceita o formato brasileiro', () => {
    expect(paraCentavos('149,90')).toBe(14990);
    expect(paraCentavos('1.234,56')).toBe(123456);
    expect(paraCentavos('R$ 89,90')).toBe(8990);
    expect(paraCentavos('R$ 1.500,00')).toBe(150000);
  });

  it('aceita ponto como decimal, que é como o teclado numérico digita', () => {
    expect(paraCentavos('149.90')).toBe(14990);
    expect(paraCentavos('89.9')).toBe(8990);
  });

  it('aceita inteiro sem centavos', () => {
    expect(paraCentavos('150')).toBe(15000);
    expect(paraCentavos('1.500')).toBe(150000);
  });

  /** Arredondar errado aqui vira diferença de um centavo no fechamento do mês. */
  it('arredonda em vez de truncar', () => {
    expect(paraCentavos('0,015')).toBe(2);
    expect(paraCentavos('10,999')).toBe(1100);
  });

  it('recusa o que não é dinheiro', () => {
    expect(paraCentavos('')).toBeNull();
    expect(paraCentavos('abc')).toBeNull();
    expect(paraCentavos('0')).toBeNull();
    expect(paraCentavos('-50')).toBeNull();
  });
});

describe('formatarDinheiro', () => {
  it('formata em real, com vírgula decimal', () => {
    expect(formatarDinheiro(14990).replace(/ /g, ' ')).toBe('R$ 149,90');
    expect(formatarDinheiro(0).replace(/ /g, ' ')).toBe('R$ 0,00');
    expect(formatarDinheiro(100000).replace(/ /g, ' ')).toBe('R$ 1.000,00');
  });

  /** Ida e volta precisa fechar: é o valor que o profissional confere. */
  it('formatar e converter de volta dá o mesmo valor', () => {
    for (const centavos of [1, 99, 14990, 123456, 100000000]) {
      expect(paraCentavos(formatarDinheiro(centavos))).toBe(centavos);
    }
  });
});
