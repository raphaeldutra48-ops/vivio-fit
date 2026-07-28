import { z } from 'zod';

/** Macros de um conjunto qualquer — item, refeição ou dieta inteira. */
export interface Macros {
  kcal: number;
  proteinaG: number;
  carboidratoG: number;
  gorduraG: number;
  fibraG: number;
}

export const MACROS_ZERADOS: Macros = {
  kcal: 0,
  proteinaG: 0,
  carboidratoG: 0,
  gorduraG: 0,
  fibraG: 0,
};

export interface AlimentoResumo {
  id: string;
  nome: string;
  grupo: string;
  /** Sempre por 100 g. */
  porcao100g: Macros;
  medidaCaseira: string | null;
  medidaGramas: number | null;
}

export const listarAlimentosSchema = z.object({
  q: z.string().max(80).optional(),
  grupo: z.string().max(40).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ListarAlimentosQuery = z.infer<typeof listarAlimentosSchema>;

// --- Montagem da dieta ------------------------------------------------------

export const itemRefeicaoSchema = z.object({
  alimentoId: z.string().cuid(),
  quantidadeG: z.number().positive().max(5000),
  observacao: z.string().max(200).optional(),
});
export type ItemRefeicaoInput = z.infer<typeof itemRefeicaoSchema>;

export const refeicaoSchema = z.object({
  nome: z.string().min(1).max(60),
  horarioSugerido: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM')
    .optional(),
  itens: z.array(itemRefeicaoSchema).min(1).max(30),
});
export type RefeicaoInput = z.infer<typeof refeicaoSchema>;

export const criarPlanoDietaSchema = z.object({
  nome: z.string().min(2).max(120),
  observacao: z.string().max(1000).optional(),
  kcalAlvo: z.number().int().min(500).max(8000).optional(),
  proteinaAlvoG: z.number().int().min(0).max(600).optional(),
  carboAlvoG: z.number().int().min(0).max(1200).optional(),
  gorduraAlvoG: z.number().int().min(0).max(400).optional(),
  ativar: z.boolean().default(false),
  refeicoes: z.array(refeicaoSchema).min(1).max(12),
});
export type CriarPlanoDietaInput = z.infer<typeof criarPlanoDietaSchema>;

export interface ItemRefeicaoResumo {
  id: string;
  ordem: number;
  quantidadeG: number;
  observacao: string | null;
  alimento: AlimentoResumo;
  /** Macros já calculados para a quantidade prescrita. */
  macros: Macros;
}

export interface RefeicaoResumo {
  id: string;
  nome: string;
  horarioSugerido: string | null;
  ordem: number;
  itens: ItemRefeicaoResumo[];
  macros: Macros;
}

export interface PlanoDietaResumo {
  id: string;
  nome: string;
  observacao: string | null;
  versao: number;
  status: 'RASCUNHO' | 'ATIVO' | 'ARQUIVADO';
  kcalAlvo: number | null;
  proteinaAlvoG: number | null;
  carboAlvoG: number | null;
  gorduraAlvoG: number | null;
  /** Soma real dos itens — é o número que precisa bater com o alvo. */
  macrosTotais: Macros;
  totalRefeicoes: number;
  nutricionista: { id: string; nome: string };
}

export interface PlanoDietaCompleto extends PlanoDietaResumo {
  refeicoes: RefeicaoResumo[];
}

// --- Substituições ----------------------------------------------------------

export const buscarSubstitutosSchema = z.object({
  /** Tolerância na equivalência, em fração. 0.1 = ±10%. */
  tolerancia: z.coerce.number().min(0.01).max(0.5).default(0.1),
  limit: z.coerce.number().int().min(1).max(20).default(8),
});
export type BuscarSubstitutosQuery = z.infer<typeof buscarSubstitutosSchema>;

export interface SubstitutoSugerido {
  alimento: AlimentoResumo;
  /** Quanto comer para equivaler em calorias ao item original. */
  quantidadeEquivalenteG: number;
  macros: Macros;
  /** Diferença relativa de proteína frente ao original (0.05 = 5% a mais). */
  desvioProteina: number;
}

// --- Registro do dia --------------------------------------------------------

export const StatusRefeicao = {
  FEITA: 'FEITA',
  PARCIAL: 'PARCIAL',
  PULADA: 'PULADA',
} as const;
export type StatusRefeicao = (typeof StatusRefeicao)[keyof typeof StatusRefeicao];

export const registrarRefeicaoSchema = z.object({
  refeicaoId: z.string().cuid(),
  data: z.coerce.date().default(() => new Date()),
  status: z.nativeEnum(StatusRefeicao),
  comentario: z.string().max(500).optional(),
});
export type RegistrarRefeicaoInput = z.infer<typeof registrarRefeicaoSchema>;

// --- Água -------------------------------------------------------------------

export const registrarAguaSchema = z.object({
  volumeMl: z.number().int().min(10).max(3000),
  data: z.coerce.date().default(() => new Date()),
});
export type RegistrarAguaInput = z.infer<typeof registrarAguaSchema>;

export const definirMetaAguaSchema = z.object({
  metaMlDia: z.number().int().min(500).max(8000),
  horaInicio: z.number().int().min(0).max(23).default(7),
  horaFim: z.number().int().min(1).max(23).default(22),
});
export type DefinirMetaAguaInput = z.infer<typeof definirMetaAguaSchema>;

export interface ResumoDeAgua {
  data: string;
  metaMlDia: number;
  consumidoMl: number;
  percentual: number;
  /** Minutos desde o último gole — alimenta o lembrete inteligente. */
  minutosDesdeUltimoRegistro: number | null;
  registros: { id: string; volumeMl: number; registradoEm: string }[];
}

/** Volumes de toque rápido no app. */
export const VOLUMES_RAPIDOS_ML = [200, 300, 500, 750] as const;
