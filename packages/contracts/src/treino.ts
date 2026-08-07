import { z } from 'zod';

// --- Exercícios -------------------------------------------------------------

export const GRUPOS_MUSCULARES = [
  'PEITO',
  'COSTAS',
  'OMBRO',
  'BICEPS',
  'TRICEPS',
  'PERNA',
  'GLUTEO',
  'PANTURRILHA',
  'ABDOMEN',
  'CORPO_INTEIRO',
  'CARDIO',
] as const;
export type GrupoMuscular = (typeof GRUPOS_MUSCULARES)[number];

export const criarExercicioSchema = z.object({
  nome: z.string().min(2).max(120),
  grupoMuscular: z.enum(GRUPOS_MUSCULARES),
  equipamento: z.string().max(60).optional(),
  instrucoes: z.string().max(2000).optional(),
});
export type CriarExercicioInput = z.infer<typeof criarExercicioSchema>;

export const atualizarExercicioSchema = criarExercicioSchema.partial();
export type AtualizarExercicioInput = z.infer<typeof atualizarExercicioSchema>;

export const listarExerciciosSchema = z.object({
  q: z.string().max(80).optional(),
  grupoMuscular: z.enum(GRUPOS_MUSCULARES).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ListarExerciciosQuery = z.infer<typeof listarExerciciosSchema>;

export interface ExercicioResumo {
  id: string;
  nome: string;
  grupoMuscular: GrupoMuscular;
  equipamento: string | null;
  instrucoes: string | null;
  escopo: 'GLOBAL' | 'PRIVADO';
  temVideo: boolean;
  criadoPorId: string | null;
  /** Link assinado da imagem demonstrativa; `null` quando não há. */
  imagemUrl: string | null;
  /**
   * Crédito a exibir junto da imagem — `null` quando a mídia é própria.
   *
   * Vem do resumo, e não de uma consulta à parte, porque licença aberta exige
   * que o crédito apareça **onde a imagem aparece**. Separar os dois é o jeito
   * mais fácil de a tela mostrar uma sem a outra.
   */
  imagemCredito: string | null;
  videoCredito: string | null;
}

// --- Plano de treino --------------------------------------------------------

export const itemTreinoSchema = z.object({
  exercicioId: z.string().cuid(),
  series: z.number().int().min(1).max(20),
  /** Texto livre: "8-12", "até a falha", "30s". */
  repsAlvo: z.string().min(1).max(30),
  cargaSugeridaKg: z.number().min(0).max(1000).optional(),
  descansoSeg: z.number().int().min(0).max(900).optional(),
  tecnica: z.string().max(60).optional(),
  observacao: z.string().max(500).optional(),
  supersetGrupo: z.string().max(10).optional(),
});
export type ItemTreinoInput = z.infer<typeof itemTreinoSchema>;

export const sessaoTreinoSchema = z.object({
  nome: z.string().min(1).max(60),
  diaSugerido: z.number().int().min(1).max(7).optional(),
  itens: z.array(itemTreinoSchema).min(1).max(30),
});
export type SessaoTreinoInput = z.infer<typeof sessaoTreinoSchema>;

export const criarPlanoTreinoSchema = z.object({
  nome: z.string().min(2).max(120),
  objetivo: z.string().max(200).optional(),
  /** Cria já ATIVO em vez de RASCUNHO. */
  ativar: z.boolean().default(false),
  sessoes: z.array(sessaoTreinoSchema).min(1).max(10),
});
export type CriarPlanoTreinoInput = z.infer<typeof criarPlanoTreinoSchema>;

export interface ItemTreinoResumo {
  id: string;
  ordem: number;
  series: number;
  repsAlvo: string;
  cargaSugeridaKg: number | null;
  descansoSeg: number | null;
  tecnica: string | null;
  observacao: string | null;
  supersetGrupo: string | null;
  exercicio: ExercicioResumo;
}

export interface SessaoTreinoResumo {
  id: string;
  nome: string;
  ordem: number;
  diaSugerido: number | null;
  itens: ItemTreinoResumo[];
}

export interface PlanoTreinoResumo {
  id: string;
  nome: string;
  objetivo: string | null;
  versao: number;
  status: 'RASCUNHO' | 'ATIVO' | 'ARQUIVADO';
  inicioEm: string | null;
  fimEm: string | null;
  totalSessoes: number;
  personal: { id: string; nome: string };
}

/** Payload completo — é o que o mobile guarda em cache para funcionar offline. */
export interface PlanoTreinoCompleto extends PlanoTreinoResumo {
  sessoes: SessaoTreinoResumo[];
}
