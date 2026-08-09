import { z } from 'zod';
import type { AnguloFoto } from './midia';

/**
 * Comparativo de evolução: "antes e depois" lado a lado.
 *
 * É o documento que o profissional entrega ao aluno — o que mostra que os
 * meses valeram alguma coisa. Por isso ele não é um gráfico: é um par de
 * colunas, com os mesmos campos nas duas, e a diferença calculada no meio.
 */

/**
 * Períodos oferecidos.
 *
 * 60 dias é o ciclo clássico de reavaliação; 90 e 120 existem porque em
 * emagrecimento lento ou ganho de massa a diferença de 60 dias às vezes ainda
 * não aparece na foto — e um comparativo sem diferença visível desanima em vez
 * de motivar. 30 fica para quem acompanha de perto.
 */
export const PERIODOS_COMPARATIVO = [30, 60, 90, 120] as const;
export type PeriodoComparativo = (typeof PERIODOS_COMPARATIVO)[number];

export const consultaComparativoSchema = z.object({
  dias: z.coerce
    .number()
    .int()
    .refine((n): n is PeriodoComparativo => PERIODOS_COMPARATIVO.includes(n as PeriodoComparativo), {
      message: `Período deve ser um de: ${PERIODOS_COMPARATIVO.join(', ')} dias.`,
    })
    .default(60),
});
export type ConsultaComparativo = z.infer<typeof consultaComparativoSchema>;

export interface FotoDoComparativo {
  id: string;
  data: string;
  angulo: AnguloFoto;
  /** Link assinado; expira em minutos, como toda mídia do app. */
  url: string;
}

/** Um lado do comparativo. Os mesmos campos dos dois lados, sempre. */
export interface LadoDoComparativo {
  /** Data da medição usada. `null` quando não havia medição naquele ponto. */
  data: string | null;
  pesoKg: number | null;
  percentualGordura: number | null;
  massaMagraKg: number | null;
  cinturaCm: number | null;
  quadrilCm: number | null;
  bracoCm: number | null;
  coxaCm: number | null;
  toraxCm: number | null;
  /** Uma foto por ângulo, a mais próxima da data. */
  fotos: FotoDoComparativo[];
}

/**
 * A diferença entre os dois lados.
 *
 * `null` quando falta o dado de um dos lados — e não zero. Zero significaria
 * "não mudou", que é uma afirmação sobre o corpo da pessoa; ausência é
 * ausência.
 */
export interface DiferencaDoComparativo {
  pesoKg: number | null;
  percentualGordura: number | null;
  massaMagraKg: number | null;
  cinturaCm: number | null;
  quadrilCm: number | null;
  bracoCm: number | null;
  coxaCm: number | null;
  toraxCm: number | null;
}

export interface ComparativoDeEvolucao {
  dias: number;
  aluno: { id: string; nome: string };
  antes: LadoDoComparativo;
  agora: LadoDoComparativo;
  diferenca: DiferencaDoComparativo;
  /**
   * Números de treino do período, para o documento não ser só corpo — é o
   * esforço que explica o resultado.
   */
  treino: { sessoes: number; volumeKg: number; minutos: number } | null;
  /** Quando o comparativo foi gerado, para constar no documento impresso. */
  geradoEm: string;
}

/** Campos comparáveis, na ordem em que fazem sentido lidos. */
export const CAMPOS_COMPARATIVO = [
  { chave: 'pesoKg', rotulo: 'Peso', unidade: 'kg' },
  { chave: 'percentualGordura', rotulo: 'Gordura', unidade: '%' },
  { chave: 'massaMagraKg', rotulo: 'Massa magra', unidade: 'kg' },
  { chave: 'cinturaCm', rotulo: 'Cintura', unidade: 'cm' },
  { chave: 'quadrilCm', rotulo: 'Quadril', unidade: 'cm' },
  { chave: 'bracoCm', rotulo: 'Braço', unidade: 'cm' },
  { chave: 'coxaCm', rotulo: 'Coxa', unidade: 'cm' },
  { chave: 'toraxCm', rotulo: 'Tórax', unidade: 'cm' },
] as const;

export type CampoComparativo = (typeof CAMPOS_COMPARATIVO)[number]['chave'];

/**
 * Se a variação daquele campo é uma boa notícia.
 *
 * Não é universal e por isso não fica na tela: **massa magra subindo é bom,
 * cintura subindo não é** — e para peso não dá para dizer, porque depende do
 * objetivo. Onde não dá para afirmar, devolve `null` e a tela mostra em cor
 * neutra. Pintar de vermelho o ganho de peso de quem está em hipertrofia seria
 * dizer a ela que fracassou.
 */
export function variacaoEhPositiva(campo: CampoComparativo, delta: number): boolean | null {
  if (delta === 0) return null;
  if (campo === 'massaMagraKg') return delta > 0;
  if (campo === 'percentualGordura' || campo === 'cinturaCm') return delta < 0;
  return null;
}
