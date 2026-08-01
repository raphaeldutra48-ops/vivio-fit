import { z } from 'zod';

export const MetodoAvaliacao = {
  ADIPOMETRIA: 'ADIPOMETRIA',
  BIOIMPEDANCIA: 'BIOIMPEDANCIA',
  MANUAL: 'MANUAL',
} as const;
export type MetodoAvaliacao = (typeof MetodoAvaliacao)[keyof typeof MetodoAvaliacao];

/**
 * Protocolos de dobras cutâneas.
 *
 * Jackson & Pollock estimam a DENSIDADE corporal a partir do somatório de
 * dobras e da idade; a densidade vira percentual de gordura pela equação de
 * Siri. São estimativas de campo, não medida direta.
 */
export const ProtocoloDobras = {
  POLLOCK_3: 'POLLOCK_3',
  POLLOCK_7: 'POLLOCK_7',
} as const;
export type ProtocoloDobras = (typeof ProtocoloDobras)[keyof typeof ProtocoloDobras];

export const ROTULO_PROTOCOLO: Record<ProtocoloDobras, string> = {
  POLLOCK_3: 'Pollock 3 dobras',
  POLLOCK_7: 'Pollock 7 dobras',
};

export const Dobra = {
  PEITORAL: 'PEITORAL',
  ABDOMINAL: 'ABDOMINAL',
  COXA: 'COXA',
  TRICEPS: 'TRICEPS',
  SUPRAILIACA: 'SUPRAILIACA',
  SUBESCAPULAR: 'SUBESCAPULAR',
  AXILAR_MEDIA: 'AXILAR_MEDIA',
} as const;
export type Dobra = (typeof Dobra)[keyof typeof Dobra];

export const ROTULO_DOBRA: Record<Dobra, string> = {
  PEITORAL: 'Peitoral',
  ABDOMINAL: 'Abdominal',
  COXA: 'Coxa',
  TRICEPS: 'Tríceps',
  SUPRAILIACA: 'Supra-ilíaca',
  SUBESCAPULAR: 'Subescapular',
  AXILAR_MEDIA: 'Axilar média',
};

/**
 * Quais dobras cada protocolo exige. O de 3 dobras muda conforme o sexo — não
 * é uma simplificação nossa, é como as equações foram derivadas.
 */
export const DOBRAS_DO_PROTOCOLO: Record<ProtocoloDobras, Record<'M' | 'F', Dobra[]>> = {
  POLLOCK_3: {
    M: ['PEITORAL', 'ABDOMINAL', 'COXA'],
    F: ['TRICEPS', 'SUPRAILIACA', 'COXA'],
  },
  POLLOCK_7: {
    M: ['PEITORAL', 'AXILAR_MEDIA', 'TRICEPS', 'SUBESCAPULAR', 'ABDOMINAL', 'SUPRAILIACA', 'COXA'],
    F: ['PEITORAL', 'AXILAR_MEDIA', 'TRICEPS', 'SUBESCAPULAR', 'ABDOMINAL', 'SUPRAILIACA', 'COXA'],
  },
};

export const SexoBiologico = { M: 'M', F: 'F' } as const;
export type SexoBiologico = (typeof SexoBiologico)[keyof typeof SexoBiologico];

// --- Entradas ---------------------------------------------------------------

/** Dobra em milímetros. */
const medidaDobra = z.number().min(1).max(100);

export const avaliacaoAdipometriaSchema = z.object({
  metodo: z.literal(MetodoAvaliacao.ADIPOMETRIA),
  data: z.coerce.date().default(() => new Date()),
  protocolo: z.nativeEnum(ProtocoloDobras),
  sexo: z.nativeEnum(SexoBiologico),
  idade: z.number().int().min(7).max(100),
  pesoKg: z.number().min(20).max(400),
  alturaCm: z.number().min(80).max(260).optional(),
  /** Dobras em mm, por ponto anatômico. */
  dobras: z.record(z.nativeEnum(Dobra), medidaDobra),
  observacao: z.string().max(1000).optional(),
});
export type AvaliacaoAdipometriaInput = z.infer<typeof avaliacaoAdipometriaSchema>;

export const avaliacaoBioimpedanciaSchema = z.object({
  metodo: z.literal(MetodoAvaliacao.BIOIMPEDANCIA),
  data: z.coerce.date().default(() => new Date()),
  pesoKg: z.number().min(20).max(400),
  alturaCm: z.number().min(80).max(260).optional(),
  /** O que a balança reporta. */
  percentualGordura: z.number().min(1).max(70),
  massaMagraKg: z.number().min(10).max(200).optional(),
  aguaCorporalPercentual: z.number().min(20).max(80).optional(),
  massaOsseaKg: z.number().min(0.5).max(10).optional(),
  taxaMetabolicaBasal: z.number().int().min(500).max(5000).optional(),
  gorduraVisceral: z.number().min(1).max(60).optional(),
  observacao: z.string().max(1000).optional(),
});
export type AvaliacaoBioimpedanciaInput = z.infer<typeof avaliacaoBioimpedanciaSchema>;

