import { z } from 'zod';
import type { Papel } from './enums';

export const TipoConversa = {
  ALUNO_PROFISSIONAL: 'ALUNO_PROFISSIONAL',
  EQUIPE_CLINICA: 'EQUIPE_CLINICA',
} as const;
export type TipoConversa = (typeof TipoConversa)[keyof typeof TipoConversa];

export const TipoMensagem = {
  TEXTO: 'TEXTO',
  ARQUIVO: 'ARQUIVO',
  SISTEMA: 'SISTEMA',
} as const;
export type TipoMensagem = (typeof TipoMensagem)[keyof typeof TipoMensagem];

export const abrirConversaSchema = z.object({
  /** O outro lado. Aluno informa o profissional; profissional informa o aluno. */
  comUsuarioId: z.string().cuid(),
});
export type AbrirConversaInput = z.infer<typeof abrirConversaSchema>;

export const enviarMensagemSchema = z.object({
  /** Gerado no cliente — reenviar não duplica, como na fila de treino. */
  clienteUuid: z.string().uuid(),
  corpo: z.string().min(1).max(4000),
});
export type EnviarMensagemInput = z.infer<typeof enviarMensagemSchema>;

export const listarMensagensSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(40),
});
export type ListarMensagensQuery = z.infer<typeof listarMensagensSchema>;

export interface MensagemResumo {
  id: string;
  clienteUuid: string;
  conversaId: string;
  tipo: TipoMensagem;
  corpo: string | null;
  enviadaEm: string;
  removidaEm: string | null;
  autor: { id: string; nome: string; papel: Papel };
  /** true quando quem consultou é o autor — a bolha vai para a direita. */
  minha: boolean;
}

export interface ConversaResumo {
  id: string;
  tipo: TipoConversa;
  alunoId: string;
  /** Quem está do outro lado, do ponto de vista de quem consultou. */
  contraparte: { id: string; nome: string; papel: Papel; avatarUrl: string | null } | null;
  ultimaMensagem: { corpo: string | null; enviadaEm: string; autorId: string } | null;
  naoLidas: number;
}

/** Eventos do WebSocket. Nomes estáveis — o cliente depende deles. */
export const EventoChat = {
  ENTRAR: 'conversa:entrar',
  SAIR: 'conversa:sair',
  MENSAGEM_NOVA: 'mensagem:nova',
  MENSAGEM_LIDA: 'mensagem:lida',
  ERRO: 'chat:erro',
} as const;
export type EventoChat = (typeof EventoChat)[keyof typeof EventoChat];
