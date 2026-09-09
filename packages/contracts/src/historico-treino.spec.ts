import { describe, expect, it } from 'vitest';
import {
  apurarRecordes,
  montarAnterioresDaSessao,
  montarHistoricoDeCarga,
  type SerieComExecucao,
} from './historico-treino';

/**
 * As contas da tela de execução, sem banco no meio.
 *
 * Elas rodam nos dois lados — API e SDK sobre o Postgres — e o que decidem é o
 * que a pessoa vê na hora de escolher o peso. Um erro aqui não dá erro em
 * lugar nenhum: só sugere a carga errada, com a autoridade de quem parece
 * saber.
 */
const serie = (p: Partial<SerieComExecucao> & { execucaoId: string }): SerieComExecucao => ({
  exercicioId: 'supino',
  serieNum: 1,
  repsFeitas: 10,
  cargaKg: 60,
  tipo: 'NORMAL',
  rpe: null,
  iniciadoEm: '2026-04-01T10:00:00.000Z',
  criadoEm: '2026-04-01T11:00:00.000Z',
  ...p,
});

describe('montarAnterioresDaSessao', () => {
  const itens = [{ exercicioId: 'supino', repsAlvo: '8-12' }];
  const semDor = new Set<string>();

  it('mostra a última sessão, e não a soma de todas', () => {
    const a = montarAnterioresDaSessao({
      series: [
        serie({ execucaoId: 'velha', iniciadoEm: '2026-03-01T10:00:00.000Z', cargaKg: 50 }),
        serie({ execucaoId: 'nova', iniciadoEm: '2026-04-01T10:00:00.000Z', cargaKg: 60 }),
        serie({
          execucaoId: 'nova',
          serieNum: 2,
          iniciadoEm: '2026-04-01T10:00:00.000Z',
          cargaKg: 60,
        }),
      ],
      itens,
      execucoesComDor: semDor,
    });

    // Juntar séries de dias diferentes na mesma lista não é "quanto eu fiz da
    // outra vez" — é uma coluna que ninguém consegue ler.
    expect(a.porExercicio.supino).toHaveLength(2);
    expect(a.porExercicio.supino!.every((s) => s.cargaKg === 60)).toBe(true);
    expect(a.ultimaVezEm.supino).toBe('2026-04-01T10:00:00.000Z');
  });

  it('duas execuções no mesmo instante continuam sendo duas', () => {
    /*
      Acontece de verdade: registro retroativo, importação, fila offline
      reenviada com horários iguais. Desduplicar por DATA somaria as duas como
      se fossem uma sessão só — e a coluna mostraria seis séries de um treino
      de três.
    */
    const mesmoInicio = '2026-04-01T10:00:00.000Z';
    const a = montarAnterioresDaSessao({
      series: [
        serie({
          execucaoId: 'a',
          iniciadoEm: mesmoInicio,
          criadoEm: '2026-04-01T11:00:00.000Z',
          cargaKg: 50,
        }),
        serie({
          execucaoId: 'b',
          iniciadoEm: mesmoInicio,
          criadoEm: '2026-04-01T12:00:00.000Z',
          cargaKg: 70,
        }),
      ],
      itens,
      execucoesComDor: semDor,
    });

    expect(a.porExercicio.supino).toHaveLength(1);
    // A gravada por último é a mais recente das duas.
    expect(a.porExercicio.supino![0]!.cargaKg).toBe(70);
  });

  it('a ordem não depende da ordem em que as séries chegaram', () => {
    const base = [
      serie({ execucaoId: 'x', serieNum: 2, cargaKg: 62 }),
      serie({ execucaoId: 'x', serieNum: 1, cargaKg: 60 }),
      serie({ execucaoId: 'x', serieNum: 3, cargaKg: 64 }),
    ];
    const numaOrdem = montarAnterioresDaSessao({ series: base, itens, execucoesComDor: semDor });
    const noutra = montarAnterioresDaSessao({
      series: [...base].reverse(),
      itens,
      execucoesComDor: semDor,
    });
    expect(numaOrdem.porExercicio.supino!.map((s) => s.serieNum)).toEqual([1, 2, 3]);
    expect(noutra.porExercicio.supino).toEqual(numaOrdem.porExercicio.supino);
  });

  it('dor relatada segura o aumento que o número mandaria dar', () => {
    /*
      Fechou o topo da faixa nas três séries: pela dupla progressão, sobe. Mas
      quem completou as repetições SENTINDO DOR é exatamente quem não deve
      subir — e é quem a regra numérica sozinha mandaria subir.
    */
    const tresNoTopo = [1, 2, 3].map((n) =>
      serie({ execucaoId: 'ontem', serieNum: n, repsFeitas: 12, cargaKg: 60 }),
    );

    const tranquilo = montarAnterioresDaSessao({
      series: tresNoTopo,
      itens,
      execucoesComDor: semDor,
    });
    expect(tranquilo.sugestao.supino!.acao).toBe('AUMENTAR');

    const doendo = montarAnterioresDaSessao({
      series: tresNoTopo,
      itens,
      execucoesComDor: new Set(['ontem']),
    });
    expect(doendo.sugestao.supino!.acao).not.toBe('AUMENTAR');
  });

  it('o mesmo exercício duas vezes na sessão usa a primeira faixa', () => {
    // Caso raro, e uma sugestão consistente é melhor que duas conflitantes na
    // mesma tela.
    const a = montarAnterioresDaSessao({
      series: [serie({ execucaoId: 'x', repsFeitas: 12, cargaKg: 60 })],
      itens: [
        { exercicioId: 'supino', repsAlvo: '8-12' },
        { exercicioId: 'supino', repsAlvo: '15-20' },
      ],
      execucoesComDor: semDor,
    });
    expect(Object.keys(a.sugestao)).toEqual(['supino']);
  });

  it('exercício nunca feito ganha sugestão de "sem dado", e não silêncio', () => {
    // A tela precisa de uma linha para cada item da sessão: item sem sugestão
    // aparece diferente dos outros e parece defeito.
    const a = montarAnterioresDaSessao({ series: [], itens, execucoesComDor: semDor });
    expect(a.sugestao.supino!.acao).toBe('SEM_DADO');
    expect(a.porExercicio.supino).toBeUndefined();
  });

  it('sessão sem itens devolve vazio, e não quebra', () => {
    expect(montarAnterioresDaSessao({ series: [], itens: [], execucoesComDor: semDor })).toEqual({
      porExercicio: {},
      ultimaVezEm: {},
      sugestao: {},
    });
  });
});

