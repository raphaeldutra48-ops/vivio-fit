import { z } from 'zod';
import { SexoBiologico } from './avaliacao';
import type { Papel } from './enums';

/**
 * Altura aceita, em CENTÍMETROS.
 *
 * Exportada para a tela recusar antes de mandar: "1,75" é o que alguém digita
 * pensando em metros, e sem a faixa isso chegava ao servidor como valor inválido
 * — ou, pior, como `NaN`, que o JSON manda como `null` e APAGA a altura já
 * gravada. A frase do erro precisa dizer a unidade, que é onde está o mal-entendido.
 */
export const FAIXA_ALTURA_CM = { min: 80, max: 260 } as const;

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
  /*
    Do aluno. Os dois só existem para a taxa metabólica: altura entra na
    Mifflin-St Jeor, e o sexo é o que ela usa como atalho para composição
    corporal.

    Opcionais de propósito. Sexo biológico é dado sensível sob a LGPD, e há
    pessoas para quem a pergunta não tem resposta simples — quem fez
    bioimpedância nem precisa dele, porque a Katch-McArdle usa a massa magra
    medida e dispensa o atalho.
  */
  alturaCm: z.number().int().min(FAIXA_ALTURA_CM.min).max(FAIXA_ALTURA_CM.max).nullish(),
  sexoBiologico: z.nativeEnum(SexoBiologico).nullish(),
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
  /** Só para aluno. Alimenta a taxa metabólica. */
  aluno: {
    alturaCm: number | null;
    sexoBiologico: SexoBiologico | null;
    dataNascimento: string;
  } | null;
}
