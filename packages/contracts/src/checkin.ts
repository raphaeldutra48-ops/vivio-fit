import { z } from 'zod';

/**
 * Check-in diário do aluno.
 *
 * Já existia o **feedback pós-treino**, que é outra coisa: ele só nasce quando
 * há treino. O dado que faltava é justamente o dos dias em que a pessoa **não**
 * treinou — é ele que revela queda de adesão antes de virar desistência, e é
 * ele que o alerta para o personal consome.
 *
 * Por isso `treinou: false` é um check-in perfeitamente válido, e não uma
 * ausência de registro.
 */

/** 1 = exausto, 5 = ótimo. Escala curta porque é respondida todo dia, no celular. */
export const ENERGIA_MIN = 1;
export const ENERGIA_MAX = 5;

export const registrarCheckinSchema = z.object({
  /**
   * Dia a que o check-in se refere, em `AAAA-MM-DD`.
   *
   * Vem do cliente, e não do relógio do servidor, porque o aluno pode
   * registrar a noite anterior de manhã — e porque o fuso dele não é o do
   * contêiner. O serviço é que decide se a data é aceitável.
   */
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data no formato AAAA-MM-DD'),
  treinou: z.boolean(),
  energia: z.number().int().min(ENERGIA_MIN).max(ENERGIA_MAX),
  teveDor: z.boolean().default(false),
  localDor: z.string().max(120).optional(),
  observacao: z.string().max(500).optional(),
});
export type RegistrarCheckinInput = z.infer<typeof registrarCheckinSchema>;

export const consultaCheckinsSchema = z.object({
  /** Janela em dias, contada para trás a partir de hoje. */
  dias: z.coerce.number().int().min(1).max(365).default(30),
});
export type ConsultaCheckins = z.infer<typeof consultaCheckinsSchema>;

export interface CheckinResumo {
  id: string;
  data: string;
  treinou: boolean;
  energia: number;
  teveDor: boolean;
  localDor: string | null;
  observacao: string | null;
  criadoEm: string;
}

/**
 * Números que o painel do profissional mostra.
 *
 * `aderencia` é a razão entre dias treinados e dias com check-in — não entre
 * dias treinados e dias do período. A diferença importa: quem não registrou
 * nada não "deixou de treinar", apenas não contou. Misturar as duas coisas
 * daria 20% de adesão para quem treina direito e só esquece de registrar.
 */
export interface ResumoDeCheckins {
  dias: number;
  comCheckin: number;
  treinou: number;
  /** 0 a 100, ou `null` quando não houve check-in nenhum no período. */
  aderencia: number | null;
  energiaMedia: number | null;
  diasComDor: number;
  /** Dias desde o último check-in; `null` se nunca houve. */
  diasSemCheckin: number | null;
  ultimoEm: string | null;
}
