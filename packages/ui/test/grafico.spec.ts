import { describe, expect, it } from 'vitest';
import {
  calcularGeometria,
  faixaVertical,
  indicesComRotulo,
  proporcoesDeBarra,
  variacaoPercentual,
  type PontoDoGrafico,
} from '../src/grafico';

/**
 * A matemática do gráfico.
 *
 * Vale testar porque as falhas daqui são invisíveis: `NaN` num atributo de SVG
 * não gera erro, não aparece no console e não quebra o build — a linha
 * simplesmente não é desenhada, e a tela fica com um retângulo vazio que
 * parece "sem dados".
 */

const ponto = (data: string, valor: number): PontoDoGrafico => ({ data, valor });

describe('faixaVertical', () => {
  /*
    O caso que quebra tudo: peso igual em duas pesagens. Sem tratamento,
    `maximo - minimo` é zero e toda coordenada vira NaN.
  */
  it('série constante abre faixa artificial em vez de dividir por zero', () => {
    const { baixo, alto } = faixaVertical([80, 80, 80]);
    expect(alto).toBeGreaterThan(baixo);
    expect(Number.isFinite(baixo)).toBe(true);
    expect(Number.isFinite(alto)).toBe(true);
  });

  /*
    Escala começando no zero achata a curva: 78→81 kg num eixo de 0 a 81 é uma
    reta, e a variação de 3 kg — que é o que a pessoa quer ver — some.
  */
  it('não começa no zero: usa o intervalo real com folga', () => {
    const { baixo, alto } = faixaVertical([78, 79, 81]);
    expect(baixo).toBeGreaterThan(0);
    expect(baixo).toBeLessThan(78);
    expect(alto).toBeGreaterThan(81);
  });

  it('lista vazia devolve faixa utilizável', () => {
    const { baixo, alto } = faixaVertical([]);
    expect(alto).toBeGreaterThan(baixo);
  });

  /* Percentual de gordura, déficit calórico: negativo é dado válido. */
  it('aguenta valores negativos', () => {
    const { baixo, alto } = faixaVertical([-5, -2, -8]);
    expect(baixo).toBeLessThan(-8);
    expect(alto).toBeGreaterThan(-2);
  });
});

describe('calcularGeometria', () => {
  it('sem pontos não devolve geometria', () => {
    expect(calcularGeometria([], 300, 170)).toBeNull();
  });

  /* Um ponto só dividiria por (length - 1) = 0. */
  it('ponto único fica no meio, sem NaN', () => {
    const g = calcularGeometria([ponto('2026-08-01', 80)], 300, 170)!;
    expect(g.coords).toHaveLength(1);
    expect(Number.isFinite(g.coords[0]!.x)).toBe(true);
    expect(Number.isFinite(g.coords[0]!.y)).toBe(true);
    expect(g.linha).not.toContain('NaN');
  });

  it('nenhuma coordenada vira NaN em série constante', () => {
    const g = calcularGeometria(
      [ponto('2026-08-01', 80), ponto('2026-08-08', 80), ponto('2026-08-15', 80)],
      300,
      170,
    )!;
    expect(g.linha).not.toContain('NaN');
    expect(g.area).not.toContain('NaN');
    for (const c of g.coords) expect(Number.isFinite(c.y)).toBe(true);
  });

  /* Y cresce para baixo no SVG: valor maior tem y MENOR. */
  it('valor maior fica mais alto na tela', () => {
    const g = calcularGeometria(
      [ponto('2026-08-01', 70), ponto('2026-08-08', 90)],
      300,
      170,
    )!;
    expect(g.coords[1]!.y).toBeLessThan(g.coords[0]!.y);
  });

  it('a área fecha na base, para o gradiente não vazar', () => {
    const g = calcularGeometria([ponto('a', 1), ponto('b', 2)], 300, 170)!;
    expect(g.area.endsWith('Z')).toBe(true);
  });

  /* Largura menor que as margens não pode gerar comprimento negativo. */
  it('largura minúscula não gera coordenada negativa', () => {
    const g = calcularGeometria([ponto('a', 1), ponto('b', 2)], 4, 10)!;
    for (const c of g.coords) {
      expect(Number.isFinite(c.x)).toBe(true);
      expect(Number.isFinite(c.y)).toBe(true);
    }
  });
});

describe('indicesComRotulo', () => {
  it('poucos pontos: todos recebem rótulo', () => {
    expect(indicesComRotulo(3)).toEqual([0, 1, 2]);
  });

  /* Doze datas embaixo do gráfico viram borrão. */
  it('muitos pontos: começo, fim e alguns no meio', () => {
    const r = indicesComRotulo(12, 4);
    expect(r[0]).toBe(0);
    expect(r[r.length - 1]).toBe(11);
    expect(r.length).toBeLessThanOrEqual(4);
  });

  it('não repete índice', () => {
    const r = indicesComRotulo(5, 4);
    expect(new Set(r).size).toBe(r.length);
  });

  it('zero pontos não gera rótulo', () => {
    expect(indicesComRotulo(0)).toEqual([]);
  });
});

describe('variacaoPercentual', () => {
  it('calcula a variação entre o primeiro e o último', () => {
    expect(variacaoPercentual([ponto('a', 100), ponto('b', 110)])).toBeCloseTo(10);
    expect(variacaoPercentual([ponto('a', 100), ponto('b', 90)])).toBeCloseTo(-10);
  });

  it('um ponto só não tem variação', () => {
    expect(variacaoPercentual([ponto('a', 100)])).toBeNull();
  });

  /* Dividir por zero daria Infinity, e "subiu ∞%" não informa nada. */
  it('partindo de zero devolve null em vez de infinito', () => {
    expect(variacaoPercentual([ponto('a', 0), ponto('b', 50)])).toBeNull();
  });

  /* Partindo de negativo, o sinal do denominador inverteria a direção. */
  it('partindo de negativo, subir ainda é positivo', () => {
    expect(variacaoPercentual([ponto('a', -10), ponto('b', -5)])).toBeCloseTo(50);
  });
});

describe('proporcoesDeBarra', () => {
  /*
    A comparação é o ponto do gráfico de barras. Se cada barra fosse
    normalizada pela própria meta, três barras cheias significariam coisas
    diferentes e a leitura visual mentiria.
  */
  it('escala pelo maior da série, não por barra', () => {
    expect(proporcoesDeBarra([50, 100, 25])).toEqual([0.5, 1, 0.25]);
  });

  it('tudo zero não vira divisão por zero', () => {
    expect(proporcoesDeBarra([0, 0])).toEqual([0, 0]);
  });

  it('negativo é tratado como zero, não como barra invertida', () => {
    expect(proporcoesDeBarra([-10, 100])).toEqual([0, 1]);
  });

  it('lista vazia não quebra', () => {
    expect(proporcoesDeBarra([])).toEqual([]);
  });
});
