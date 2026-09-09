import { describe, expect, it } from 'vitest';
import {
  macrosDaPorcao,
  montarPlanoDietaCompleto,
  montarSubstitutos,
  quantidadeEquivalentePorKcal,
  somarMacros,
  type AlimentoResumo,
  type LinhaDePlanoDieta,
  type Macros,
} from './nutricao';

/**
 * A conta nutricional, sem banco no meio.
 *
 * O critério que sustenta a nutrição inteira é um só: o total tem de bater com
 * a soma dos itens. Um erro aqui não dá erro em lugar nenhum — mostra um
 * cardápio que fecha na tela e não fecha na vida.
 */
const alimento = (
  id: string,
  kcal: number,
  proteinaG: number,
  extras: Partial<Macros> = {},
): AlimentoResumo => ({
  id,
  nome: id,
  grupo: 'Cereais',
  porcao100g: {
    kcal,
    proteinaG,
    carboidratoG: extras.carboidratoG ?? 0,
    gorduraG: extras.gorduraG ?? 0,
    fibraG: extras.fibraG ?? 0,
  },
  medidaCaseira: null,
  medidaGramas: null,
});

describe('macrosDaPorcao', () => {
  const arroz = alimento('arroz', 130, 2.5, { carboidratoG: 28, gorduraG: 0.2, fibraG: 1.6 });

  it('100 g é a tabela como ela está', () => {
    expect(macrosDaPorcao(arroz.porcao100g, 100)).toEqual(arroz.porcao100g);
  });

  it('regra de três, com duas casas', () => {
    /*
      Duas casas para o erro de ponto flutuante não se acumular item a item: a
      dieta tem dezenas deles, e um centésimo por item vira caloria no total.
    */
    expect(macrosDaPorcao(arroz.porcao100g, 150)).toEqual({
      kcal: 195,
      proteinaG: 3.75,
      carboidratoG: 42,
      gorduraG: 0.3,
      fibraG: 2.4,
    });
  });

  it('quantidade zero é um item que não conta, não um item quebrado', () => {
    expect(macrosDaPorcao(arroz.porcao100g, 0).kcal).toBe(0);
  });
});

describe('somarMacros', () => {
  it('lista vazia soma zero', () => {
    // É o estado da refeição recém-criada, antes do primeiro alimento.
    expect(somarMacros([])).toEqual({
      kcal: 0,
      proteinaG: 0,
      carboidratoG: 0,
      gorduraG: 0,
      fibraG: 0,
    });
  });

  it('soma sem arrastar erro de ponto flutuante', () => {
    const um: Macros = { kcal: 0.1, proteinaG: 0.2, carboidratoG: 0, gorduraG: 0, fibraG: 0 };
    const total = somarMacros([um, um, um]);
    // 0.1 + 0.1 + 0.1 dá 0.30000000000000004 em ponto flutuante puro.
    expect(total.kcal).toBe(0.3);
    expect(total.proteinaG).toBe(0.6);
  });
});

describe('quantidadeEquivalentePorKcal', () => {
  it('quanto comer para bater as calorias', () => {
    expect(quantidadeEquivalentePorKcal(130, 160)).toBe(81.25);
  });

  it('alimento sem caloria não tem equivalente', () => {
    // Água e chá zerariam a divisão. `null` diz "não existe", e não "coma 0 g".
    expect(quantidadeEquivalentePorKcal(130, 0)).toBeNull();
  });
});

