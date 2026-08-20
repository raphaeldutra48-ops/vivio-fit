import type { ExecucaoResumo } from '@vivio/contracts';
import { describe, expect, it } from 'vitest';
import { inicioDaSemana, macrosComparaveis, treinosPorSemana } from './graficos';

/**
 * O que transforma dado do servidor em barra e linha.
 *
 * A regra que mais importa aqui: **semana sem treino tem de aparecer**. É
 * tentador montar o gráfico só com as semanas que têm dado — o código fica
 * menor e o gráfico fica bonito. E mente: quatro barras seguidas dão impressão
 * de constância mesmo quando houve um mês de sumiço no meio.
 */

const execucao = (iniciadoEm: string): ExecucaoResumo =>
  ({ id: iniciadoEm, iniciadoEm, sessaoNome: 'A', totalSeries: 10, volumeTotalKg: 1000 }) as ExecucaoResumo;

describe('inicioDaSemana', () => {
  /* Segunda como início: é como personal e aluno falam de "semana de treino". */
  it('quarta-feira volta para a segunda daquela semana', () => {
    // 2026-08-12 é uma quarta.
    expect(inicioDaSemana('2026-08-12T10:00:00.000Z')).toBe('2026-08-10');
  });

  it('segunda-feira é o próprio início', () => {
    expect(inicioDaSemana('2026-08-10T10:00:00.000Z')).toBe('2026-08-10');
  });

  /* Domingo é o caso que quase todo código erra: getDay() = 0. */
  it('domingo pertence à semana que começou na segunda anterior', () => {
    // 2026-08-16 é um domingo.
    expect(inicioDaSemana('2026-08-16T10:00:00.000Z')).toBe('2026-08-10');
  });
});

describe('treinosPorSemana', () => {
  it('conta os treinos de cada semana', () => {
    const hoje = new Date();
    const semanas = treinosPorSemana(
      [execucao(hoje.toISOString()), execucao(hoje.toISOString())],
      4,
    );
    expect(semanas).toHaveLength(4);
    expect(semanas[semanas.length - 1]!.treinos).toBe(2);
  });

  /* A regra central deste arquivo. */
  it('semana sem treino aparece com zero, não some', () => {
    const semanas = treinosPorSemana([], 6);
    expect(semanas).toHaveLength(6);
    expect(semanas.every((s) => s.treinos === 0)).toBe(true);
  });

  it('vem em ordem cronológica, do mais antigo para o mais novo', () => {
    const semanas = treinosPorSemana([], 5);
    const datas = semanas.map((s) => s.semana);
    expect(datas).toEqual([...datas].sort());
  });

  it('pedir zero semanas devolve vazio em vez de quebrar', () => {
    expect(treinosPorSemana([execucao(new Date().toISOString())], 0)).toEqual([]);
  });

  /*
    Treino mais antigo que a janela não pode inflar a barra mais antiga: ele
    ficou de fora do período que o gráfico diz mostrar.
  */
  it('treino fora da janela não entra em nenhuma barra', () => {
    const antigo = new Date();
    antigo.setDate(antigo.getDate() - 200);
    const semanas = treinosPorSemana([execucao(antigo.toISOString())], 4);
    expect(semanas.reduce((t, s) => t + s.treinos, 0)).toBe(0);
  });
});

describe('macrosComparaveis', () => {
  it('mantém só o que tem meta prescrita', () => {
    const r = macrosComparaveis([
      { rotulo: 'Proteína', gramas: 120, meta: 150 },
      { rotulo: 'Carboidrato', gramas: 200, meta: null },
    ]);
    expect(r.map((m) => m.rotulo)).toEqual(['Proteína']);
  });

  /* Meta zero é o mesmo que não ter meta: dividir por ela não diz nada. */
  it('meta zero não vira barra', () => {
    expect(macrosComparaveis([{ rotulo: 'Gordura', gramas: 40, meta: 0 }])).toEqual([]);
  });
});
