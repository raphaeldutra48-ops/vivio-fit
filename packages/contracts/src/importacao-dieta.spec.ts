import { describe, expect, it } from 'vitest';
import {
  PONTUACAO_MINIMA_PARA_SUGERIR,
  normalizarParaBusca,
  palavrasSignificativas,
  pontuarCandidato,
} from './importacao-dieta';

/**
 * O casamento entre o que a dieta diz e o que o catálogo tem.
 *
 * É aqui que a importação acerta ou erra. A leitura do documento é feita pelo
 * modelo; a decisão de qual alimento é qual acontece neste arquivo, sobre dado
 * que o servidor conhece — e é a parte que dá para provar sem depender de rede.
 */

describe('normalizarParaBusca', () => {
  it('tira acento, caixa e pontuação', () => {
    expect(normalizarParaBusca('Arroz Branco, Cozido')).toBe('arroz branco cozido');
    expect(normalizarParaBusca('Feijão-Preto')).toBe('feijao preto');
    expect(normalizarParaBusca('  Açúcar   mascavo ')).toBe('acucar mascavo');
  });

  /* O documento é escrito por gente: espaço duplo e maiúscula solta são a regra. */
  it('duas escritas do mesmo alimento chegam ao mesmo texto', () => {
    expect(normalizarParaBusca('PÃO integral')).toBe(normalizarParaBusca('pao Integral'));
  });
});

describe('palavrasSignificativas', () => {
  it('descarta preposição e palavra curta', () => {
    expect(palavrasSignificativas('peito de frango grelhado')).toEqual([
      'peito',
      'frango',
      'grelhado',
    ]);
  });
});

describe('pontuarCandidato', () => {
  it('nome idêntico vale 1', () => {
    expect(pontuarCandidato('Arroz branco cozido', 'arroz branco, cozido')).toBe(1);
  });

  /*
    O caso comum da vida real: a nutri escreve curto, o catálogo é específico.
    Tem de casar forte, senão a importação exige escolha manual em toda linha.
  */
  it('o que foi lido cabendo inteiro no catálogo pontua alto', () => {
    const p = pontuarCandidato('arroz', 'Arroz branco cozido');
    expect(p).toBeGreaterThanOrEqual(PONTUACAO_MINIMA_PARA_SUGERIR);
    // Mas não 1: "arroz" também caberia em "arroz integral".
    expect(p).toBeLessThan(1);
  });

  /*
    O denominador é o texto LIDO. Se fosse o do catálogo, um alimento de nome
    longo e específico seria punido justamente por ser preciso.
  */
  it('nome longo no catálogo não é punido por ser específico', () => {
    const curto = pontuarCandidato('frango', 'Frango');
    const longo = pontuarCandidato('frango', 'Peito de frango grelhado sem pele');
    expect(longo).toBeGreaterThanOrEqual(PONTUACAO_MINIMA_PARA_SUGERIR);
    expect(curto).toBeGreaterThanOrEqual(longo);
  });

  it('alimento diferente pontua abaixo do corte', () => {
    expect(pontuarCandidato('arroz branco', 'Feijão preto')).toBeLessThan(
      PONTUACAO_MINIMA_PARA_SUGERIR,
    );
  });

  /*
    O par que mais aparece junto numa dieta brasileira. Confundir os dois troca
    o macro inteiro da refeição, então tem de ficar longe do corte.
  */
  it('arroz não casa com feijão', () => {
    expect(pontuarCandidato('arroz', 'Feijão carioca cozido')).toBe(0);
  });

  it('texto sem palavra significativa não pontua', () => {
    expect(pontuarCandidato('de', 'Arroz branco')).toBe(0);
    expect(pontuarCandidato('', 'Arroz branco')).toBe(0);
  });

  /* Integral e branco são o mesmo alimento com macro diferente. */
  it('distingue variações que mudam o macro', () => {
    const integral = pontuarCandidato('arroz integral', 'Arroz integral cozido');
    const branco = pontuarCandidato('arroz integral', 'Arroz branco cozido');
    expect(integral).toBeGreaterThan(branco);
  });
});
