import { z } from 'zod';

/**
 * Painel de progresso do aluno.
 *
 * Reúne numa tela o que hoje está espalhado: frequência, volume, tempo
 * treinado, adesão, evolução de carga e metas. O personal acompanha vários
 * alunos ao mesmo tempo — abrir cinco telas por pessoa não escala, e é por
 * isso que ninguém acompanha de verdade.
 *
 * **Nada aqui é dado novo.** Tudo já existe em execuções, check-ins e medidas;
 * o painel é a leitura conjunta. Por isso ele não tem tabela própria: um
 * número guardado ficaria velho, e a diferença entre o painel e a origem
 * apareceria como bug sem causa.
 */

export const consultaProgressoSchema = z.object({
  /** Janela em dias. 30 é o padrão; 90 pega um ciclo de treino inteiro. */
  dias: z.coerce.number().int().min(7).max(365).default(30),
});
export type ConsultaProgresso = z.infer<typeof consultaProgressoSchema>;

export interface TreinoNoPeriodo {
  /** Sessões efetivamente executadas. */
  total: number;
  /** Soma de carga × repetições, aquecimento fora. */
  volumeKg: number;
  /** Tempo total treinado, em minutos. */
  minutos: number;
  /** Duração média de uma sessão, em minutos; `null` sem sessão finalizada. */
  duracaoMediaMin: number | null;
  /**
   * Média de treinos por semana no período.
   *
   * Mais útil que o total puro: "12 treinos" quer dizer coisas diferentes em
   * 30 e em 90 dias, e é a frequência que diz se o programa está sendo
   * seguido.
   */
  porSemana: number;
  ultimoEm: string | null;
  diasSemTreinar: number | null;
}

export interface EvolucaoDeCarga {
  exercicioId: string;
  exercicioNome: string;
  /** Melhor 1RM estimado no início do período. */
  inicio1rmKg: number;
  /** Melhor 1RM estimado no fim. */
  fim1rmKg: number;
  /** Variação em %, positiva ou negativa. */
  variacaoPercentual: number;
}

/**
 * O painel inteiro.
 *
 * `checkins` vem `null` quando o aluno nunca registrou nenhum — diferente de
 * zero, que significaria "registrou e não treinou". A tela precisa distinguir
 * "sem dado" de "dado ruim" para não cobrar quem só não conhece o recurso.
 */
export interface PainelDeProgresso {
  dias: number;
  treino: TreinoNoPeriodo;
  checkins: {
    comCheckin: number;
    aderencia: number | null;
    energiaMedia: number | null;
    diasComDor: number;
    diasSemCheckin: number | null;
  } | null;
  /** Os exercícios que mais evoluíram e os que regrediram, no período. */
  cargas: EvolucaoDeCarga[];
  /** Variação de peso corporal no período, em kg; `null` sem duas medidas. */
  variacaoPesoKg: number | null;
}
