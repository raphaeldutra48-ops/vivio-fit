import { z } from 'zod';

/**
 * Seções de mercado. O aluno percorre o supermercado por corredor, não por
 * macronutriente — agrupar por grupo alimentar faria ele voltar no hortifruti
 * três vezes.
 */
export const SECOES_MERCADO = [
  'Açougue, peixaria e ovos',
  'Hortifruti',
  'Laticínios e frios',
  'Mercearia',
  'Outros',
] as const;
export type SecaoMercado = (typeof SECOES_MERCADO)[number];

export const SECAO_POR_GRUPO: Record<string, SecaoMercado> = {
  PROTEINA: 'Açougue, peixaria e ovos',
  VEGETAL: 'Hortifruti',
  FRUTA: 'Hortifruti',
  LATICINIO: 'Laticínios e frios',
  CARBOIDRATO: 'Mercearia',
  LEGUMINOSA: 'Mercearia',
  GORDURA: 'Mercearia',
};

export const listaDeComprasSchema = z.object({
  /** Por quantos dias o plano deve render. */
  dias: z.coerce.number().int().min(1).max(60).default(7),
});
export type ListaDeComprasQuery = z.infer<typeof listaDeComprasSchema>;

export interface ItemDeCompra {
  alimentoId: string;
  nome: string;
  /** Total em gramas para o período. */
  quantidadeTotalG: number;
  /** Já formatado: "1,05 kg" ou "350 g". */
  quantidadeFormatada: string;
  /** Ex.: "≈ 7 unidades" quando o alimento tem medida caseira. */
  equivalencia: string | null;
  /** Em quais refeições ele aparece — ajuda a conferir o que é. */
  aparecEm: string[];
}

export interface SecaoDaLista {
  secao: SecaoMercado;
  itens: ItemDeCompra[];
}

export interface ListaDeCompras {
  planoNome: string;
  dias: number;
  totalItens: number;
  secoes: SecaoDaLista[];
  geradaEm: string;
}

/** Acima de 1 kg o número em gramas deixa de ser legível na gôndola. */
export function formatarQuantidade(gramas: number): string {
  if (gramas >= 1000) {
    return `${(gramas / 1000).toFixed(2).replace('.', ',')} kg`;
  }
  return `${Math.round(gramas)} g`;
}
