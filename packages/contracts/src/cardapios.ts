import { z } from 'zod';
import type { Macros } from './nutricao';
import { refeicaoSchema } from './nutricao';

/**
 * Modelo de cardápio: o molde reutilizável do nutricionista.
 *
 * Aplicar num paciente cria um PlanoDieta independente — ajustar a dieta dele
 * depois não altera o molde, e mexer no molde não altera dietas já entregues.
 */
export const criarModeloCardapioSchema = z.object({
  nome: z.string().min(2).max(120),
  descricao: z.string().max(500).optional(),
  kcalAlvo: z.number().int().min(500).max(8000).optional(),
  proteinaAlvoG: z.number().int().min(0).max(600).optional(),
  carboAlvoG: z.number().int().min(0).max(1200).optional(),
  gorduraAlvoG: z.number().int().min(0).max(400).optional(),
  refeicoes: z.array(refeicaoSchema).min(1).max(12),
});
export type CriarModeloCardapioInput = z.infer<typeof criarModeloCardapioSchema>;

/** Salva um plano já montado como molde, para reaproveitar em outros pacientes. */
export const salvarComoModeloSchema = z.object({
  planoDietaId: z.string().cuid(),
  nome: z.string().min(2).max(120),
  descricao: z.string().max(500).optional(),
});
export type SalvarComoModeloInput = z.infer<typeof salvarComoModeloSchema>;

export const aplicarModeloSchema = z.object({
  /** Nome do plano no paciente. Sem isso, herda o nome do molde. */
  nome: z.string().min(2).max(120).optional(),
  ativar: z.boolean().default(false),
});
export type AplicarModeloInput = z.infer<typeof aplicarModeloSchema>;

export interface ModeloCardapioResumo {
  id: string;
  nome: string;
  descricao: string | null;
  kcalAlvo: number | null;
  proteinaAlvoG: number | null;
  carboAlvoG: number | null;
  gorduraAlvoG: number | null;
  totalRefeicoes: number;
  macrosTotais: Macros;
  criadoEm: string;
}

export interface ModeloCardapioCompleto extends ModeloCardapioResumo {
  refeicoes: {
    id: string;
    nome: string;
    horarioSugerido: string | null;
    ordem: number;
    macros: Macros;
    itens: {
      id: string;
      quantidadeG: number;
      observacao: string | null;
      macros: Macros;
      alimento: { id: string; nome: string; grupo: string; medidaCaseira: string | null };
    }[];
  }[];
}
