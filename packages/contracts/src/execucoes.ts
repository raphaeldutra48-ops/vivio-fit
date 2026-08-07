import { z } from 'zod';

/**
 * Tipo da série. Segue a convenção que o pessoal de academia já conhece:
 * W = aquecimento (warm-up), D = drop set, F = falha.
 */
export const TipoSerie = {
  NORMAL: 'NORMAL',
  AQUECIMENTO: 'AQUECIMENTO',
  DROP: 'DROP',
  FALHA: 'FALHA',
} as const;
export type TipoSerie = (typeof TipoSerie)[keyof typeof TipoSerie];

/** Letra exibida na coluna SÉRIE. NORMAL usa o número da série. */
export const SIGLA_TIPO_SERIE: Record<TipoSerie, string | null> = {
  NORMAL: null,
  AQUECIMENTO: 'W',
  DROP: 'D',
  FALHA: 'F',
};

export const serieExecutadaSchema = z.object({
  itemTreinoId: z.string().cuid(),
  serieNum: z.number().int().min(1).max(50),
  repsFeitas: z.number().int().min(0).max(500),
  cargaKg: z.number().min(0).max(1000),
  tipo: z.nativeEnum(TipoSerie).default(TipoSerie.NORMAL),
  /** Esforço percebido, 1 a 10. */
  rpe: z.number().int().min(1).max(10).optional(),
});
export type SerieExecutadaInput = z.infer<typeof serieExecutadaSchema>;

export const feedbackTreinoSchema = z.object({
  dificuldade: z.number().int().min(1).max(5),
  teveDor: z.boolean().default(false),
  localDor: z.string().max(80).optional(),
  sensacao: z.string().max(200).optional(),
  comentario: z.string().max(1000).optional(),
});
export type FeedbackTreinoInput = z.infer<typeof feedbackTreinoSchema>;

/**
 * Envio de um treino inteiro de uma vez.
 *
 * O celular monta este payload durante o treino (inclusive sem rede) e envia
 * quando puder. `clienteUuid` é gerado no aparelho e garante idempotência.
 */
export const registrarExecucaoSchema = z.object({
  clienteUuid: z.string().uuid(),
  sessaoId: z.string().cuid(),
  iniciadoEm: z.coerce.date(),
  finalizadoEm: z.coerce.date().optional(),
  series: z.array(serieExecutadaSchema).min(1).max(200),
  feedback: feedbackTreinoSchema.optional(),
});
export type RegistrarExecucaoInput = z.infer<typeof registrarExecucaoSchema>;

export interface SerieExecutadaResumo {
  itemTreinoId: string;
  exercicioId: string;
  serieNum: number;
  repsFeitas: number;
  cargaKg: number;
  tipo: TipoSerie;
  rpe: number | null;
}

export interface ExecucaoResumo {
  id: string;
  clienteUuid: string;
  sessaoId: string;
  sessaoNome: string;
  iniciadoEm: string;
  finalizadoEm: string | null;
  duracaoSeg: number | null;
  /** Séries de trabalho — aquecimento não entra na conta. */
  totalSeries: number;
  /**
   * Soma de carga × repetições — o indicador de volume da sessão.
   *
   * Aquecimento fica de fora, mesma regra do gráfico de progressão. Antes esta
   * conta somava tudo e a do gráfico não, então a mesma sessão tinha dois
   * volumes em duas telas.
   */
  volumeTotalKg: number;
  series: SerieExecutadaResumo[];
  feedback: {
    dificuldade: number;
    teveDor: boolean;
    localDor: string | null;
    sensacao: string | null;
    comentario: string | null;
  } | null;
  /** true quando o envio já existia — o cliente pode limpar a fila local. */
  jaRegistrada?: boolean;
  /**
   * Recordes superados nesta sessão. Vazio no caso comum — é isso que faz a
   * medalha valer alguma coisa quando aparece.
   */
  recordes: RecordeBatido[];
}

// --- Histórico de carga -----------------------------------------------------

/** Uma série da última vez que o aluno fez este exercício. */
export interface SerieAnterior {
  serieNum: number;
  repsFeitas: number;
  cargaKg: number;
  tipo: TipoSerie;
}

/**
 * O que preenche a coluna "ANTERIOR" da tela de execução: para cada exercício
 * da sessão, as séries da última vez que ele foi executado.
 *
 * Indexado por exercicioId, não por item do plano: cada versão nova do plano
 * cria itens novos, e o histórico se perderia a cada ajuste do personal.
 */
export interface AnterioresDaSessao {
  /** exercicioId -> séries da última execução daquele exercício. */
  porExercicio: Record<string, SerieAnterior[]>;
  /** exercicioId -> data ISO da última execução. */
  ultimaVezEm: Record<string, string>;
}

export type TipoRecorde = 'PESO' | 'VOLUME' | 'UM_RM';

/** Rótulo curto para a medalha, como o aluno lê. */
export const ROTULO_RECORDE: Record<TipoRecorde, string> = {
  PESO: 'Peso',
  VOLUME: 'Volume',
  UM_RM: '1RM',
};

export interface RecordeBatido {
  exercicioId: string;
  exercicioNome: string;
  tipo: TipoRecorde;
  valor: number;
  /** O melhor anterior. Mostrar "de 100 para 105" vale mais que só "105". */
  anterior: number | null;
}

export interface PontoHistoricoCarga {
  data: string;
  /** Maior carga usada no dia. */
  cargaMaximaKg: number;
  /** Soma de carga × reps no dia. */
  volumeKg: number;
  /** Estimativa de 1RM pela fórmula de Epley: carga × (1 + reps/30). */
  estimativa1rmKg: number;
  series: SerieAnterior[];
}

export interface HistoricoCarga {
  exercicioId: string;
  exercicioNome: string;
  pontos: PontoHistoricoCarga[];
}

/** Formata a coluna ANTERIOR: "80kg x 10". */
export function formatarSerieAnterior(serie: SerieAnterior): string {
  const carga = Number.isInteger(serie.cargaKg) ? serie.cargaKg : serie.cargaKg.toFixed(1);
  return `${carga}kg x ${serie.repsFeitas}`;
}
