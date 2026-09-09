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

// --- montagem ---------------------------------------------------------------

const DIA_EM_MS = 24 * 60 * 60 * 1000;

/** Só a data, sem hora: vencimento é DATE e não tem hora nenhuma. */
export function soData(d: Date | string): string {
  return (d instanceof Date ? d : new Date(d)).toISOString().slice(0, 10);
}

/** Hoje à meia-noite UTC — a régua de "atrasada". */
export function hojeSemHora(agora: Date = new Date()): Date {
  return new Date(`${agora.toISOString().slice(0, 10)}T00:00:00.000Z`);
}

/**
 * Mesmo dia nos meses seguintes.
 *
 * Dia 31 em fevereiro não existe: o `Date` do JS viraria 3 de março, e a
 * parcela de fevereiro apareceria em março. Aqui a data é presa ao último dia
 * do mês, que é como boleto e mensalidade se comportam na vida real.
 */
export function somarMeses(base: Date, meses: number): Date {
  const ano = base.getUTCFullYear();
  const mes = base.getUTCMonth() + meses;
  const dia = base.getUTCDate();
  const ultimoDiaDoMes = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  return new Date(Date.UTC(ano, mes, Math.min(dia, ultimoDiaDoMes)));
}

/** A linha da cobrança como está no banco, com os números já convertidos. */
export interface LinhaDeCobranca {
  id: string;
  aluno: { id: string; nome: string };
  descricao: string;
  valorCentavos: number;
  /** `AAAA-MM-DD`. */
  vencimento: string;
  status: string;
  /** `AAAA-MM-DD`, ou `null`. */
  pagaEm: string | null;
  formaPagamento: FormaPagamento | null;
  observacao: string | null;
}

/**
 * A situação que a tela mostra.
 *
 * **Não é a coluna `status`.** ATRASADA não existe no banco: ela é PENDENTE
 * que passou do vencimento, e é assim de propósito — gravada, ela precisaria
 * de um job diário para virar, e todo dia em que o job falhasse a cobrança
 * apareceria em dia.
 */
export function situacaoDaCobranca(c: LinhaDeCobranca, hoje: Date): SituacaoCobranca {
  if (c.status === 'PAGA') return 'PAGA';
  if (c.status === 'CANCELADA') return 'CANCELADA';
  return new Date(`${c.vencimento}T00:00:00.000Z`) < hoje ? 'ATRASADA' : 'PENDENTE';
}

export function montarCobrancaResumo(c: LinhaDeCobranca, hoje: Date): CobrancaResumo {
  const situacao = situacaoDaCobranca(c, hoje);
  return {
    id: c.id,
    aluno: c.aluno,
    descricao: c.descricao,
    valorCentavos: c.valorCentavos,
    vencimento: c.vencimento,
    situacao,
    pagaEm: c.pagaEm,
    formaPagamento: c.formaPagamento,
    observacao: c.observacao,
    diasDeAtraso:
      situacao === 'ATRASADA'
        ? Math.floor(
            (hoje.getTime() - new Date(`${c.vencimento}T00:00:00.000Z`).getTime()) / DIA_EM_MS,
          )
        : null,
  };
}

export interface EntradaDoResumoFinanceiro {
  mes: string;
  /** Todas as cobranças do mês — antes de qualquer filtro de situação. */
  cobrancas: LinhaDeCobranca[];
  situacao?: SituacaoCobranca;
  hoje?: Date;
}

/**
 * O painel do mês.
 *
 * Os totais consideram o mês INTEIRO, e não o filtro: filtrar por "atrasada"
 * não pode zerar o que já foi recebido — o profissional olharia a tela de
 * cobrança e concluiria que não entrou nada no mês.
 */
export function montarResumoFinanceiro({
  mes,
  cobrancas,
  situacao,
  hoje = hojeSemHora(),
}: EntradaDoResumoFinanceiro): ResumoFinanceiro {
  const resumos = cobrancas.map((c) => montarCobrancaResumo(c, hoje));

  const somar = (situacoes: SituacaoCobranca[]): number =>
    resumos.filter((c) => situacoes.includes(c.situacao)).reduce((s, c) => s + c.valorCentavos, 0);

  const emAtraso = resumos.filter((c) => c.situacao === 'ATRASADA');

  return {
    mes,
    recebidoCentavos: somar(['PAGA']),
    aReceberCentavos: somar(['PENDENTE']),
    atrasadoCentavos: somar(['ATRASADA']),
    alunosEmAtraso: new Set(emAtraso.map((c) => c.aluno.id)).size,
    cobrancas: situacao ? resumos.filter((c) => c.situacao === situacao) : resumos,
  };
}

/** As parcelas de uma cobrança repetida, uma por mês a partir do vencimento. */
export function vencimentosDaSerie(vencimento: Date | string, repetirMeses: number): string[] {
  const base = new Date(`${soData(vencimento)}T00:00:00.000Z`);
  return Array.from({ length: Math.max(1, repetirMeses) }, (_, i) =>
    soData(somarMeses(base, i)),
  );
}
