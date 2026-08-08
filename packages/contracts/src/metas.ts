import { z } from 'zod';

/**
 * Metas do aluno, definidas pelo profissional.
 *
 * O que separa isto de uma lista de tarefas é a **aferição automática**: para
 * os tipos mensuráveis, o sistema calcula o valor atual a partir do que já
 * existe (medidas, execuções) e diz sozinho se a meta foi atingida. Meta que
 * depende de alguém lembrar de marcar "concluída" não é acompanhada — é
 * esquecida, e some do painel sem ninguém notar.
 */

export const TipoMeta = {
  /** Chegar a X kg de peso corporal. Serve para ganho e para perda. */
  PESO_CORPORAL: 'PESO_CORPORAL',
  /** Chegar a X kg num exercício (maior carga em série de trabalho). */
  CARGA_EXERCICIO: 'CARGA_EXERCICIO',
  /** Treinar X vezes por semana, em média, no período da meta. */
  FREQUENCIA_SEMANAL: 'FREQUENCIA_SEMANAL',
  /** Chegar a X cm de cintura. */
  MEDIDA_CINTURA: 'MEDIDA_CINTURA',
  /** Sem número: o profissional marca quando considerar cumprida. */
  LIVRE: 'LIVRE',
} as const;
export type TipoMeta = (typeof TipoMeta)[keyof typeof TipoMeta];

/** Os que o sistema afere sozinho. `LIVRE` fica de fora por definição. */
export const TIPOS_MENSURAVEIS: TipoMeta[] = [
  TipoMeta.PESO_CORPORAL,
  TipoMeta.CARGA_EXERCICIO,
  TipoMeta.FREQUENCIA_SEMANAL,
  TipoMeta.MEDIDA_CINTURA,
];

export const ROTULO_TIPO_META: Record<TipoMeta, string> = {
  PESO_CORPORAL: 'Peso corporal',
  CARGA_EXERCICIO: 'Carga no exercício',
  FREQUENCIA_SEMANAL: 'Treinos por semana',
  MEDIDA_CINTURA: 'Cintura',
  LIVRE: 'Livre',
};

export const UNIDADE_TIPO_META: Record<TipoMeta, string> = {
  PESO_CORPORAL: 'kg',
  CARGA_EXERCICIO: 'kg',
  FREQUENCIA_SEMANAL: 'x/semana',
  MEDIDA_CINTURA: 'cm',
  LIVRE: '',
};

export const criarMetaSchema = z
  .object({
    tipo: z.nativeEnum(TipoMeta),
    titulo: z.string().min(3).max(120),
    /** Obrigatório nos tipos mensuráveis; ignorado em LIVRE. */
    alvo: z.number().positive().max(10_000).optional(),
    /** Só para CARGA_EXERCICIO. */
    exercicioId: z.string().cuid().optional(),
    prazo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    observacao: z.string().max(500).optional(),
  })
  .superRefine((dados, ctx) => {
    const mensuravel = TIPOS_MENSURAVEIS.includes(dados.tipo);

    if (mensuravel && dados.alvo === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['alvo'],
        message: 'Meta mensurável precisa de um alvo numérico.',
      });
    }

    /*
      Sem exercício, "chegar a 100 kg" não quer dizer nada — e a meta ficaria
      impossível de aferir depois, quando ninguém lembra o que se pretendia.
    */
    if (dados.tipo === TipoMeta.CARGA_EXERCICIO && !dados.exercicioId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['exercicioId'],
        message: 'Meta de carga precisa dizer em qual exercício.',
      });
    }
  });
export type CriarMetaInput = z.infer<typeof criarMetaSchema>;

export interface MetaResumo {
  id: string;
  tipo: TipoMeta;
  titulo: string;
  alvo: number | null;
  exercicioId: string | null;
  exercicioNome: string | null;
  prazo: string | null;
  observacao: string | null;
  criadoEm: string;
  /** Valor quando a meta foi criada — é a régua do progresso. */
  valorInicial: number | null;
  /** Valor de agora, aferido do que já existe. `null` sem dado. */
  valorAtual: number | null;
  /**
   * 0 a 100. Considera a distância percorrida desde o início, não a distância
   * até zero — sem isso, perder 2 kg de 80 para 78 apareceria como 97% de uma
   * meta de 75.
   */
  progresso: number | null;
  atingida: boolean;
  /** Preenchido quando alguém marcou à mão, ou quando o sistema detectou. */
  concluidaEm: string | null;
  /** `true` quando passou do prazo sem ter sido atingida. */
  atrasada: boolean;
}
