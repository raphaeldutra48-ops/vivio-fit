import { describe, expect, it } from 'vitest';
import {
  PONTUACAO_MINIMA_PARA_SUGERIR,
  deveSugerir,
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

  /*
    A dieta escreve no plural, a tabela cataloga no singular. Com o catálogo
    completo isto apontava "ovos inteiros mexidos" para "Macarrão com ovos" —
    o único item que por acaso escrevia no plural.
  */
  it('plural da dieta casa com singular do catálogo', () => {
    expect(pontuarCandidato('ovos inteiros', 'Ovo de galinha inteiro cozido')).toBeGreaterThanOrEqual(
      PONTUACAO_MINIMA_PARA_SUGERIR,
    );
    expect(pontuarCandidato('folhas', 'Alface crespa folha crua')).toBeGreaterThan(0);
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

/**
 * Quando NÃO sugerir.
 *
 * As duas razões vêm de erros diferentes: sugerir algo fraco e sugerir um
 * entre iguais. A segunda só apareceu com o catálogo completo — e é a pior das
 * duas, porque a sugestão chega com pontuação alta e cara de conferida.
 */
describe('deveSugerir', () => {
  it('sugere o campeão isolado acima do corte', () => {
    expect(deveSugerir([0.95, 0.5])).toBe(true);
    expect(deveSugerir([1])).toBe(true);
  });

  it('não sugere abaixo do corte', () => {
    expect(deveSugerir([0.5, 0.33])).toBe(false);
  });

  /*
    "azeite" casa igual com "Azeite de oliva" e "Azeite de dendê" — gorduras
    completamente diferentes. O desempate era alfabético, então o dendê vinha
    pré-selecionado. Quem sabe qual era é quem escreveu o documento.
  */
  it('não sugere quando o topo empata', () => {
    expect(deveSugerir([0.95, 0.95])).toBe(false);
    expect(deveSugerir([1, 1, 0.5])).toBe(false);
  });

  it('sem candidato não sugere', () => {
    expect(deveSugerir([])).toBe(false);
  });
});
