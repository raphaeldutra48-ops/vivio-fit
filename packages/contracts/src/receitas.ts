import { z } from 'zod';
import {
  MACROS_ZERADOS,
  escalarMacros,
  macrosDaPorcao,
  somarMacros,
  type Macros,
} from './nutricao';

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

// --- montagem ---------------------------------------------------------------

/**
 * A receita montada a partir das linhas do banco.
 *
 * Vive aqui, e não em quem consulta, porque são dois consumidores — a API e o
 * SDK sobre o Postgres — e a mesma tela mostra os dois. Duas implementações do
 * mesmo arredondamento dariam dois totais para a mesma receita, e o critério de
 * aceite da nutrição é justamente o total bater com a soma dos itens.
 *
 * Espera a composição do alimento já em números: converter o `Decimal` do
 * Prisma (ou o texto que o PostgREST devolve para `numeric`) é trabalho de quem
 * leu o banco, e cada um o faz do seu jeito.
 */
export interface LinhaDeIngrediente {
  id: string;
  alimentoId: string;
  nome: string;
  quantidadeG: number;
  observacao: string | null;
  porcao100g: Macros;
}

export interface LinhaDeReceita {
  id: string;
  nome: string;
  descricao: string | null;
  modoPreparo: string | null;
  rendePorcoes: number;
  nomeDaPorcao: string | null;
  tempoMinutos: number | null;
  ingredientes: LinhaDeIngrediente[];
}

/** Divide cada macro pelo rendimento. */
function porPorcao(totais: Macros, rendePorcoes: number): Macros {
  // Rendimento zero seria divisão por zero; o schema já barra, isto é a rede.
  const divisor = rendePorcoes > 0 ? rendePorcoes : 1;
  return escalarMacros(totais, 1 / divisor);
}

export function montarReceita(r: LinhaDeReceita): ReceitaResumo {
  const ingredientes: IngredienteResumo[] = r.ingredientes.map((i) => ({
    id: i.id,
    alimentoId: i.alimentoId,
    nome: i.nome,
    quantidadeG: i.quantidadeG,
    observacao: i.observacao,
    macros: macrosDaPorcao(i.porcao100g, i.quantidadeG),
  }));

  const macrosTotais = somarMacros(ingredientes.map((i) => i.macros));

  return {
    id: r.id,
    nome: r.nome,
    descricao: r.descricao,
    modoPreparo: r.modoPreparo,
    rendePorcoes: r.rendePorcoes,
    nomeDaPorcao: r.nomeDaPorcao,
    tempoMinutos: r.tempoMinutos,
    ingredientes,
    macrosTotais,
    macrosPorPorcao: porPorcao(macrosTotais, r.rendePorcoes),
    // Duas casas, como todo o resto do módulo: somar gramas com casas decimais
    // acumula o resto binário, e o peso total aparece na tela ao lado do rendimento.
    pesoTotalG:
      Math.round(ingredientes.reduce((s, i) => s + i.quantidadeG, 0) * 100) / 100,
  };
}

export interface LinhaDeItemDeRefeicao {
  id: string;
  alimentoId: string | null;
  receitaId: string | null;
  quantidadeG: number | null;
  porcoes: number | null;
  observacao: string | null;
  /** Preenchido quando o item é alimento. */
  alimento: { nome: string; porcao100g: Macros } | null;
  /** Preenchido quando o item é receita. */
  receita: LinhaDeReceita | null;
}

export interface LinhaDeRefeicaoSalva {
  id: string;
  nome: string;
  horarioSugerido: string | null;
  observacao: string | null;
  itens: LinhaDeItemDeRefeicao[];
}

export function montarRefeicaoSalva(r: LinhaDeRefeicaoSalva): RefeicaoSalvaResumo {
  const itens: ItemRefeicaoSalvaResumo[] = r.itens.map((i) => {
    if (i.receita) {
      const porcoes = i.porcoes ?? 0;
      /*
        A receita entra pelo macro POR PORÇÃO, e não pelo total: é assim que a
        pessoa pensa ("duas conchas de feijão", não "310 g de feijão pronto"), e
        é o que faz a mesma receita servir a refeições de tamanhos diferentes.
      */
      const daReceita = montarReceita(i.receita);
      return {
        id: i.id,
        nome: i.receita.nome,
        ehReceita: true,
        alimentoId: null,
        receitaId: i.receitaId,
        quantidadeG: null,
        porcoes,
        observacao: i.observacao,
        macros: escalarMacros(daReceita.macrosPorPorcao, porcoes),
      };
    }

    return {
      id: i.id,
      /*
        "Item removido" e macros zerados quando o alimento sumiu do catálogo. A
        refeição continua abrindo, com um item que a pessoa reconhece como
        quebrado — melhor do que a tela inteira não carregar por causa de uma
        linha.
      */
      nome: i.alimento?.nome ?? 'Item removido',
      ehReceita: false,
      alimentoId: i.alimentoId,
      receitaId: null,
      quantidadeG: i.quantidadeG ?? 0,
      porcoes: null,
      observacao: i.observacao,
      macros: i.alimento
        ? macrosDaPorcao(i.alimento.porcao100g, i.quantidadeG ?? 0)
        : { ...MACROS_ZERADOS },
    };
  });

  return {
    id: r.id,
    nome: r.nome,
    horarioSugerido: r.horarioSugerido,
    observacao: r.observacao,
    itens,
    macrosTotais: somarMacros(itens.map((i) => i.macros)),
  };
}
