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
  motivo: z.string().min(5, 'Explique o motivo da recusa').max(500),
});
export type RecusarProfissionalInput = z.infer<typeof recusarProfissionalSchema>;

/** Onde conferir cada registro — poupa o admin de procurar toda vez. */
export const CONSULTA_DO_CONSELHO: Partial<Record<Papel, { nome: string; url: string }>> = {
  [Papel.PERSONAL]: { nome: 'CONFEF', url: 'https://www.confef.org.br/confef/registrados/' },
  [Papel.NUTRICIONISTA]: { nome: 'CFN', url: 'https://www.cfn.org.br/index.php/consulta-cfn/' },
  [Papel.MEDICO]: { nome: 'CFM', url: 'https://portal.cfm.org.br/busca-medicos/' },
};
