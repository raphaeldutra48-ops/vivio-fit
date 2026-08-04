import { z } from 'zod';
import { Papel } from './enums';

/**
 * Alerta clínico cruzado.
 *
 * É o que o app faz e uma ferramenta de um profissional só não faz: um achado
 * no exame vira orientação para OUTRO membro da equipe de cuidado — sem que
 * esse outro veja o exame.
 *
 * A regra que não pode ser quebrada: **o alerta destinado a quem não pode ver
 * o marcador não menciona o marcador nem o valor.** O personal recebe "evite
 * carga proteica alta e creatina até liberação médica", não "TFG 67". Se o
 * texto vazasse o achado, o alerta seria um jeito indireto de mostrar o exame
 * a quem a lei e a especificação dizem que não pode vê-lo.
 */

export const SeveridadeAlerta = {
  /** Muda a conduta agora. */
  ALTA: 'ALTA',
  /** Ajusta a conduta na próxima revisão. */
  MEDIA: 'MEDIA',
} as const;
export type SeveridadeAlerta = (typeof SeveridadeAlerta)[keyof typeof SeveridadeAlerta];

export const ROTULO_SEVERIDADE: Record<SeveridadeAlerta, string> = {
  ALTA: 'Alta',
  MEDIA: 'Média',
};

/** A quem o alerta se destina. Nunca ao aluno: orientação passa pelo profissional. */
export type PapelDestino = typeof Papel.PERSONAL | typeof Papel.NUTRICIONISTA | typeof Papel.MEDICO;

export interface AlertaResumo {
  id: string;
  papelDestino: PapelDestino;
  severidade: SeveridadeAlerta;
  titulo: string;
  orientacao: string;
  /**
   * Só vem preenchido para quem pode ver o marcador de origem. Para o personal
   * é sempre `null` — inclusive quando a regra nasceu de um marcador que ele
   * não pode ler.
   */
  marcadorOrigem: string | null;
  /** Idem: rastrear até o exame é privilégio de quem pode abrir o exame. */
  exameId: string | null;
  /**
   * Origem quando o alerta nasceu de uma condição de saúde. Este vem sempre
   * preenchido: condição é legível pelos três profissionais, ao contrário do
   * exame — um personal que não sabe da lesão prescreve o exercício errado.
   */
  condicaoId: string | null;
  criadoEm: string;
  reconhecidoEm: string | null;
  reconhecidoPor: { id: string; nome: string } | null;
}

export const reconhecerAlertaSchema = z.object({
  anotacao: z.string().max(500).optional(),
});
export type ReconhecerAlertaInput = z.infer<typeof reconhecerAlertaSchema>;
