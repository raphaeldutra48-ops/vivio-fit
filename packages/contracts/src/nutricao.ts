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

/** Meta padrão enquanto o nutricionista não define uma. */
export const META_AGUA_PADRAO_ML = 2000;

/**
 * O copo de hoje: quanto já foi, quanto falta, e há quanto tempo não bebe.
 *
 * Função pura, e mora aqui pelo mesmo motivo das séries de evolução e do
 * painel de check-in: é conta sobre linhas que quem pergunta já pode ler. Os
 * dois lados chamam esta mesma implementação enquanto a API existe.
 *
 * Espera os registros em ordem DECRESCENTE de `registradoEm` — o primeiro é o
 * último gole, e é dele que sai o `minutosDesdeUltimoRegistro` que alimenta o
 * lembrete inteligente.
 */
export function resumoDeAgua(
  dia: string,
  metaMlDia: number | null,
  registros: { id: string; volumeMl: number; registradoEm: string }[],
  agora: Date = new Date(),
): ResumoDeAgua {
  const meta = metaMlDia ?? META_AGUA_PADRAO_ML;
  const consumidoMl = registros.reduce((soma, r) => soma + r.volumeMl, 0);
  const ultimo = registros[0];

  return {
    data: dia,
    metaMlDia: meta,
    consumidoMl,
    // Teto em 100: beber o dobro da meta não é 200% de progresso, é o
    // mesmo "cumpriu" — e a barra da tela não passa do fim.
    percentual: Math.min(100, Math.round((consumidoMl / meta) * 100)),
    /*
      Travado em zero: o relógio do banco e o de quem pergunta não são o mesmo,
      e alguns segundos de diferença bastam para o `Math.floor` devolver -1.
      "Bebeu há -1 minuto" não existe; "agora mesmo" existe.
    */
    minutosDesdeUltimoRegistro: ultimo
      ? Math.max(
          0,
          Math.floor((agora.getTime() - new Date(ultimo.registradoEm).getTime()) / 60_000),
        )
      : null,
    registros,
  };
}

// --- cálculo nutricional ----------------------------------------------------

/**
 * Todo o cálculo nutricional do app passa por aqui.
 *
 * A tabela guarda os valores por 100 g, então prescrever 150 g de frango é uma
 * regra de três. Centralizar isso num lugar só é o que faz o total da dieta
 * bater com a soma dos itens — e é por isso que vive no contrato, e não em
 * quem consulta: com a API e o SDK montando a mesma tela, duas versões do
 * arredondamento dariam dois totais para o mesmo cardápio.
 */

/** Duas casas, para o erro de ponto flutuante não se acumular item a item. */
const arredondar = (v: number): number => Math.round(v * 100) / 100;

export function macrosDaPorcao(por100g: Macros, quantidadeG: number): Macros {
  const fator = quantidadeG / 100;
  return {
    kcal: arredondar(por100g.kcal * fator),
    proteinaG: arredondar(por100g.proteinaG * fator),
    carboidratoG: arredondar(por100g.carboidratoG * fator),
    gorduraG: arredondar(por100g.gorduraG * fator),
    fibraG: arredondar(por100g.fibraG * fator),
  };
}

export function somarMacros(lista: Macros[]): Macros {
  const total = lista.reduce(
    (soma, m) => ({
      kcal: soma.kcal + m.kcal,
      proteinaG: soma.proteinaG + m.proteinaG,
      carboidratoG: soma.carboidratoG + m.carboidratoG,
      gorduraG: soma.gorduraG + m.gorduraG,
      fibraG: soma.fibraG + m.fibraG,
    }),
    { ...MACROS_ZERADOS },
  );

  return {
    kcal: arredondar(total.kcal),
    proteinaG: arredondar(total.proteinaG),
    carboidratoG: arredondar(total.carboidratoG),
    gorduraG: arredondar(total.gorduraG),
    fibraG: arredondar(total.fibraG),
  };
}

/**
 * Quantidade do substituto que entrega as mesmas calorias do item original.
 * Alimento sem caloria (água, chá) não tem equivalente calórico.
 */
export function quantidadeEquivalentePorKcal(
  kcalAlvo: number,
  kcalPor100gDoSubstituto: number,
): number | null {
  if (kcalPor100gDoSubstituto <= 0) return null;
  return arredondar((kcalAlvo / kcalPor100gDoSubstituto) * 100);
}

