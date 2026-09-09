import { z } from 'zod';
import type { AlimentoResumo, CriarPlanoDietaInput, Macros } from './nutricao';
import { macrosDaPorcao, refeicaoSchema, somarMacros } from './nutricao';

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

// --- montagem ---------------------------------------------------------------

/** O molde como está no banco, com os números já convertidos. */
export interface LinhaDeModeloCardapio {
  id: string;
  nome: string;
  descricao: string | null;
  kcalAlvo: number | null;
  proteinaAlvoG: number | null;
  carboAlvoG: number | null;
  gorduraAlvoG: number | null;
  /** ISO com fuso. */
  criadoEm: string;
  refeicoes: {
    id: string;
    nome: string;
    horarioSugerido: string | null;
    ordem: number;
    itens: {
      id: string;
      ordem: number;
      quantidadeG: number;
      observacao: string | null;
      alimento: AlimentoResumo;
    }[];
  }[];
}

/**
 * O molde como a tela lê, com os macros calculados na leitura.
 *
 * Mesma regra da dieta, pelo mesmo motivo: o total é a soma dos itens, nunca
 * um campo. Um molde cujo total não bate com o cardápio é pior que nenhum —
 * ele vai ser aplicado em vários pacientes antes de alguém notar.
 */
export function montarModeloCardapioCompleto(m: LinhaDeModeloCardapio): ModeloCardapioCompleto {
  const refeicoes = [...m.refeicoes]
    .sort((a, b) => a.ordem - b.ordem)
    .map((r) => {
      const itens = [...r.itens]
        .sort((a, b) => a.ordem - b.ordem)
        .map((i) => ({
          id: i.id,
          quantidadeG: i.quantidadeG,
          observacao: i.observacao,
          macros: macrosDaPorcao(i.alimento.porcao100g, i.quantidadeG),
          /*
            O molde mostra menos do alimento que a dieta: aqui basta o nome e a
            medida caseira para o nutricionista reconhecer a linha. Os macros
            de cada item já vêm calculados ao lado.
          */
          alimento: {
            id: i.alimento.id,
            nome: i.alimento.nome,
            grupo: i.alimento.grupo,
            medidaCaseira: i.alimento.medidaCaseira,
          },
        }));

      return {
        id: r.id,
        nome: r.nome,
        horarioSugerido: r.horarioSugerido,
        ordem: r.ordem,
        itens,
        macros: somarMacros(itens.map((i) => i.macros)),
      };
    });

  return {
    id: m.id,
    nome: m.nome,
    descricao: m.descricao,
    kcalAlvo: m.kcalAlvo,
    proteinaAlvoG: m.proteinaAlvoG,
    carboAlvoG: m.carboAlvoG,
    gorduraAlvoG: m.gorduraAlvoG,
    totalRefeicoes: refeicoes.length,
    macrosTotais: somarMacros(refeicoes.map((r) => r.macros)),
    criadoEm: m.criadoEm,
    refeicoes,
  };
}

/**
 * O molde virando o cardápio de um paciente.
 *
 * A dieta criada é INDEPENDENTE: ajustar a dieta dele depois não mexe no
 * molde, e editar o molde não altera dietas já entregues. É o ponto de existir
 * um molde — ele é um ponto de partida, não um vínculo.
 */
export function planoAPartirDoModelo(
  modelo: ModeloCardapioCompleto,
  dados: AplicarModeloInput,
): CriarPlanoDietaInput {
  return {
    nome: dados.nome ?? modelo.nome,
    kcalAlvo: modelo.kcalAlvo ?? undefined,
    proteinaAlvoG: modelo.proteinaAlvoG ?? undefined,
    carboAlvoG: modelo.carboAlvoG ?? undefined,
    gorduraAlvoG: modelo.gorduraAlvoG ?? undefined,
    ativar: dados.ativar,
    refeicoes: modelo.refeicoes.map((r) => ({
      nome: r.nome,
      horarioSugerido: r.horarioSugerido ?? undefined,
      itens: r.itens.map((i) => ({
        alimentoId: i.alimento.id,
        quantidadeG: i.quantidadeG,
        observacao: i.observacao ?? undefined,
      })),
    })),
  };
}
