import { z } from 'zod';

export const StatusCobranca = {
  PENDENTE: 'PENDENTE',
  PAGA: 'PAGA',
  CANCELADA: 'CANCELADA',
} as const;
export type StatusCobranca = (typeof StatusCobranca)[keyof typeof StatusCobranca];

export const FormaPagamento = {
  PIX: 'PIX',
  DINHEIRO: 'DINHEIRO',
  CARTAO: 'CARTAO',
  TRANSFERENCIA: 'TRANSFERENCIA',
  OUTRO: 'OUTRO',
} as const;
export type FormaPagamento = (typeof FormaPagamento)[keyof typeof FormaPagamento];

export const ROTULO_FORMA_PAGAMENTO: Record<FormaPagamento, string> = {
  PIX: 'PIX',
  DINHEIRO: 'Dinheiro',
  CARTAO: 'Cartão',
  TRANSFERENCIA: 'Transferência',
  OUTRO: 'Outro',
};

/** O que a tela mostra — inclui "atrasada", que é derivada, não guardada. */
export type SituacaoCobranca = 'PENDENTE' | 'ATRASADA' | 'PAGA' | 'CANCELADA';

export const ROTULO_SITUACAO: Record<SituacaoCobranca, string> = {
  PENDENTE: 'A vencer',
  ATRASADA: 'Atrasada',
  PAGA: 'Paga',
  CANCELADA: 'Cancelada',
};

export const criarCobrancaSchema = z.object({
  alunoId: z.string().cuid(),
  descricao: z.string().min(2).max(160),
  /** Em centavos: dinheiro em ponto flutuante acumula erro de arredondamento. */
  valorCentavos: z.number().int().positive().max(100_000_000),
  vencimento: z.coerce.date(),
  observacao: z.string().max(500).optional(),
  /**
   * Gera esta cobrança e as seguintes, no mesmo dia dos meses seguintes.
   * 1 = só esta. 12 = um ano de mensalidade.
   */
  repetirMeses: z.number().int().min(1).max(36).default(1),
});
export type CriarCobrancaInput = z.infer<typeof criarCobrancaSchema>;

export const registrarPagamentoSchema = z.object({
  pagaEm: z.coerce.date().default(() => new Date()),
  formaPagamento: z.nativeEnum(FormaPagamento),
  observacao: z.string().max(500).optional(),
});
export type RegistrarPagamentoInput = z.infer<typeof registrarPagamentoSchema>;

export const consultaFinanceiroSchema = z.object({
  /** Mês de referência no formato AAAA-MM. Vazio = mês atual. */
  mes: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use o formato AAAA-MM')
    .optional(),
  alunoId: z.string().cuid().optional(),
  situacao: z.enum(['PENDENTE', 'ATRASADA', 'PAGA', 'CANCELADA']).optional(),
});
export type ConsultaFinanceiro = z.infer<typeof consultaFinanceiroSchema>;

export interface CobrancaResumo {
  id: string;
  aluno: { id: string; nome: string };
  descricao: string;
  valorCentavos: number;
  vencimento: string;
  situacao: SituacaoCobranca;
  pagaEm: string | null;
  formaPagamento: FormaPagamento | null;
  observacao: string | null;
  /** Dias de atraso. Só faz sentido quando a situação é ATRASADA. */
  diasDeAtraso: number | null;
}

export interface ResumoFinanceiro {
  mes: string;
  recebidoCentavos: number;
  aReceberCentavos: number;
  atrasadoCentavos: number;
  /** Quantos alunos distintos estão com alguma cobrança atrasada. */
  alunosEmAtraso: number;
  cobrancas: CobrancaResumo[];
}

/** "R$ 149,90" a partir de centavos. */
export function formatarDinheiro(centavos: number): string {
  return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** "149,90" -> 14990. Aceita "R$ 149,90" e "149.90". */
export function paraCentavos(texto: string): number | null {
  const limpo = texto.replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}\b)/g, '');
  const normalizado = limpo.replace(',', '.');
  const valor = Number(normalizado);
  if (!Number.isFinite(valor) || valor <= 0) return null;
  return Math.round(valor * 100);
}
