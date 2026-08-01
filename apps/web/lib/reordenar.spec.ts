import { describe, expect, it } from 'vitest';
import { anuncioDeMovimento, reordenar } from './reordenar';

const lista = ['a', 'b', 'c', 'd', 'e'];

describe('reordenar', () => {
  it('leva um item lá de baixo para o topo sem embaralhar o resto', () => {
    // Uma troca de pares devolveria ['e','b','c','d','a'] — o erro que a
    // função existe para não cometer.
    expect(reordenar(lista, 4, 0)).toEqual(['e', 'a', 'b', 'c', 'd']);
  });

  it('leva do topo para o fim', () => {
    expect(reordenar(lista, 0, 4)).toEqual(['b', 'c', 'd', 'e', 'a']);
  });

  it('vizinhos: é a mesma coisa que trocar — é o que os botões ↑ ↓ fazem', () => {
    expect(reordenar(lista, 2, 1)).toEqual(['a', 'c', 'b', 'd', 'e']);
    expect(reordenar(lista, 2, 3)).toEqual(['a', 'b', 'd', 'c', 'e']);
  });

  it('soltar no mesmo lugar não muda nada e devolve o mesmo array', () => {
    expect(reordenar(lista, 2, 2)).toBe(lista);
  });

  it('destino fora da lista encosta na ponta em vez de ignorar o gesto', () => {
    expect(reordenar(lista, 0, 99)).toEqual(['b', 'c', 'd', 'e', 'a']);
    expect(reordenar(lista, 4, -3)).toEqual(['e', 'a', 'b', 'c', 'd']);
  });

  it('origem inválida não corrompe a lista', () => {
    expect(reordenar(lista, 9, 0)).toBe(lista);
    expect(reordenar(lista, -1, 0)).toBe(lista);
  });

  it('não altera o array original', () => {
    const original = [...lista];
    reordenar(lista, 0, 3);
    expect(lista).toEqual(original);
  });

  it('lista de um item só sobrevive', () => {
    expect(reordenar(['único'], 0, 1)).toEqual(['único']);
  });
});

describe('anuncioDeMovimento', () => {
  it('diz onde o item foi parar, em posição humana (1-based)', () => {
    expect(anuncioDeMovimento('Supino reto', 2, 5)).toBe(
      'Supino reto movido para a posição 2 de 5.',
    );
  });
});
