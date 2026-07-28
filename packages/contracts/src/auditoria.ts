import { z } from 'zod';
import { EscopoDado, Papel } from './enums';

export const AcaoAuditoria = {
  LER: 'LER',
  CRIAR: 'CRIAR',
  ATUALIZAR: 'ATUALIZAR',
  REMOVER: 'REMOVER',
  EXPORTAR: 'EXPORTAR',
  NEGADO: 'NEGADO',
} as const;
export type AcaoAuditoria = (typeof AcaoAuditoria)[keyof typeof AcaoAuditoria];

export const consultaAuditoriaSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  escopo: z.nativeEnum(EscopoDado).optional(),
});
export type ConsultaAuditoria = z.infer<typeof consultaAuditoriaSchema>;

/** Uma linha da tela "quem viu meus dados". */
export interface AcessoRegistrado {
  id: string;
  acao: AcaoAuditoria;
  recursoTipo: string;
  escopo: EscopoDado | null;
  criadoEm: string;
  ator: { id: string; nome: string; papel: Papel };
}
