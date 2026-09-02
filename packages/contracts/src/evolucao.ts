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

/**
 * Uma linha de medida, do jeito que ela chega — do Prisma ou do PostgREST.
 *
 * Os numéricos aceitam `string` porque o Postgres devolve `numeric` como texto
 * pelo PostgREST e como `Decimal` pelo Prisma. Deixar a conversão aqui, num
 * lugar só, evita que cada chamador invente a sua e uma delas perca casa
 * decimal.
 */
export interface MedidaParaSerie {
  data: string | Date;
  pesoKg?: unknown;
  percentualGordura?: unknown;
  massaMagraKg?: unknown;
  cinturaCm?: unknown;
  quadrilCm?: unknown;
  bracoCm?: unknown;
  coxaCm?: unknown;
  toraxCm?: unknown;
}

const paraNumero = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const paraDia = (v: string | Date): string =>
  (v instanceof Date ? v.toISOString() : v).slice(0, 10);

/**
 * As séries de evolução corporal, a partir das medidas.
 *
 * ## Por que é uma função pura, e por que mora aqui
 *
 * Era um serviço do NestJS. Não precisava ser: o cálculo é sobre linhas que
 * quem pergunta JÁ PODE LER — se não pudesse, a política não teria devolvido
 * as medidas. Uma agregação assim não precisa de servidor; precisa de um lugar
 * com teste.
 *
 * Aqui, os dois lados chamam a mesma implementação enquanto a API existe. É a
 * diferença entre mover a lógica e traduzi-la: tradução é como as regras de
 * alerta divergiram da fonte uma vez.
 *
 * As medidas devem chegar ordenadas por data crescente — `de`, `ate` e a
 * variação saem do primeiro e do último ponto.
 */
export function montarEvolucaoCorporal(medidas: MedidaParaSerie[]): EvolucaoCorporal {
  const pontos = medidas.map((m) => {
    const peso = paraNumero(m.pesoKg);
    const percentual = paraNumero(m.percentualGordura);

    // Massa magra e gorda: usa o valor da bioimpedância se houver; senão
    // deriva de peso + % de gordura. É o que permite o gráfico existir mesmo
    // com uma balança comum e um adipômetro.
    const massaGorda = peso !== null && percentual !== null ? (peso * percentual) / 100 : null;
    const massaMagra =
      paraNumero(m.massaMagraKg) ?? (peso !== null && massaGorda !== null ? peso - massaGorda : null);

    return {
      data: paraDia(m.data),
      valores: {
        PESO: peso,
        GORDURA_PERCENTUAL: percentual,
        MASSA_MAGRA: massaMagra === null ? null : Math.round(massaMagra * 100) / 100,
        MASSA_GORDA: massaGorda === null ? null : Math.round(massaGorda * 100) / 100,
        CINTURA: paraNumero(m.cinturaCm),
        QUADRIL: paraNumero(m.quadrilCm),
        BRACO: paraNumero(m.bracoCm),
        COXA: paraNumero(m.coxaCm),
        TORAX: paraNumero(m.toraxCm),
      } as Record<MetricaCorporal, number | null>,
    };
  });

  const series = Object.values(MetricaCorporal)
    .map((metrica) => montarSerie(metrica, pontos))
    // Métrica sem nenhuma medição não vira gráfico vazio na tela.
    .filter((s) => s.pontos.length > 0);

  return {
    de: pontos[0]?.data ?? '',
    ate: pontos[pontos.length - 1]?.data ?? '',
    totalMedicoes: medidas.length,
    series,
  };
}

function montarSerie(
  metrica: MetricaCorporal,
  linhas: { data: string; valores: Record<MetricaCorporal, number | null> }[],
): SerieCorporal {
  const pontos: PontoDaSerie[] = linhas
    .filter((l) => l.valores[metrica] !== null)
    .map((l) => ({ data: l.data, valor: l.valores[metrica]! }));

  const primeiro = pontos[0]?.valor ?? null;
  const ultimo = pontos[pontos.length - 1]?.valor ?? null;

  // Um ponto só não é evolução — é um retrato. Sem variação a exibir.
  const temVariacao = pontos.length >= 2 && primeiro !== null && ultimo !== null;
  const variacao = temVariacao ? Math.round((ultimo - primeiro) * 100) / 100 : null;
  const variacaoPercentual =
    temVariacao && primeiro !== 0 ? Math.round(((ultimo - primeiro) / primeiro) * 1000) / 10 : null;

  return {
    metrica,
    rotulo: ROTULO_METRICA[metrica],
    unidade: UNIDADE_METRICA[metrica],
    pontos,
    primeiro,
    ultimo,
    variacao,
    variacaoPercentual,
    evoluiuBem:
      variacao === null || variacao === 0
        ? null
        : MENOR_E_MELHOR.has(metrica)
          ? variacao < 0
          : variacao > 0,
  };
}
