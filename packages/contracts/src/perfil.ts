import { z } from 'zod';
import type { Papel } from './enums';

export const atualizarPerfilSchema = z.object({
  nome: z.string().min(2).max(120),
  telefone: z.string().min(8).max(20).optional(),
  bio: z.string().max(1000).optional(),
  especialidades: z.array(z.string().min(2).max(60)).max(10).default([]),
  /**
   * Mudar o registro **revoga a verificação**: bastaria verificar com um
   * número válido e trocar depois para burlar a checagem do conselho.
   */
  registroConselho: z.string().min(3).max(40).optional(),
  ufRegistro: z.string().length(2).optional(),
});
export type AtualizarPerfilInput = z.infer<typeof atualizarPerfilSchema>;

export interface MeuPerfil {
  id: string;
  nome: string;
  email: string;
  telefone: string | null;
  papel: Papel;
  emailVerificado: boolean;
  /** Só para profissional. */
  profissional: {
    tipo: Papel;
    registroConselho: string;
    ufRegistro: string;
    especialidades: string[];
    bio: string | null;
    verificadoEm: string | null;
    recusadoEm: string | null;
    motivoRecusa: string | null;
  } | null;
}
