import { describe, expect, it } from 'vitest';
import { DIAS_MARCA_RECENTE, ehMarcaRecente, ordenarMarcas, type MarcaPessoal } from './recordes';

const marca = (parcial: Partial<MarcaPessoal> = {}): MarcaPessoal => ({
  exercicioId: 'e1',
  exercicioNome: 'Supino reto com barra',
  cargaMaximaKg: 40,
  cargaMaximaEm: '2026-08-01',
  melhor1rmKg: 50,
  volumeMaximoSerieKg: 400,
  diasTreinados: 5,
  ultimaEm: '2026-08-01',
  ...parcial,
});

describe('ordenarMarcas', () => {
  /*
    A decisão da tela. Quem abre "meus recordes" acabou de bater alguma coisa
    e quer ver aquilo — em ordem alfabética a marca do dia apareceria no meio,
    entre coisas que a pessoa já sabe.
  */
  it('põe a conquista mais recente primeiro, não a alfabética', () => {
    const ordenadas = ordenarMarcas([
      marca({ exercicioId: 'agachamento', exercicioNome: 'Agachamento', cargaMaximaEm: '2026-06-10' }),
      marca({ exercicioId: 'supino', exercicioNome: 'Supino', cargaMaximaEm: '2026-08-09' }),
    ]);
    expect(ordenadas.map((m) => m.exercicioId)).toEqual(['supino', 'agachamento']);
  });

  /*
    Ordenar por peso faria agachamento vencer rosca direta para sempre, e a
    tela viraria um ranking de exercício em vez do progresso da pessoa.
  */
  it('não ordena por peso', () => {
    const ordenadas = ordenarMarcas([
      marca({ exercicioId: 'agachamento', cargaMaximaKg: 100, cargaMaximaEm: '2026-06-01' }),
      marca({ exercicioId: 'rosca', cargaMaximaKg: 12, cargaMaximaEm: '2026-08-09' }),
    ]);
    expect(ordenadas[0]?.exercicioId).toBe('rosca');
  });

  it('empate de data cai para a carga maior, para a ordem ser estável', () => {
    const ordenadas = ordenarMarcas([
      marca({ exercicioId: 'leve', cargaMaximaKg: 20, cargaMaximaEm: '2026-08-09' }),
      marca({ exercicioId: 'pesado', cargaMaximaKg: 80, cargaMaximaEm: '2026-08-09' }),
    ]);
    expect(ordenadas.map((m) => m.exercicioId)).toEqual(['pesado', 'leve']);
  });

  it('não altera a lista recebida', () => {
    const original = [
      marca({ exercicioId: 'a', cargaMaximaEm: '2026-06-01' }),
      marca({ exercicioId: 'b', cargaMaximaEm: '2026-08-01' }),
    ];
    ordenarMarcas(original);
    expect(original.map((m) => m.exercicioId)).toEqual(['a', 'b']);
  });

  it('lista vazia não quebra', () => {
    expect(ordenarMarcas([])).toEqual([]);
  });
});

describe('ehMarcaRecente', () => {
  const agora = new Date(2026, 7, 9);

  it('conquista de ontem é recente', () => {
    expect(ehMarcaRecente(marca({ cargaMaximaEm: '2026-08-08' }), agora)).toBe(true);
  });

  it('no limite da janela ainda conta', () => {
    expect(ehMarcaRecente(marca({ cargaMaximaEm: '2026-07-10' }), agora)).toBe(true);
  });

  /*
    Passada a janela a marca virou o patamar normal. Continuar anunciando como
    novidade é o que faz a próxima conquista valer menos.
  */
  it('um dia além da janela deixa de ser', () => {
    const foraDaJanela = new Date(agora.getTime() - (DIAS_MARCA_RECENTE + 1) * 24 * 60 * 60 * 1000);
    const iso = `${foraDaJanela.getFullYear()}-${String(foraDaJanela.getMonth() + 1).padStart(2, '0')}-${String(foraDaJanela.getDate()).padStart(2, '0')}`;
    expect(ehMarcaRecente(marca({ cargaMaximaEm: iso }), agora)).toBe(false);
  });

  it('data quebrada não vira conquista', () => {
    expect(ehMarcaRecente(marca({ cargaMaximaEm: 'ontem' }), agora)).toBe(false);
  });
});
