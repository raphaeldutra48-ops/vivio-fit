import { z } from 'zod';

/** Métricas que viram gráfico. */
export const MetricaCorporal = {
  PESO: 'PESO',
  GORDURA_PERCENTUAL: 'GORDURA_PERCENTUAL',
  MASSA_MAGRA: 'MASSA_MAGRA',
  MASSA_GORDA: 'MASSA_GORDA',
  CINTURA: 'CINTURA',
  QUADRIL: 'QUADRIL',
  BRACO: 'BRACO',
  COXA: 'COXA',
  TORAX: 'TORAX',
} as const;
export type MetricaCorporal = (typeof MetricaCorporal)[keyof typeof MetricaCorporal];

export const ROTULO_METRICA: Record<MetricaCorporal, string> = {
  PESO: 'Peso',
  GORDURA_PERCENTUAL: 'Gordura',
  MASSA_MAGRA: 'Massa magra',
  MASSA_GORDA: 'Massa gorda',
  CINTURA: 'Cintura',
  QUADRIL: 'Quadril',
  BRACO: 'Braço',
  COXA: 'Coxa',
  TORAX: 'Tórax',
};

export const UNIDADE_METRICA: Record<MetricaCorporal, string> = {
  PESO: 'kg',
  GORDURA_PERCENTUAL: '%',
  MASSA_MAGRA: 'kg',
  MASSA_GORDA: 'kg',
  CINTURA: 'cm',
  QUADRIL: 'cm',
  BRACO: 'cm',
  COXA: 'cm',
  TORAX: 'cm',
};

/**
 * Para estas métricas, cair é progresso. Define a cor do indicador — verde para
 * "foi na direção certa", e não verde para "subiu".
 */
export const MENOR_E_MELHOR: ReadonlySet<MetricaCorporal> = new Set([
  'GORDURA_PERCENTUAL',
  'MASSA_GORDA',
  'CINTURA',
]);

export interface PontoDaSerie {
  data: string;
  valor: number;
}

export interface SerieCorporal {
  metrica: MetricaCorporal;
  rotulo: string;
  unidade: string;
  pontos: PontoDaSerie[];
  primeiro: number | null;
  ultimo: number | null;
  /** Diferença entre o último e o primeiro ponto do período. */
  variacao: number | null;
  variacaoPercentual: number | null;
  /** true quando a variação foi na direção desejada para esta métrica. */
  evoluiuBem: boolean | null;
}

export interface EvolucaoCorporal {
  de: string;
  ate: string;
  totalMedicoes: number;
  series: SerieCorporal[];
}

export const consultaEvolucaoSchema = z.object({
  de: z.string().optional(),
  ate: z.string().optional(),
  limit: z.coerce.number().int().min(2).max(365).default(60),
});
export type ConsultaEvolucao = z.infer<typeof consultaEvolucaoSchema>;