describe('montarHistoricoDeCarga', () => {
  const doDia = (dia: string, execucaoId: string, cargas: [number, number, string][]) =>
    cargas.map(([cargaKg, repsFeitas, tipo], i) =>
      serie({
        execucaoId,
        serieNum: i + 1,
        cargaKg,
        repsFeitas,
        tipo,
        iniciadoEm: `${dia}T10:00:00.000Z`,
        criadoEm: `${dia}T11:00:00.000Z`,
      }),
    );

  it('agrupa por dia, em ordem cronológica', () => {
    const h = montarHistoricoDeCarga({
      exercicioId: 'supino',
      exercicioNome: 'Supino',
      series: [
        ...doDia('2026-04-08', 'b', [[65, 10, 'NORMAL']]),
        ...doDia('2026-04-01', 'a', [[60, 10, 'NORMAL']]),
      ],
      limite: 20,
    });
    // Cronológico: o gráfico se lê da esquerda para a direita.
    expect(h.pontos.map((p) => p.data)).toEqual(['2026-04-01', '2026-04-08']);
    expect(h.exercicioNome).toBe('Supino');
  });

  it('o aquecimento aparece na lista mas não puxa o gráfico para baixo', () => {
    const h = montarHistoricoDeCarga({
      exercicioId: 'supino',
      exercicioNome: 'Supino',
      series: doDia('2026-04-01', 'a', [
        [20, 15, 'AQUECIMENTO'],
        [60, 10, 'NORMAL'],
      ]),
      limite: 20,
    });
    const ponto = h.pontos[0]!;
    expect(ponto.cargaMaximaKg).toBe(60);
    expect(ponto.volumeKg).toBe(600);
    // Mas continua visível: quem abre o dia quer ver o treino como foi feito.
    expect(ponto.series).toHaveLength(2);
  });

  it('dia só de aquecimento conta: treino leve registrado não é zero', () => {
    // Um zero ali parece falha de registro, e some do gráfico como se a pessoa
    // não tivesse ido.
    const h = montarHistoricoDeCarga({
      exercicioId: 'supino',
      exercicioNome: 'Supino',
      series: doDia('2026-04-01', 'a', [[20, 15, 'AQUECIMENTO']]),
      limite: 20,
    });
    expect(h.pontos[0]!.cargaMaximaKg).toBe(20);
  });

  it('o limite conta DIAS, e mantém os mais recentes', () => {
    const h = montarHistoricoDeCarga({
      exercicioId: 'supino',
      exercicioNome: 'Supino',
      series: [
        ...doDia('2026-04-01', 'a', [[50, 10, 'NORMAL']]),
        ...doDia('2026-04-08', 'b', [[60, 10, 'NORMAL']]),
        ...doDia('2026-04-15', 'c', [[70, 10, 'NORMAL']]),
      ],
      limite: 2,
    });
    expect(h.pontos.map((p) => p.data)).toEqual(['2026-04-08', '2026-04-15']);
  });
});

