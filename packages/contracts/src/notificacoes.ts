import { z } from 'zod';

export const TipoLembrete = {
  TREINO: 'TREINO',
  REFEICAO: 'REFEICAO',
  AGUA: 'AGUA',
  CONSULTA: 'CONSULTA',
  MENSAGEM: 'MENSAGEM',
} as const;
export type TipoLembrete = (typeof TipoLembrete)[keyof typeof TipoLembrete];

/** "HH:MM" em 24h. */
export const horarioSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use o formato HH:MM, por exemplo 07:30');

export const registrarDispositivoSchema = z.object({
  token: z.string().min(10).max(500),
  plataforma: z.enum(['IOS', 'ANDROID', 'WEB']),
});
export type RegistrarDispositivoInput = z.infer<typeof registrarDispositivoSchema>;

export const definirLembreteSchema = z.object({
  tipo: z.nativeEnum(TipoLembrete),
  horarios: z.array(horarioSchema).max(8),
  /** 1 = segunda ... 7 = domingo. Vazio = todos os dias. */
  diasDaSemana: z.array(z.number().int().min(1).max(7)).max(7).default([]),
  canais: z.array(z.enum(['PUSH', 'SMS', 'WHATSAPP'])).min(1).default(['PUSH']),
  ativo: z.boolean().default(true),
});
export type DefinirLembreteInput = z.infer<typeof definirLembreteSchema>;

export interface LembreteResumo {
  id: string;
  tipo: TipoLembrete;
  horarios: string[];
  diasDaSemana: number[];
  canais: string[];
  ativo: boolean;
}

export interface NotificacaoResumo {
  id: string;
  tipo: TipoLembrete;
  titulo: string;
  corpo: string;
  deeplink: string | null;
  agendadaPara: string;
  enviadaEm: string | null;
  lidaEm: string | null;
}

/** Textos dos lembretes. Ficam aqui para o app poder exibir a prévia na configuração. */
export const PREVIA_LEMBRETE: Record<TipoLembrete, { titulo: string; corpo: string }> = {
  TREINO: { titulo: 'Hora de treinar 💪', corpo: 'Seu treino de hoje está esperando.' },
  REFEICAO: { titulo: 'Hora da refeição 🍽', corpo: 'Não pule esta refeição do seu plano.' },
  AGUA: { titulo: 'Bebeu água? 💧', corpo: 'Você está atrás da sua meta de hoje.' },
  CONSULTA: { titulo: 'Consulta chegando', corpo: 'Seu atendimento começa em breve.' },
  MENSAGEM: { titulo: 'Nova mensagem', corpo: 'Um profissional falou com você.' },
};
