import { describe, expect, it } from 'vitest';
import { EXERCICIOS_GLOBAIS } from './exercicios-globais';
import { PASSOS_EXERCICIOS } from './passos-exercicios';

/**
 * Mesmo risco do mapa do wger: a ligação é por **nome**, e um nome escrito
 * diferente não quebra nada — o exercício simplesmente fica sem passos, para
 * sempre, sem ninguém perceber.
 */
describe('passos por exercício', () => {
  const nossosNomes = new Set(EXERCICIOS_GLOBAIS.map(([nome]) => nome));

  it('todo nome existe no catálogo, escrito igual', () => {
    for (const nome of Object.keys(PASSOS_EXERCICIOS)) {
      expect(nossosNomes.has(nome), `"${nome}" não está em EXERCICIOS_GLOBAIS`).toBe(true);
    }
  });

  /*
    Quatro é o mínimo para ensinar um movimento: montagem, descida, subida e o
    erro a evitar. Menos que isso não é passo a passo, é a linha única repetida
    em formato de lista.
  */
  it('nenhum exercício tem passo a passo raso demais', () => {
    for (const [nome, passos] of Object.entries(PASSOS_EXERCICIOS)) {
      expect(passos.length, `${nome}`).toBeGreaterThanOrEqual(4);
      expect(passos.length, `${nome} — mais que 8 passos ninguém lê`).toBeLessThanOrEqual(8);
    }
  });

  it('todo passo é uma frase completa', () => {
    for (const [nome, passos] of Object.entries(PASSOS_EXERCICIOS)) {
      passos.forEach((p, i) => {
        expect(p.length, `${nome} passo ${i + 1}`).toBeGreaterThan(20);
        expect(p.trim().endsWith('.'), `${nome} passo ${i + 1} sem ponto final`).toBe(true);
      });
    }
  });

  /*
    O passo a passo não pode repetir a instrução de uma linha: elas servem a
    momentos diferentes (aprender x lembrar), e conteúdo igual nos dois lugares
    é sinal de que um deles foi escrito no automático.
  */
  it('os passos não são a instrução de uma linha copiada', () => {
    const instrucaoPorNome = new Map(EXERCICIOS_GLOBAIS.map(([nome, , , inst]) => [nome, inst]));

    for (const [nome, passos] of Object.entries(PASSOS_EXERCICIOS)) {
      const instrucao = instrucaoPorNome.get(nome)!;
      expect(passos.some((p) => p === instrucao), `${nome}`).toBe(false);
    }
  });

  /** Cobertura é parcial de propósito, mas zero significaria arquivo quebrado. */
  it('cobre pelo menos os exercícios mais comuns', () => {
    expect(Object.keys(PASSOS_EXERCICIOS).length).toBeGreaterThanOrEqual(15);
  });
});
