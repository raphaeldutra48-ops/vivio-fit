import { describe, expect, it } from 'vitest';
import {
  montarModeloCardapioCompleto,
  planoAPartirDoModelo,
  type LinhaDeModeloCardapio,
} from './cardapios';
import type { AlimentoResumo } from './nutricao';

/**
 * O molde de cardápio, sem banco no meio.
 *
 * Mesma regra da dieta: o total é a soma dos itens, nunca um campo. Um molde
 * cujo total não bate é aplicado em vários pacientes antes de alguém notar.
 */
const alimento = (id: string, kcal: number, medidaCaseira: string | null = null): AlimentoResumo => ({
  id,
  nome: id,
  grupo: 'Prova',
  porcao100g: { kcal, proteinaG: 10, carboidratoG: 20, gorduraG: 5, fibraG: 2 },
  medidaCaseira,
  medidaGramas: null,
});

const molde: LinhaDeModeloCardapio = {
  id: 'm1',
  nome: 'Molde',
  descricao: null,
  kcalAlvo: 1800,
  proteinaAlvoG: null,
  carboAlvoG: null,
  gorduraAlvoG: null,
  criadoEm: '2026-05-01T10:00:00.000Z',
  refeicoes: [
    {
      id: 'r2',
      nome: 'Lanche',
      horarioSugerido: null,
      ordem: 1,
      itens: [
        { id: 'i2', ordem: 0, quantidadeG: 50, observacao: null, alimento: alimento('banana', 90) },
      ],
    },
    {
      id: 'r1',
      nome: 'Café',
      horarioSugerido: '07:30',
      ordem: 0,
      itens: [
        {
          id: 'i1',
          ordem: 0,
          quantidadeG: 40,
          observacao: 'Com leite',
          alimento: alimento('aveia', 390, '2 colheres'),
        },
      ],
    },
  ],
};

describe('montarModeloCardapioCompleto', () => {
  it('o total é a soma dos itens, e as refeições saem em ordem', () => {
    const m = montarModeloCardapioCompleto(molde);
    expect(m.refeicoes.map((r) => r.nome)).toEqual(['Café', 'Lanche']);
    // 40 g de aveia (156) + 50 g de banana (45).
    expect(m.macrosTotais.kcal).toBe(201);
    expect(m.totalRefeicoes).toBe(2);
  });

  it('o item leva a medida caseira, que é como o nutricionista reconhece a linha', () => {
    const m = montarModeloCardapioCompleto(molde);
    expect(m.refeicoes[0]!.itens[0]!.alimento.medidaCaseira).toBe('2 colheres');
    expect(m.refeicoes[0]!.itens[0]!.observacao).toBe('Com leite');
  });

  it('molde sem refeição soma zero, e não quebra', () => {
    const m = montarModeloCardapioCompleto({ ...molde, refeicoes: [] });
    expect(m.macrosTotais.kcal).toBe(0);
    expect(m.totalRefeicoes).toBe(0);
  });
});

describe('planoAPartirDoModelo', () => {
  const completo = montarModeloCardapioCompleto(molde);

  it('copia o cardápio inteiro, e o nome dito vence o do molde', () => {
    const plano = planoAPartirDoModelo(completo, { nome: 'Dieta da Ana', ativar: true });
    expect(plano.nome).toBe('Dieta da Ana');
    expect(plano.ativar).toBe(true);
    expect(plano.kcalAlvo).toBe(1800);
    expect(plano.refeicoes.map((r) => r.nome)).toEqual(['Café', 'Lanche']);
    expect(plano.refeicoes[0]!.itens[0]).toEqual({
      alimentoId: 'aveia',
      quantidadeG: 40,
      observacao: 'Com leite',
    });
  });

  it('sem nome, herda o do molde', () => {
    expect(planoAPartirDoModelo(completo, { ativar: false }).nome).toBe('Molde');
  });

  it('o plano leva alimento e quantidade, e nenhum id do molde', () => {
    /*
      É o que torna a dieta INDEPENDENTE: ela nasce com registros próprios.
      Carregar os ids do molde faria editar o molde mexer no cardápio de quem
      já recebeu.
    */
    const plano = planoAPartirDoModelo(completo, { ativar: false });
    const texto = JSON.stringify(plano);
    for (const id of ['m1', 'r1', 'r2', 'i1', 'i2']) {
      expect(texto).not.toContain(`"${id}"`);
    }
  });
});
