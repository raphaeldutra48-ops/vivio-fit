import { describe, expect, it } from 'vitest';
import {
  montarEvolucaoDeCarga,
  resumoDeTreinoNoPeriodo,
  variacaoDePeso,
  type ExecucaoDoPainel,
  type SerieParaEvolucao,
} from './progresso';

/**
 * O painel de progresso, sem banco no meio.
 *
 * Nada aqui decide acesso: são execuções, check-ins e medidas que quem
 * pergunta já lê, lidos juntos. E é por isso que precisa de teste — um erro
 * não dá erro em lugar nenhum, só mostra um número errado com cara de certo.
 */
const execucao = (
  iniciadoEm: string,
  duracaoSeg: number | null,
  series: [number, number, string?][] = [],
): ExecucaoDoPainel => ({
  iniciadoEm,
  duracaoSeg,
  series: series.map(([cargaKg, repsFeitas, tipo]) => ({
    cargaKg,
    repsFeitas,
    tipo: tipo ?? 'NORMAL',
  })),
});

describe('resumoDeTreinoNoPeriodo', () => {
  const agora = new Date('2026-09-10T12:00:00.000Z');

  it('período sem treino não é erro, é um painel de zeros', () => {
    // É o que a tela mostra para quem entrou esta semana. Nulo ali quebraria a
    // renderização; erro mandaria tentar de novo.
    const r = resumoDeTreinoNoPeriodo([], 30, agora);
    expect(r).toMatchObject({
      total: 0,
      volumeKg: 0,
      minutos: 0,
      duracaoMediaMin: null,
      ultimoEm: null,
      diasSemTreinar: null,
    });
  });

  it('treino em andamento entra na conta de sessões e sai na de tempo', () => {
    /*
      Sessão sem fim tem duração nula. Contá-la como zero minuto puxaria a
      média para baixo — o personal veria "média de 30 minutos" para quem
      treina 60 — e não contá-la como sessão esconderia o treino de hoje.
    */
    const r = resumoDeTreinoNoPeriodo(
      [
        execucao('2026-09-01T10:00:00.000Z', 3600),
        execucao('2026-09-08T10:00:00.000Z', null),
      ],
      30,
      agora,
    );
    expect(r.total).toBe(2);
    expect(r.minutos).toBe(60);
    expect(r.duracaoMediaMin).toBe(60);
  });

  it('o aquecimento fica fora do volume', () => {
    // Mesma regra do gráfico de progressão. Quem faz cinco aquecimentos num dia
    // e um no outro veria o volume mudar sem ter treinado diferente.
    const r = resumoDeTreinoNoPeriodo(
      [execucao('2026-09-01T10:00:00.000Z', 3600, [[20, 15, 'AQUECIMENTO'], [60, 10]])],
      30,
      agora,
    );
    expect(r.volumeKg).toBe(600);
  });

  it('a frequência é por semana, e não o total puro', () => {
    /*
      "12 treinos" quer dizer coisas diferentes em 30 e em 90 dias, e é a
      frequência que diz se o programa está sendo seguido.
    */
    const oitoTreinos = Array.from({ length: 8 }, (_, i) =>
      execucao(`2026-09-0${i + 1}T10:00:00.000Z`, 3600),
    );
    expect(resumoDeTreinoNoPeriodo(oitoTreinos, 28, agora).porSemana).toBe(2);
  });

  it('os dias sem treinar contam do treino mais recente, chegue ele na ordem que chegar', () => {
    const r = resumoDeTreinoNoPeriodo(
      [
        execucao('2026-09-07T10:00:00.000Z', 3600),
        execucao('2026-08-20T10:00:00.000Z', 3600),
      ],
      30,
      agora,
    );
    expect(r.ultimoEm).toBe('2026-09-07T10:00:00.000Z');
    expect(r.diasSemTreinar).toBe(3);
  });
});

