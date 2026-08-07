import { TipoSerie } from '@vivio/contracts';

/**
 * Contas de treino, em um lugar só.
 *
 * Saíram de `historico.service.ts` quando o resumo da execução passou a
 * precisar das mesmas: volume calculado de dois jeitos diferentes daria dois
 * números para a mesma sessão, e o aluno compararia a tela com ela mesma.
 */

export interface SerieParaMetrica {
  cargaKg: number;
  repsFeitas: number;
  tipo: TipoSerie | string;
}

/** Epley: estimativa de 1RM a partir de carga e repetições. */
export function estimar1rm(cargaKg: number, reps: number): number {
  if (reps <= 1) return cargaKg;
  return Number((cargaKg * (1 + reps / 30)).toFixed(1));
}

/**
 * Séries que contam como trabalho.
 *
 * Aquecimento fica de fora — a regra já valia no gráfico de progressão, e
 * mantê-la aqui é o que impede o mesmo treino ter dois volumes. Quem fez cinco
 * aquecimentos num dia e um no outro veria o "volume" mudar sem ter treinado
 * diferente.
 *
 * Quando **só** há aquecimento, ele passa a contar: um treino leve registrado
 * é melhor que um zero que parece falha de registro.
 */
export function seriesDeTrabalho<T extends SerieParaMetrica>(series: T[]): T[] {
  const efetivas = series.filter((s) => s.tipo !== TipoSerie.AQUECIMENTO);
  return efetivas.length > 0 ? efetivas : series;
}

/**
 * Volume em quilos: soma de carga × repetições.
 *
 * É o número que dá sensação de progresso mais rápido que carga isolada —
 * quem aumenta uma repetição em cada série vê o volume subir, enquanto a carga
 * máxima fica parada por semanas.
 */
export function volumeKg(series: SerieParaMetrica[]): number {
  const consideradas = seriesDeTrabalho(series);
  return Number(consideradas.reduce((s, x) => s + x.cargaKg * x.repsFeitas, 0).toFixed(2));
}

export interface MarcasDoExercicio {
  /** Maior carga numa série de trabalho. */
  cargaMaximaKg: number;
  /** Maior volume numa ÚNICA série — não a soma da sessão. */
  volumeMaximoSerieKg: number;
  melhor1rmKg: number;
}

/**
 * As três marcas de um conjunto de séries.
 *
 * O volume aqui é o da **melhor série**, não o da sessão: recorde de volume
 * somado premiaria quem faz mais séries, e mais séries não é sinal de força.
 * Assim o recorde diz "esta série foi a mais pesada que você já fez".
 */
export function marcasDe(series: SerieParaMetrica[]): MarcasDoExercicio | null {
  const consideradas = seriesDeTrabalho(series);
  if (consideradas.length === 0) return null;

  return {
    cargaMaximaKg: Math.max(...consideradas.map((s) => s.cargaKg)),
    volumeMaximoSerieKg: Math.max(...consideradas.map((s) => s.cargaKg * s.repsFeitas)),
    melhor1rmKg: Math.max(...consideradas.map((s) => estimar1rm(s.cargaKg, s.repsFeitas))),
  };
}

export type TipoRecorde = 'PESO' | 'VOLUME' | 'UM_RM';

export interface RecordeBatido {
  tipo: TipoRecorde;
  valor: number;
  /** O melhor anterior; `null` quando é a primeira vez que faz o exercício. */
  anterior: number | null;
}

/**
 * Compara as marcas de hoje com as de antes e devolve o que foi superado.
 *
 * **Empate não é recorde.** Repetir a mesma carga é bom e não precisa de
 * medalha — se empate contasse, todo treino de manutenção viraria três
 * medalhas e o aviso perderia o sentido em duas semanas.
 *
 * Primeira vez no exercício também não gera recorde: não há o que superar, e
 * encher a tela de medalhas no dia em que a pessoa só experimentou o aparelho
 * transforma a conquista em ruído.
 */
export function recordesBatidos(
  hoje: MarcasDoExercicio,
  antes: MarcasDoExercicio | null,
): RecordeBatido[] {
  if (!antes) return [];

  const batidos: RecordeBatido[] = [];

  if (hoje.cargaMaximaKg > antes.cargaMaximaKg) {
    batidos.push({ tipo: 'PESO', valor: hoje.cargaMaximaKg, anterior: antes.cargaMaximaKg });
  }
  if (hoje.volumeMaximoSerieKg > antes.volumeMaximoSerieKg) {
    batidos.push({
      tipo: 'VOLUME',
      valor: hoje.volumeMaximoSerieKg,
      anterior: antes.volumeMaximoSerieKg,
    });
  }
  if (hoje.melhor1rmKg > antes.melhor1rmKg) {
    batidos.push({ tipo: 'UM_RM', valor: hoje.melhor1rmKg, anterior: antes.melhor1rmKg });
  }

  return batidos;
}
