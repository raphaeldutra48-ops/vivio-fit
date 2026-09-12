import { describe, expect, it } from 'vitest';
import { escalarMacros, type Macros } from './nutricao';
import {
  descreverItem,
  montarReceita,
  montarRefeicaoSalva,
  type LinhaDeReceita,
} from './receitas';

/**
 * A conta da receita e da refeição salva.
 *
 * O critério de aceite da nutrição é um só: **o total tem de bater com a soma
 * dos itens**. Parece trivial e não é — a receita entra na refeição pelo macro
 * por porção, que já é um total dividido pelo rendimento, e cada divisão é uma
 * chance de o arredondamento andar para um lado só.
 *
 * Vale teste porque agora são dois consumidores lendo o mesmo banco — a API e
 * o SDK sobre o Postgres — e a mesma tela mostra os dois.
 */
const por100g = (kcal: number, p: number, c: number, g: number, f = 0): Macros => ({
  kcal,
  proteinaG: p,
  carboidratoG: c,
  gorduraG: g,
  fibraG: f,
});

/** Arroz cozido, valores da TACO arredondados. */
const ARROZ = por100g(128, 2.5, 28.1, 0.2, 1.6);
const FEIJAO = por100g(76, 4.8, 13.6, 0.5, 8.5);

const receitaDeArrozEFeijao: LinhaDeReceita = {
  id: 'r1',
  nome: 'Arroz com feijão',
  descricao: null,
  modoPreparo: null,
  rendePorcoes: 4,
  nomeDaPorcao: '1 concha',
  tempoMinutos: 40,
  ingredientes: [
    {
      id: 'i1',
      alimentoId: 'a1',
      nome: 'Arroz',
      quantidadeG: 400,
      observacao: null,
      porcao100g: ARROZ,
    },
    {
      id: 'i2',
      alimentoId: 'a2',
      nome: 'Feijão',
      quantidadeG: 200,
      observacao: null,
      porcao100g: FEIJAO,
    },
  ],
};

describe('montarReceita', () => {
  it('soma os ingredientes e divide pelo rendimento', () => {
    const r = montarReceita(receitaDeArrozEFeijao);

    // 400 g de arroz = 4 × 128; 200 g de feijão = 2 × 76.
    expect(r.macrosTotais.kcal).toBe(512 + 152);
    expect(r.macrosPorPorcao.kcal).toBe((512 + 152) / 4);
    expect(r.pesoTotalG).toBe(600);
  });

  it('o total é a soma dos itens, item a item', () => {
    const r = montarReceita(receitaDeArrozEFeijao);
    const somaDosItens = r.ingredientes.reduce((s, i) => s + i.macros.proteinaG, 0);
    expect(r.macrosTotais.proteinaG).toBeCloseTo(somaDosItens, 2);
  });

  it('rendimento zero não vira divisão por zero', () => {
    /*
      O schema já exige positivo; isto é a rede. Um `Infinity` escapando daqui
      viraria "Infinity kcal" na tela do aluno, e o plano alimentar inteiro
      passaria a mostrar NaN depois da primeira soma.
    */
    const r = montarReceita({ ...receitaDeArrozEFeijao, rendePorcoes: 0 });
    expect(Number.isFinite(r.macrosPorPorcao.kcal)).toBe(true);
    expect(r.macrosPorPorcao.kcal).toBe(r.macrosTotais.kcal);
  });

  it('receita sem ingrediente tem total zerado, e não indefinido', () => {
    const r = montarReceita({ ...receitaDeArrozEFeijao, ingredientes: [] });
    expect(r.macrosTotais).toEqual({
      kcal: 0,
      proteinaG: 0,
      carboidratoG: 0,
      gorduraG: 0,
      fibraG: 0,
    });
    expect(r.pesoTotalG).toBe(0);
  });
});

describe('montarRefeicaoSalva', () => {
  it('a receita entra por porção, não pelo total', () => {
    const refeicao = montarRefeicaoSalva({
      id: 'rf1',
      nome: 'Almoço',
      horarioSugerido: '12:00',
      observacao: null,
      itens: [
        {
          id: 'it1',
          alimentoId: null,
          receitaId: 'r1',
          quantidadeG: null,
          porcoes: 2,
          observacao: null,
          alimento: null,
          receita: receitaDeArrozEFeijao,
        },
      ],
    });

    const porPorcao = montarReceita(receitaDeArrozEFeijao).macrosPorPorcao;
    expect(refeicao.itens[0]!.macros).toEqual(escalarMacros(porPorcao, 2));
    expect(refeicao.itens[0]!.ehReceita).toBe(true);
    expect(refeicao.macrosTotais.kcal).toBe(refeicao.itens[0]!.macros.kcal);
  });

  it('alimento e receita convivem, e o total é a soma dos dois', () => {
    const refeicao = montarRefeicaoSalva({
      id: 'rf2',
      nome: 'Almoço',
      horarioSugerido: null,
      observacao: null,
      itens: [
        {
          id: 'it1',
          alimentoId: 'a1',
          receitaId: null,
          quantidadeG: 150,
          porcoes: null,
          observacao: null,
          alimento: { nome: 'Arroz', porcao100g: ARROZ },
          receita: null,
        },
        {
          id: 'it2',
          alimentoId: null,
          receitaId: 'r1',
          quantidadeG: null,
          porcoes: 1,
          observacao: null,
          alimento: null,
          receita: receitaDeArrozEFeijao,
        },
      ],
    });

    const soma = refeicao.itens.reduce((s, i) => s + i.macros.kcal, 0);
    expect(refeicao.macrosTotais.kcal).toBeCloseTo(soma, 2);
    expect(refeicao.itens[0]!.quantidadeG).toBe(150);
    expect(refeicao.itens[1]!.quantidadeG).toBeNull();
  });

  it('alimento que sumiu do catálogo não derruba a refeição', () => {
    /*
      O item aparece quebrado, com nome que a pessoa reconhece como erro. A
      alternativa seria a tela inteira não carregar por causa de uma linha — e
      o resto da refeição continua correto.
    */
    const refeicao = montarRefeicaoSalva({
      id: 'rf3',
      nome: 'Café',
      horarioSugerido: null,
      observacao: null,
      itens: [
        {
          id: 'it1',
          alimentoId: 'sumiu',
          receitaId: null,
          quantidadeG: 100,
          porcoes: null,
          observacao: null,
          alimento: null,
          receita: null,
        },
      ],
    });

    expect(refeicao.itens[0]!.nome).toBe('Item removido');
    expect(refeicao.itens[0]!.macros.kcal).toBe(0);
    expect(refeicao.macrosTotais.kcal).toBe(0);
  });

  it('a descrição do item fala a língua de quem lê', () => {
    const [porcao, gramas] = montarRefeicaoSalva({
      id: 'rf4',
      nome: 'Almoço',
      horarioSugerido: null,
      observacao: null,
      itens: [
        {
          id: 'it1',
          alimentoId: null,
          receitaId: 'r1',
          quantidadeG: null,
          porcoes: 1,
          observacao: null,
          alimento: null,
          receita: receitaDeArrozEFeijao,
        },
        {
          id: 'it2',
          alimentoId: 'a1',
          receitaId: null,
          quantidadeG: 150,
          porcoes: null,
          observacao: null,
          alimento: { nome: 'Arroz', porcao100g: ARROZ },
          receita: null,
        },
      ],
    }).itens;

    expect(descreverItem(porcao!)).toBe('1 porção');
    expect(descreverItem(gramas!)).toBe('150 g');
  });
});