describe('montarEvolucaoDeCarga', () => {
  const serie = (
    quando: string,
    cargaKg: number,
    repsFeitas = 10,
    exercicioId = 'e1',
    tipo = 'NORMAL',
  ): SerieParaEvolucao => ({ exercicioId, quando, cargaKg, repsFeitas, tipo });

  const nomes = { e1: 'Supino', e2: 'Remada', e3: 'Agachamento' };

  it('duas medições num dia só não são tendência', () => {
    /*
      Trinta de manhã e cinquenta à tarde é um dia de teste de carga. Entrando,
      o painel anunciaria "+66%" e o personal ajustaria o programa por causa de
      uma tarde.
    */
    const r = montarEvolucaoDeCarga(
      [serie('2026-09-01T08:00:00.000Z', 30), serie('2026-09-01T18:00:00.000Z', 50)],
      nomes,
    );
    expect(r).toEqual([]);
  });

  it('compara metades do período, e não a primeira contra a última sessão', () => {
    /*
      Primeira contra última seria mais simples e mais frágil: um dia ruim no
      fim viraria "regrediu". Aqui o dia fraco no meio da segunda metade não
      apaga a subida.
    */
    const r = montarEvolucaoDeCarga(
      [
        serie('2026-08-01T10:00:00.000Z', 60),
        serie('2026-09-01T10:00:00.000Z', 70),
        serie('2026-09-02T10:00:00.000Z', 40),
      ],
      nomes,
    );
    expect(r[0]!.variacaoPercentual).toBeGreaterThan(0);
  });

  it('quem regrediu aparece, e na frente de quem subiu menos', () => {
    /*
      Ordena por variação ABSOLUTA. Um painel que só mostra boa notícia não
      serve para acompanhar ninguém: quem caiu 20% é mais urgente para o
      personal do que quem subiu 5%.
    */
    const r = montarEvolucaoDeCarga(
      [
        serie('2026-08-01T10:00:00.000Z', 100, 10, 'e1'),
        serie('2026-09-01T10:00:00.000Z', 80, 10, 'e1'),
        serie('2026-08-01T10:00:00.000Z', 50, 10, 'e2'),
        serie('2026-09-01T10:00:00.000Z', 52, 10, 'e2'),
      ],
      nomes,
    );
    expect(r.map((c) => c.exercicioId)).toEqual(['e1', 'e2']);
    expect(r[0]!.variacaoPercentual).toBeLessThan(0);
  });

  it('exercício sem nome no mapa não fica sem rótulo na tela', () => {
    const r = montarEvolucaoDeCarga(
      [serie('2026-08-01T10:00:00.000Z', 60), serie('2026-09-01T10:00:00.000Z', 70)],
      {},
    );
    expect(r[0]!.exercicioNome).toBe('Exercício');
  });

  it('o aquecimento não define a evolução', () => {
    // Se contasse, a primeira metade de quem aqueceu leve pareceria mais fraca
    // do que foi, e a variação sairia inflada.
    const r = montarEvolucaoDeCarga(
      [
        serie('2026-08-01T10:00:00.000Z', 10, 15, 'e1', 'AQUECIMENTO'),
        serie('2026-08-01T10:05:00.000Z', 60),
        serie('2026-09-01T10:00:00.000Z', 60),
      ],
      nomes,
    );
    expect(r[0]!.variacaoPercentual).toBe(0);
  });
});

describe('variacaoDePeso', () => {
  it('uma pesagem só não é variação', () => {
    // Zero diria "não mudou nada" sobre quem se pesou uma vez. `null` diz o que
    // é: ainda não dá para saber.
    expect(variacaoDePeso([])).toBeNull();
    expect(variacaoDePeso([80])).toBeNull();
  });

  it('é a última menos a primeira, com sinal', () => {
    expect(variacaoDePeso([80, 79, 78])).toBe(-2);
    expect(variacaoDePeso([70, 72.5])).toBe(2.5);
  });
});
