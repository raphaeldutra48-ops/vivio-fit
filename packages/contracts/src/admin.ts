import { z } from 'zod';
import { Papel } from './enums';

/**
 * Verificação de registro no conselho.
 *
 * Liberar um profissional é liberar acesso a dado de saúde de outras pessoas.
 * Por isso a decisão é registrada com autor e data, e a recusa guarda o motivo
 * em vez de simplesmente não acontecer.
 */
export const StatusVerificacao = {
  PENDENTE: 'PENDENTE',
  VERIFICADO: 'VERIFICADO',
  RECUSADO: 'RECUSADO',
} as const;
export type StatusVerificacao = (typeof StatusVerificacao)[keyof typeof StatusVerificacao];

export const ROTULO_STATUS_VERIFICACAO: Record<StatusVerificacao, string> = {
  PENDENTE: 'Aguardando análise',
  VERIFICADO: 'Verificado',
  RECUSADO: 'Recusado',
};

/** Conselho que registra cada profissão — usado para exibir a sigla certa. */
export const CONSELHO_POR_PAPEL: Partial<Record<Papel, string>> = {
  [Papel.PERSONAL]: 'CREF',
  [Papel.NUTRICIONISTA]: 'CRN',
  [Papel.MEDICO]: 'CRM',
};

/**
 * Mínimo de letras no motivo de uma recusa.
 *
 * Exportado porque a TELA precisa conferir antes de mandar: com a verificação só
 * no servidor, qualquer falha de rede caía no mesmo `catch` e a tela dizia "o
 * motivo precisa ter ao menos 5 caracteres" — acusando o texto que a pessoa
 * escreveu por um problema que não era dela.
 *
 * O motivo existe para o profissional recusado entender o que corrigir: ele é
 * enviado a alguém que investiu em cadastro e documento, e "não" sem explicação é
 * o que gera a resposta irritada no suporte.
 */
export const MINIMO_DO_MOTIVO = 5;

export const listarProfissionaisSchema = z.object({
  status: z.nativeEnum(StatusVerificacao).optional(),
  q: z.string().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ListarProfissionaisQuery = z.infer<typeof listarProfissionaisSchema>;

export interface ProfissionalParaVerificar {
  id: string;
  nome: string;
  email: string;
  telefone: string | null;
  tipo: Papel;
  registroConselho: string;
  ufRegistro: string;
  especialidades: string[];
  bio: string | null;
  emailVerificado: boolean;
  status: StatusVerificacao;
  criadoEm: string;
  verificadoEm: string | null;
  verificadoPor: { id: string; nome: string } | null;
  recusadoEm: string | null;
  motivoRecusa: string | null;
}

/**
 * Motivo é obrigatório na recusa: o profissional precisa saber o que corrigir,
 * e quem recusou precisa ter dito por quê.
 */
export const recusarProfissionalSchema = z.object({
  motivo: z.string().min(MINIMO_DO_MOTIVO, 'Explique o motivo da recusa').max(500),
});
export type RecusarProfissionalInput = z.infer<typeof recusarProfissionalSchema>;

/** Onde conferir cada registro — poupa o admin de procurar toda vez. */
export const CONSULTA_DO_CONSELHO: Partial<Record<Papel, { nome: string; url: string }>> = {
  [Papel.PERSONAL]: { nome: 'CONFEF', url: 'https://www.confef.org.br/confef/registrados/' },
  [Papel.NUTRICIONISTA]: { nome: 'CFN', url: 'https://www.cfn.org.br/index.php/consulta-cfn/' },
  [Papel.MEDICO]: { nome: 'CFM', url: 'https://portal.cfm.org.br/busca-medicos/' },
};
