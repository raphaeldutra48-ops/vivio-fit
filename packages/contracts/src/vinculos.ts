import { z } from 'zod';
import { Papel, StatusVinculo } from './enums';

/**
 * Convite de vínculo. Quem chama define a direção:
 *  - profissional chamando -> convida o aluno daquele e-mail
 *  - aluno chamando        -> convida o profissional daquele e-mail
 */
export const convidarVinculoSchema = z.object({
  email: z.string().email(),
});
export type ConvidarVinculoInput = z.infer<typeof convidarVinculoSchema>;

export interface ResumoPessoa {
  id: string;
  nome: string;
  email: string;
  avatarUrl: string | null;
}

export interface VinculoResumo {
  id: string;
  tipo: Papel;
  status: StatusVinculo;
  iniciadoEm: string | null;
  encerradoEm: string | null;
  /** Quem está do outro lado do vínculo, em relação a quem consultou. */
  contraparte: ResumoPessoa;
  /** true quando o convite aguarda resposta de quem consultou. */
  aguardandoMinhaResposta: boolean;
}

export interface ResumoAluno {
  id: string;
  nome: string;
  email: string;
  avatarUrl: string | null;
  idade: number | null;
  alturaCm: number | null;
  objetivo: string | null;
  equipe: Array<{ tipo: Papel; profissional: ResumoPessoa }>;
}