export interface EntradaDosSubstitutos {
  /** Macros do item que está sendo substituído, na quantidade prescrita. */
  original: Macros;
  /** Alimentos do mesmo grupo, sem o próprio original. */
  candidatos: AlimentoResumo[];
  tolerancia: number;
  limit: number;
}

/**
 * Substituições com equivalência nutricional.
 *
 * Iso-calórico primeiro, porque é o que o aluno percebe; depois filtrando pelo
 * desvio de proteína. Trocar frango por arroz "bate as calorias" e destrói a
 * dieta — é exatamente isso que a tolerância evita.
 */
export function montarSubstitutos({
  original,
  candidatos,
  tolerancia,
  limit,
}: EntradaDosSubstitutos): SubstitutoSugerido[] {
  if (original.kcal <= 0) return [];

  const sugestoes: SubstitutoSugerido[] = [];

  for (const candidato of candidatos) {
    const quantidade = quantidadeEquivalentePorKcal(original.kcal, candidato.porcao100g.kcal);
    /*
      Acima de 2 kg a equivalência deixa de ser conselho: alface para bater as
      calorias de um bife é uma sugestão que ninguém consegue comer.
    */
    if (quantidade === null || quantidade > 2000) continue;

    const macros = macrosDaPorcao(candidato.porcao100g, quantidade);
    const desvioProteina =
      original.proteinaG > 0
        ? (macros.proteinaG - original.proteinaG) / original.proteinaG
        : macros.proteinaG > 0
          ? 1
          : 0;

    if (Math.abs(desvioProteina) > tolerancia) continue;

    sugestoes.push({
      alimento: candidato,
      quantidadeEquivalenteG: quantidade,
      macros,
      desvioProteina: Math.round(desvioProteina * 1000) / 1000,
    });
  }

  // Mais parecido primeiro.
  sugestoes.sort((a, b) => Math.abs(a.desvioProteina) - Math.abs(b.desvioProteina));
  return sugestoes.slice(0, limit);
}

/** A dieta como está no banco, com os números já convertidos. */
export interface LinhaDePlanoDieta {
  id: string;
  nome: string;
  observacao: string | null;
  versao: number;
  status: PlanoDietaResumo['status'];
  kcalAlvo: number | null;
  proteinaAlvoG: number | null;
  carboAlvoG: number | null;
  gorduraAlvoG: number | null;
  nutricionista: { id: string; nome: string };
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
 * A dieta como a tela lê, com os macros calculados na leitura.
 *
 * O total NUNCA é um número digitado à parte: é a soma dos itens. Guardado,
 * ele envelheceria no primeiro ajuste de quantidade, e o nutricionista veria
 * um alvo batendo com um cardápio que já não bate.
 */
export function montarPlanoDietaCompleto(plano: LinhaDePlanoDieta): PlanoDietaCompleto {
  const refeicoes: RefeicaoResumo[] = [...plano.refeicoes]
    .sort((a, b) => a.ordem - b.ordem)
    .map((r) => {
      const itens = [...r.itens]
        .sort((a, b) => a.ordem - b.ordem)
        .map((i) => ({
          id: i.id,
          ordem: i.ordem,
          quantidadeG: i.quantidadeG,
          observacao: i.observacao,
          alimento: i.alimento,
          macros: macrosDaPorcao(i.alimento.porcao100g, i.quantidadeG),
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
    id: plano.id,
    nome: plano.nome,
    observacao: plano.observacao,
    versao: plano.versao,
    status: plano.status,
    kcalAlvo: plano.kcalAlvo,
    proteinaAlvoG: plano.proteinaAlvoG,
    carboAlvoG: plano.carboAlvoG,
    gorduraAlvoG: plano.gorduraAlvoG,
    macrosTotais: somarMacros(refeicoes.map((r) => r.macros)),
    totalRefeicoes: refeicoes.length,
    nutricionista: plano.nutricionista,
    refeicoes,
  };
}

/** O que o aluno marcou num dia: feita, parcial ou pulada. */
export interface RegistroDeRefeicao {
  id: string;
  refeicaoId: string;
  refeicaoNome: string;
  /** `AAAA-MM-DD`. */
  data: string;
  status: StatusRefeicao;
  comentario: string | null;
}
