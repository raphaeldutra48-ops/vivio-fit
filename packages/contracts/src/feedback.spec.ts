import { describe, expect, it } from 'vitest';
import {
  compararPorAtencao,
  marcarSequenciasDeDor,
  motivosDoFeedback,
  precisaDeOlhar,
  type FeedbackDoAluno,
} from './feedback';

const feedback = (parcial: Partial<FeedbackDoAluno> = {}): FeedbackDoAluno => ({
  execucaoId: 'e1',
  aluno: { id: 'a1', nome: 'Ana Souza' },
  sessaoNome: 'Treino A',
  treinoEm: '2026-08-09T10:00:00.000Z',
  dificuldade: 3,
  teveDor: false,
  localDor: null,
  sensacao: null,
  comentario: null,
  sequenciaDeDor: null,
  ...parcial,
});

describe('motivosDoFeedback', () => {
  it('treino na medida e sem comentário não pede nada', () => {
    expect(motivosDoFeedback(feedback())).toEqual([]);
    expect(precisaDeOlhar(feedback())).toBe(false);
  });

  it('dor vem primeiro na lista', () => {
    const motivos = motivosDoFeedback(feedback({ teveDor: true, dificuldade: 5 }));
    expect(motivos[0]).toBe('DOR');
    expect(motivos).toContain('MUITO_DIFICIL');
  });

  /*
    Fácil demais não machuca, mas gasta o tempo do aluno sem entregar
    resultado. É a razão silenciosa de quem desiste dizendo que não via
    diferença — por isso conta como motivo.
  */
  it('as duas pontas da dificuldade contam', () => {
    expect(motivosDoFeedback(feedback({ dificuldade: 1 }))).toEqual(['MUITO_FACIL']);
    expect(motivosDoFeedback(feedback({ dificuldade: 5 }))).toEqual(['MUITO_DIFICIL']);
  });

  it('o meio da escala não conta', () => {
    for (const dificuldade of [2, 3, 4]) {
      expect(motivosDoFeedback(feedback({ dificuldade }))).toEqual([]);
    }
  });

  /* Ninguém digita para não ser lido. */
  it('comentário escrito conta mesmo com o resto tranquilo', () => {
    expect(motivosDoFeedback(feedback({ comentario: 'o joelho estalou' }))).toEqual(['COMENTARIO']);
  });

  it('comentário só de espaço não conta', () => {
    expect(motivosDoFeedback(feedback({ comentario: '   ' }))).toEqual([]);
  });
});

describe('compararPorAtencao', () => {
  /*
    A decisão central da tela. Ordenar por data enterraria a dor de seis dias
    atrás embaixo dos "foi tranquilo" desta semana — e é justamente a dor que
    muda a conduta de hoje.
  */
  it('dor antiga vem antes de treino tranquilo de hoje', () => {
    const dorAntiga = feedback({
      execucaoId: 'dor',
      teveDor: true,
      sequenciaDeDor: 1,
      treinoEm: '2026-08-03T10:00:00.000Z',
    });
    const tranquiloHoje = feedback({ execucaoId: 'ok', treinoEm: '2026-08-09T10:00:00.000Z' });

    expect([tranquiloHoje, dorAntiga].sort(compararPorAtencao)[0]?.execucaoId).toBe('dor');
  });

  it('dificuldade extrema vem antes de comentário', () => {
    const dificil = feedback({ execucaoId: 'dificil', dificuldade: 5 });
    const comentou = feedback({ execucaoId: 'comentou', comentario: 'gostei' });

    expect([comentou, dificil].sort(compararPorAtencao)[0]?.execucaoId).toBe('dificil');
  });

  /* Entre duas dores, a que virou padrão vem antes da isolada. */
  it('entre dores, a sequência mais longa sobe', () => {
    const isolada = feedback({
      execucaoId: 'isolada',
      teveDor: true,
      sequenciaDeDor: 1,
      treinoEm: '2026-08-09T10:00:00.000Z',
    });
    const terceiraSeguida = feedback({
      execucaoId: 'padrao',
      teveDor: true,
      sequenciaDeDor: 3,
      treinoEm: '2026-08-05T10:00:00.000Z',
    });

    expect([isolada, terceiraSeguida].sort(compararPorAtencao)[0]?.execucaoId).toBe('padrao');
  });

  it('empatado o motivo, o mais recente primeiro', () => {
    const velho = feedback({ execucaoId: 'velho', treinoEm: '2026-08-01T10:00:00.000Z' });
    const novo = feedback({ execucaoId: 'novo', treinoEm: '2026-08-08T10:00:00.000Z' });

    expect([velho, novo].sort(compararPorAtencao)[0]?.execucaoId).toBe('novo');
  });

  it('o que não pede nada fica por último', () => {
    const ordenado = [
      feedback({ execucaoId: 'tranquilo', treinoEm: '2026-08-09T10:00:00.000Z' }),
      feedback({ execucaoId: 'comentou', comentario: 'oi', treinoEm: '2026-08-01T10:00:00.000Z' }),
      feedback({ execucaoId: 'dor', teveDor: true, sequenciaDeDor: 1, treinoEm: '2026-07-30T10:00:00.000Z' }),
    ].sort(compararPorAtencao);

    expect(ordenado.map((f) => f.execucaoId)).toEqual(['dor', 'comentou', 'tranquilo']);
  });
});

describe('marcarSequenciasDeDor', () => {
  it('conta as dores seguidas e zera quando o treino passa sem dor', () => {
    const marcados = marcarSequenciasDeDor([
      { teveDor: true },
      { teveDor: true },
      { teveDor: false },
      { teveDor: true },
    ]);

    expect(marcados.map((m) => m.sequenciaDeDor)).toEqual([1, 2, null, 1]);
  });

  /*
    O ponto de existir a função em vez de um COUNT no banco: dores espalhadas
    somam 3 numa contagem simples, mas nenhuma delas é padrão.
  */
  it('dor espalhada nunca chega a dois', () => {
    const marcados = marcarSequenciasDeDor([
      { teveDor: true },
      { teveDor: false },
      { teveDor: true },
      { teveDor: false },
      { teveDor: true },
    ]);

    expect(Math.max(...marcados.map((m) => m.sequenciaDeDor ?? 0))).toBe(1);
  });

  it('sem dor nenhuma, nenhuma sequência', () => {
    const marcados = marcarSequenciasDeDor([{ teveDor: false }, { teveDor: false }]);
    expect(marcados.every((m) => m.sequenciaDeDor === null)).toBe(true);
  });

  it('lista vazia não quebra', () => {
    expect(marcarSequenciasDeDor([])).toEqual([]);
  });
});