describe('montarSubstitutos', () => {
  const original = macrosDaPorcao(alimento('arroz', 130, 2.5).porcao100g, 100);

  it('parecido em proteína entra; iso-calórico e diferente, não', () => {
    /*
      Trocar arroz por frango "bate as calorias" e destrói a dieta: 79 g de
      frango dão os mesmos 130 kcal e 24 g de proteína no lugar de 2,5.
    */
    const r = montarSubstitutos({
      original,
      candidatos: [alimento('macarrao', 160, 3), alimento('frango', 165, 31)],
      tolerancia: 0.1,
      limit: 8,
    });
    expect(r.map((s) => s.alimento.id)).toEqual(['macarrao']);
    expect(r[0]!.quantidadeEquivalenteG).toBe(81.25);
    expect(r[0]!.macros.kcal).toBe(130);
  });

  it('o mais parecido vem primeiro', () => {
    // A primeira sugestão é a que o nutricionista aceita sem pensar.
    const r = montarSubstitutos({
      original,
      candidatos: [alimento('quase', 140, 2.68), alimento('igualzinho', 130, 2.5)],
      tolerancia: 0.2,
      limit: 8,
    });
    expect(r[0]!.alimento.id).toBe('igualzinho');
    expect(Math.abs(r[0]!.desvioProteina)).toBeLessThan(Math.abs(r[1]!.desvioProteina));
  });

  it('sugestão que ninguém consegue comer não é sugestão', () => {
    // Alface a 15 kcal/100 g precisaria de quase 900 g para bater um prato de
    // arroz; um alimento de 1 kcal passaria de 2 kg.
    const r = montarSubstitutos({
      original,
      candidatos: [alimento('quase-agua', 1, 0.1)],
      tolerancia: 1,
      limit: 8,
    });
    expect(r).toEqual([]);
  });

  it('item sem caloria não tem substituto nenhum', () => {
    const r = montarSubstitutos({
      original: { kcal: 0, proteinaG: 0, carboidratoG: 0, gorduraG: 0, fibraG: 0 },
      candidatos: [alimento('macarrao', 160, 3)],
      tolerancia: 0.5,
      limit: 8,
    });
    expect(r).toEqual([]);
  });
});

describe('montarPlanoDietaCompleto', () => {
  const plano: LinhaDePlanoDieta = {
    id: 'd1',
    nome: 'Dieta',
    observacao: null,
    versao: 1,
    status: 'ATIVO',
    kcalAlvo: 2000,
    proteinaAlvoG: null,
    carboAlvoG: null,
    gorduraAlvoG: null,
    nutricionista: { id: 'n1', nome: 'Nutri' },
    refeicoes: [
      {
        id: 'r2',
        nome: 'Almoço',
        horarioSugerido: null,
        ordem: 1,
        itens: [
          {
            id: 'i2',
            ordem: 1,
            quantidadeG: 150,
            observacao: null,
            alimento: alimento('frango', 165, 31),
          },
          {
            id: 'i1',
            ordem: 0,
            quantidadeG: 100,
            observacao: null,
            alimento: alimento('arroz', 130, 2.5),
          },
        ],
      },
      {
        id: 'r1',
        nome: 'Café',
        horarioSugerido: '08:00',
        ordem: 0,
        itens: [
          {
            id: 'i0',
            ordem: 0,
            quantidadeG: 50,
            observacao: null,
            alimento: alimento('pao', 300, 9),
          },
        ],
      },
    ],
  };

  it('o total é a soma dos itens, e não um campo à parte', () => {
    /*
      Guardado, ele envelheceria no primeiro ajuste de quantidade — e o
      nutricionista veria um alvo batendo com um cardápio que já não bate.
    */
    const d = montarPlanoDietaCompleto(plano);
    // 150 g de frango (247,5) + 100 g de arroz (130) + 50 g de pão (150).
    expect(d.macrosTotais.kcal).toBe(527.5);
    expect(d.refeicoes.find((r) => r.nome === 'Almoço')!.macros.kcal).toBe(377.5);
    expect(d.totalRefeicoes).toBe(2);
  });

  it('refeições e itens saem na ordem do cardápio', () => {
    // A ordem é a do dia: café antes do almoço, e dentro dele o que vem
    // primeiro no prato. Embaralhada, a tela vira uma lista sem sentido.
    const d = montarPlanoDietaCompleto(plano);
    expect(d.refeicoes.map((r) => r.nome)).toEqual(['Café', 'Almoço']);
    expect(d.refeicoes[1]!.itens.map((i) => i.id)).toEqual(['i1', 'i2']);
  });

  it('dieta sem refeição soma zero, e não quebra', () => {
    const d = montarPlanoDietaCompleto({ ...plano, refeicoes: [] });
    expect(d.macrosTotais.kcal).toBe(0);
    expect(d.totalRefeicoes).toBe(0);
  });
});
