import { z } from 'zod';
import type { Macros } from './nutricao';

// --- receita ----------------------------------------------------------------

export const ingredienteSchema = z.object({
  alimentoId: z.string().cuid(),
  quantidadeG: z.number().positive().max(100000),
  observacao: z.string().max(200).optional(),
});
export type IngredienteInput = z.infer<typeof ingredienteSchema>;

export const salvarReceitaSchema = z.object({
  nome: z.string().min(2).max(140),
  descricao: z.string().max(500).optional(),
  modoPreparo: z.string().max(4000).optional(),
  /** Rendimento é divisor do cálculo por porção: zero quebraria a conta. */
  rendePorcoes: z.number().positive().max(200).default(1),
  nomeDaPorcao: z.string().max(60).optional(),
  tempoMinutos: z.number().int().min(1).max(1440).optional(),
  ingredientes: z.array(ingredienteSchema).min(1, 'Adicione ao menos um ingrediente').max(60),
});
export type SalvarReceitaInput = z.infer<typeof salvarReceitaSchema>;

export interface IngredienteResumo {
  id: string;
  alimentoId: string;
  nome: string;
  quantidadeG: number;
  observacao: string | null;
  macros: Macros;
}

export interface ReceitaResumo {
  id: string;
  nome: string;
  descricao: string | null;
  modoPreparo: string | null;
  rendePorcoes: number;
  nomeDaPorcao: string | null;
  tempoMinutos: number | null;
  ingredientes: IngredienteResumo[];
  /** Soma dos ingredientes. */
  macrosTotais: Macros;
  /** Totais divididos pelo rendimento — é o que entra num plano alimentar. */
  macrosPorPorcao: Macros;
  /** Peso total dos ingredientes, útil para conferir rendimento. */
  pesoTotalG: number;
}

// --- refeição salva ---------------------------------------------------------

/**
 * Item é alimento OU receita, nunca os dois.
 *
 * Alimento vai em gramas; receita vai em porções, porque é assim que a pessoa
 * pensa ("duas conchas de feijão", não "310 g de feijão pronto").
 */
export const itemRefeicaoSalvaSchema = z
  .object({
    alimentoId: z.string().cuid().optional(),
    receitaId: z.string().cuid().optional(),
    quantidadeG: z.number().positive().max(100000).optional(),
    porcoes: z.number().positive().max(100).optional(),
    observacao: z.string().max(200).optional(),
  })
  .refine((i) => Boolean(i.alimentoId) !== Boolean(i.receitaId), {
    message: 'Informe um alimento ou uma receita, não os dois',
  })
  .refine((i) => (i.alimentoId ? i.quantidadeG !== undefined : i.porcoes !== undefined), {
    message: 'Alimento precisa de quantidade em gramas; receita, de porções',
  });
export type ItemRefeicaoSalvaInput = z.infer<typeof itemRefeicaoSalvaSchema>;

export const salvarRefeicaoSchema = z.object({
  nome: z.string().min(2).max(120),
  horarioSugerido: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use o formato HH:MM')
    .optional(),
  observacao: z.string().max(500).optional(),
  itens: z.array(itemRefeicaoSalvaSchema).min(1, 'Adicione ao menos um item').max(40),
});
export type SalvarRefeicaoInput = z.infer<typeof salvarRefeicaoSchema>;

export interface ItemRefeicaoSalvaResumo {
  id: string;
  /** Nome do alimento ou da receita. */
  nome: string;
  ehReceita: boolean;
  alimentoId: string | null;
  receitaId: string | null;
  quantidadeG: number | null;
  porcoes: number | null;
  observacao: string | null;
  macros: Macros;
}

export interface RefeicaoSalvaResumo {
  id: string;
  nome: string;
  horarioSugerido: string | null;
  observacao: string | null;
  itens: ItemRefeicaoSalvaResumo[];
  macrosTotais: Macros;
}

/** "2 porções (1 fatia)" ou "150 g" — como o item aparece na lista. */
export function descreverItem(item: ItemRefeicaoSalvaResumo): string {
  if (item.ehReceita) {
    const p = item.porcoes ?? 0;
    return `${p} ${p === 1 ? 'porção' : 'porções'}`;
  }
  return `${item.quantidadeG ?? 0} g`;
}