export const registrarAvaliacaoSchema = z.discriminatedUnion('metodo', [
  avaliacaoAdipometriaSchema,
  avaliacaoBioimpedanciaSchema,
]);
export type RegistrarAvaliacaoInput = z.infer<typeof registrarAvaliacaoSchema>;

// --- Saída ------------------------------------------------------------------

export interface ResultadoComposicao {
  percentualGordura: number;
  massaGordaKg: number;
  massaMagraKg: number;
  /** Densidade corporal (g/cm³) — só na adipometria. */
  densidadeCorporal?: number;
  somaDobrasMm?: number;
  imc?: number;
}

export interface AvaliacaoResumo {
  id: string;
  data: string;
  metodo: MetodoAvaliacao;
  protocolo: ProtocoloDobras | null;
  pesoKg: number;
  alturaCm: number | null;
  resultado: ResultadoComposicao;
  dobras: Partial<Record<Dobra, number>> | null;
  bioimpedancia: Record<string, number> | null;
  observacao: string | null;
  avaliador: { id: string; nome: string };
  /** Diferença para a avaliação anterior, quando existe. */
  variacao: { percentualGordura: number; massaMagraKg: number; pesoKg: number } | null;
}

/**
 * Faixas de referência de percentual de gordura (ACSM), por sexo.
 * Servem para situar o número, não para diagnosticar.
 */
export const FAIXAS_GORDURA: Record<
  SexoBiologico,
  { rotulo: string; ate: number }[]
> = {
  M: [
    { rotulo: 'Essencial', ate: 5 },
    { rotulo: 'Atlético', ate: 13 },
    { rotulo: 'Bom', ate: 17 },
    { rotulo: 'Aceitável', ate: 25 },
    { rotulo: 'Acima', ate: 100 },
  ],
  F: [
    { rotulo: 'Essencial', ate: 13 },
    { rotulo: 'Atlético', ate: 20 },
    { rotulo: 'Bom', ate: 24 },
    { rotulo: 'Aceitável', ate: 32 },
    { rotulo: 'Acima', ate: 100 },
  ],
};

export function faixaDeGordura(percentual: number, sexo: SexoBiologico): string {
  return FAIXAS_GORDURA[sexo].find((f) => percentual <= f.ate)?.rotulo ?? 'Acima';
}

// --- Equações ---------------------------------------------------------------

/**
 * As equações moram aqui, e não no `apps/api`, porque a tela de adipometria
 * mostra o percentual enquanto o profissional digita — sem ida e volta a cada
 * dobra. Enquanto isso era uma cópia manual dentro da página, existiam dois
 * conjuntos de coeficientes clínicos para manter iguais, e o dia em que
 * divergissem a prévia diria um número e o gravado seria outro.
 *
 * É a mesma regra do cabeçalho deste pacote: usado pelo backend E por um
 * cliente, mora aqui.
 *
 * São estimativas de campo, validadas para população adulta não atleta. Não
 * substituem DEXA nem diagnóstico.
 */

export class ErroDeCalculo extends Error {}

/** Fora desta faixa o resultado não é fisiologicamente plausível. */
export const PERCENTUAL_MIN = 1;
export const PERCENTUAL_MAX = 70;

/** Siri (1961): converte densidade corporal em percentual de gordura. */
export function siri(densidade: number): number {
  if (densidade <= 0) throw new ErroDeCalculo('Densidade corporal inválida.');
  return 495 / densidade - 450;
}

/**
 * Jackson & Pollock — densidade corporal a partir do somatório de dobras (mm)
 * e da idade (anos). Cada combinação protocolo × sexo tem coeficientes próprios.
 */
export function densidadeCorporal(
  protocolo: ProtocoloDobras,
  sexo: SexoBiologico,
  somaMm: number,
  idade: number,
): number {
  const s = somaMm;
  const s2 = s * s;

  if (protocolo === ProtocoloDobras.POLLOCK_3) {
    // Jackson & Pollock (1978) homens: peitoral, abdominal, coxa
    if (sexo === 'M') return 1.10938 - 0.0008267 * s + 0.0000016 * s2 - 0.0002574 * idade;
    // Jackson, Pollock & Ward (1980) mulheres: tríceps, supra-ilíaca, coxa
    return 1.0994921 - 0.0009929 * s + 0.0000023 * s2 - 0.0001392 * idade;
  }

  // Pollock 7 dobras
  if (sexo === 'M') return 1.112 - 0.00043499 * s + 0.00000055 * s2 - 0.00028826 * idade;
  return 1.097 - 0.00046971 * s + 0.00000056 * s2 - 0.00012828 * idade;
}
