import { z } from 'zod';

export const serieExecutadaSchema = z.object({
  itemTreinoId: z.string().cuid(),
  serieNum: z.number().int().min(1).max(20),
  repsFeitas: z.number().int().min(0).max(500),
  cargaKg: z.number().min(0).max(1000),
  /** Esforço percebido, 1 a 10. */
  rpe: z.number().int().min(1).max(10).optional(),
  falhou: z.boolean().default(false),
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
 * quando puder. `clienteUuid` é gerado no aparelho e garante idempotência:
 * reenviar não duplica.
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
  serieNum: number;
  repsFeitas: number;
  cargaKg: number;
  rpe: number | null;
  falhou: boolean;
}

export interface ExecucaoResumo {
  id: string;
  clienteUuid: string;
  sessaoId: string;
  sessaoNome: string;
  iniciadoEm: string;
  finalizadoEm: string | null;
  duracaoSeg: number | null;
  totalSeries: number;
  /** Soma de carga × repetições — o indicador de volume da sessão. */
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
}
