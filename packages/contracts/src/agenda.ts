import { z } from 'zod';

export const TipoCompromisso = {
  AVALIACAO_FISICA: 'AVALIACAO_FISICA',
  CONSULTA: 'CONSULTA',
  RETORNO: 'RETORNO',
  TREINO_ACOMPANHADO: 'TREINO_ACOMPANHADO',
  CONSULTORIA_ONLINE: 'CONSULTORIA_ONLINE',
  OUTRO: 'OUTRO',
} as const;
export type TipoCompromisso = (typeof TipoCompromisso)[keyof typeof TipoCompromisso];

export const ROTULO_TIPO_COMPROMISSO: Record<TipoCompromisso, string> = {
  AVALIACAO_FISICA: 'Avaliação física',
  CONSULTA: 'Consulta',
  RETORNO: 'Retorno',
  TREINO_ACOMPANHADO: 'Treino acompanhado',
  CONSULTORIA_ONLINE: 'Consultoria online',
  OUTRO: 'Outro',
};

/** Duração sugerida por tipo, em minutos. O profissional pode mudar. */
export const DURACAO_PADRAO_MIN: Record<TipoCompromisso, number> = {
  AVALIACAO_FISICA: 60,
  CONSULTA: 50,
  RETORNO: 30,
  TREINO_ACOMPANHADO: 60,
  CONSULTORIA_ONLINE: 50,
  OUTRO: 30,
};

export const StatusCompromisso = {
  AGENDADO: 'AGENDADO',
  CONFIRMADO: 'CONFIRMADO',
  REALIZADO: 'REALIZADO',
  CANCELADO: 'CANCELADO',
  NAO_COMPARECEU: 'NAO_COMPARECEU',
} as const;
export type StatusCompromisso = (typeof StatusCompromisso)[keyof typeof StatusCompromisso];

export const ROTULO_STATUS: Record<StatusCompromisso, string> = {
  AGENDADO: 'Agendado',
  CONFIRMADO: 'Confirmado',
  REALIZADO: 'Realizado',
  CANCELADO: 'Cancelado',
  NAO_COMPARECEU: 'Não compareceu',
};

/** Status que ocupam o horário. Os demais liberam a vaga. */
export const STATUS_ATIVOS: readonly StatusCompromisso[] = ['AGENDADO', 'CONFIRMADO'];

export const criarCompromissoSchema = z
  .object({
    alunoId: z.string().cuid(),
    tipo: z.nativeEnum(TipoCompromisso),
    titulo: z.string().max(120).optional(),
    inicioEm: z.coerce.date(),
    /** Se ausente, usa a duração padrão do tipo. */
    fimEm: z.coerce.date().optional(),
    duracaoMin: z.number().int().min(5).max(480).optional(),
    local: z.string().max(200).optional(),
    observacao: z.string().max(1000).optional(),
  })
  .refine((d) => !d.fimEm || d.fimEm > d.inicioEm, {
    message: 'O fim precisa ser depois do início',
    path: ['fimEm'],
  });
export type CriarCompromissoInput = z.infer<typeof criarCompromissoSchema>;

export const remarcarCompromissoSchema = z
  .object({
    inicioEm: z.coerce.date(),
    fimEm: z.coerce.date(),
    local: z.string().max(200).optional(),
    observacao: z.string().max(1000).optional(),
  })
  .refine((d) => d.fimEm > d.inicioEm, {
    message: 'O fim precisa ser depois do início',
    path: ['fimEm'],
  });
export type RemarcarCompromissoInput = z.infer<typeof remarcarCompromissoSchema>;

export const mudarStatusSchema = z.object({
  status: z.nativeEnum(StatusCompromisso),
  motivo: z.string().max(300).optional(),
});
export type MudarStatusInput = z.infer<typeof mudarStatusSchema>;

export const consultaAgendaSchema = z.object({
  de: z.string(),
  ate: z.string(),
  incluirCancelados: z.coerce.boolean().default(false),
});
export type ConsultaAgenda = z.infer<typeof consultaAgendaSchema>;

export interface CompromissoResumo {
  id: string;
  tipo: TipoCompromisso;
  titulo: string | null;
  inicioEm: string;
  fimEm: string;
  duracaoMin: number;
  local: string | null;
  observacao: string | null;
  status: StatusCompromisso;
  motivoCancelamento: string | null;
  aluno: { id: string; nome: string; email: string };
  profissional: { id: string; nome: string; papel: string };
}

// --- Disponibilidade --------------------------------------------------------

export const horarioAgendaSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM');

export const definirDisponibilidadeSchema = z.object({
  janelas: z
    .array(
      z
        .object({
          diaSemana: z.number().int().min(1).max(7),
          horaInicio: horarioAgendaSchema,
          horaFim: horarioAgendaSchema,
          duracaoMin: z.number().int().min(10).max(240).default(60),
        })
        .refine((j) => j.horaFim > j.horaInicio, {
          message: 'O fim precisa ser depois do início',
          path: ['horaFim'],
        }),
    )
    .max(30),
});
export type DefinirDisponibilidadeInput = z.infer<typeof definirDisponibilidadeSchema>;

export interface JanelaDisponivel {
  id: string;
  diaSemana: number;
  horaInicio: string;
  horaFim: string;
  duracaoMin: number;
}

export const criarBloqueioSchema = z
  .object({
    inicioEm: z.coerce.date(),
    fimEm: z.coerce.date(),
    motivo: z.string().max(200).optional(),
  })
  .refine((d) => d.fimEm > d.inicioEm, { message: 'O fim precisa ser depois do início' });
export type CriarBloqueioInput = z.infer<typeof criarBloqueioSchema>;

/** Um horário livre sugerido para marcar. */
export interface HorarioLivre {
  inicioEm: string;
  fimEm: string;
}

export const DIAS_DA_SEMANA = [
  { numero: 1, curto: 'Seg', longo: 'Segunda' },
  { numero: 2, curto: 'Ter', longo: 'Terça' },
  { numero: 3, curto: 'Qua', longo: 'Quarta' },
  { numero: 4, curto: 'Qui', longo: 'Quinta' },
  { numero: 5, curto: 'Sex', longo: 'Sexta' },
  { numero: 6, curto: 'Sáb', longo: 'Sábado' },
  { numero: 7, curto: 'Dom', longo: 'Domingo' },
] as const;