describe('apurarRecordes', () => {
  const s = (cargaKg: number, repsFeitas: number, exercicioId = 'supino') => ({
    exercicioId,
    cargaKg,
    repsFeitas,
    tipo: 'NORMAL',
  });

  it('primeira vez no exercício não vira medalha', () => {
    // Encher a tela de medalhas no dia em que a pessoa só experimentou o
    // aparelho transforma a conquista em ruído.
    expect(
      apurarRecordes({ deHoje: [s(60, 10)], anteriores: [], nomes: { supino: 'Supino' } }),
    ).toEqual([]);
  });

  it('empatar não é recorde', () => {
    // Repetir a mesma carga é bom e não precisa de medalha. Se empate
    // contasse, todo treino de manutenção viraria três medalhas.
    expect(
      apurarRecordes({
        deHoje: [s(60, 10)],
        anteriores: [s(60, 10)],
        nomes: { supino: 'Supino' },
      }),
    ).toEqual([]);
  });

  it('superar traz o número anterior junto', () => {
    const r = apurarRecordes({
      deHoje: [s(65, 10)],
      anteriores: [s(60, 10)],
      nomes: { supino: 'Supino' },
    });
    const peso = r.find((x) => x.tipo === 'PESO')!;
    // "de 60 para 65" vale mais que só "65".
    expect(peso.anterior).toBe(60);
    expect(peso.valor).toBe(65);
    expect(peso.exercicioNome).toBe('Supino');
  });

  it('cada exercício é comparado com o próprio histórico', () => {
    const r = apurarRecordes({
      deHoje: [s(65, 10, 'supino'), s(30, 10, 'remada')],
      anteriores: [s(60, 10, 'supino'), s(50, 10, 'remada')],
      nomes: { supino: 'Supino', remada: 'Remada' },
    });
    expect(r.every((x) => x.exercicioId === 'supino')).toBe(true);
  });

  it('exercício sem nome no mapa não deixa a medalha sem rótulo', () => {
    // Vazio na tela seria pior que um genérico: a pessoa não saberia de qual
    // exercício está sendo parabenizada.
    const r = apurarRecordes({ deHoje: [s(65, 10)], anteriores: [s(60, 10)], nomes: {} });
    expect(r[0]!.exercicioNome).toBe('Exercício');
  });
});
