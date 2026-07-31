import { Injectable } from '@nestjs/common';
import { Prisma, StatusCobranca, StatusVinculo } from '@prisma/client';
import type {
  CobrancaResumo,
  ConsultaFinanceiro,
  CriarCobrancaInput,
  RegistrarPagamentoInput,
  ResumoFinanceiro,
  SituacaoCobranca,
} from '@vivio/contracts';
import { randomUUID } from 'node:crypto';
import { ErroDominio } from '../../common/erros/erro-dominio';
import { PrismaService } from '../../infra/prisma.service';

const INCLUDE = { aluno: { select: { id: true, nome: true } } } as const;
type LinhaCobranca = Prisma.CobrancaGetPayload<{ include: typeof INCLUDE }>;

const DIA_EM_MS = 24 * 60 * 60 * 1000;
const soData = (d: Date): string => d.toISOString().slice(0, 10);

/** Hoje à meia-noite UTC: o vencimento é DATE, sem hora. */
function hojeSemHora(): Date {
  return new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
}

/**
 * Mesmo dia nos meses seguintes.
 *
 * Dia 31 em fevereiro não existe: o `Date` do JS viraria 3 de março. Aqui a
 * data é presa ao último dia do mês, que é como boleto e mensalidade se
 * comportam na vida real.
 */
function somarMeses(base: Date, meses: number): Date {
  const ano = base.getUTCFullYear();
  const mes = base.getUTCMonth() + meses;
  const dia = base.getUTCDate();
  const ultimoDiaDoMes = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  return new Date(Date.UTC(ano, mes, Math.min(dia, ultimoDiaDoMes)));
}

@Injectable()
export class FinanceiroService {
  constructor(private readonly prisma: PrismaService) {}

  private situacaoDe(c: LinhaCobranca, hoje: Date): SituacaoCobranca {
    if (c.status === StatusCobranca.PAGA) return 'PAGA';
    if (c.status === StatusCobranca.CANCELADA) return 'CANCELADA';
    return c.vencimento < hoje ? 'ATRASADA' : 'PENDENTE';
  }

  private paraResumo(c: LinhaCobranca, hoje: Date): CobrancaResumo {
    const situacao = this.situacaoDe(c, hoje);
    return {
      id: c.id,
      aluno: c.aluno,
      descricao: c.descricao,
      valorCentavos: c.valorCentavos,
      vencimento: soData(c.vencimento),
      situacao,
      pagaEm: c.pagaEm ? soData(c.pagaEm) : null,
      formaPagamento: c.formaPagamento,
      observacao: c.observacao,
      diasDeAtraso:
        situacao === 'ATRASADA'
          ? Math.floor((hoje.getTime() - c.vencimento.getTime()) / DIA_EM_MS)
          : null,
    };
  }

  async resumo(profissionalId: string, consulta: ConsultaFinanceiro): Promise<ResumoFinanceiro> {
    const hoje = hojeSemHora();
    const mes = consulta.mes ?? new Date().toISOString().slice(0, 7);
    const inicio = new Date(`${mes}-01T00:00:00.000Z`);
    const fim = somarMeses(inicio, 1);

    const cobrancas = await this.prisma.cobranca.findMany({
      where: {
        profissionalId,
        vencimento: { gte: inicio, lt: fim },
        ...(consulta.alunoId ? { alunoId: consulta.alunoId } : {}),
      },
      include: INCLUDE,
      orderBy: [{ vencimento: 'asc' }, { aluno: { nome: 'asc' } }],
    });

    const resumos = cobrancas.map((c) => this.paraResumo(c, hoje));
    const filtradas = consulta.situacao
      ? resumos.filter((c) => c.situacao === consulta.situacao)
      : resumos;

    // Os totais consideram o mês inteiro, não o filtro: filtrar por "atrasada"
    // não pode zerar o que já foi recebido.
    const somar = (situacoes: SituacaoCobranca[]) =>
      resumos
        .filter((c) => situacoes.includes(c.situacao))
        .reduce((s, c) => s + c.valorCentavos, 0);

    const emAtraso = resumos.filter((c) => c.situacao === 'ATRASADA');

    return {
      mes,
      recebidoCentavos: somar(['PAGA']),
      aReceberCentavos: somar(['PENDENTE']),
      atrasadoCentavos: somar(['ATRASADA']),
      alunosEmAtraso: new Set(emAtraso.map((c) => c.aluno.id)).size,
      cobrancas: filtradas,
    };
  }

  /**
   * Cria a cobrança e, se pedido, as parcelas seguintes.
   *
   * As parcelas nascem juntas em vez de serem geradas por um job mensal: o
   * profissional vê o ano inteiro de uma vez, e não existe mês que "não gerou"
   * porque o agendador falhou.
   */
  async criar(profissionalId: string, dados: CriarCobrancaInput): Promise<CobrancaResumo[]> {
    const vinculo = await this.prisma.vinculo.findFirst({
      where: { profissionalId, alunoId: dados.alunoId, status: StatusVinculo.ATIVO },
    });
    if (!vinculo) {
      throw ErroDominio.papelNaoAutorizado('Só é possível cobrar alunos com vínculo ativo.');
    }

    const loteId = dados.repetirMeses > 1 ? randomUUID() : null;
    const base = new Date(`${soData(dados.vencimento)}T00:00:00.000Z`);

    await this.prisma.cobranca.createMany({
      data: Array.from({ length: dados.repetirMeses }, (_, i) => ({
        profissionalId,
        alunoId: dados.alunoId,
        descricao: dados.descricao.trim(),
        valorCentavos: dados.valorCentavos,
        vencimento: somarMeses(base, i),
        observacao: dados.observacao,
        loteId,
      })),
    });

    const hoje = hojeSemHora();
    const criadas = await this.prisma.cobranca.findMany({
      where: loteId
        ? { loteId }
        : { profissionalId, alunoId: dados.alunoId, vencimento: base, status: StatusCobranca.PENDENTE },
      include: INCLUDE,
      orderBy: { vencimento: 'asc' },
    });
    return criadas.map((c) => this.paraResumo(c, hoje));
  }

  async registrarPagamento(
    profissionalId: string,
    id: string,
    dados: RegistrarPagamentoInput,
  ): Promise<CobrancaResumo> {
    const cobranca = await this.exigirPropria(profissionalId, id);
    if (cobranca.status === StatusCobranca.PAGA) {
      throw ErroDominio.conflito('Esta cobrança já está paga.');
    }

    const atualizada = await this.prisma.cobranca.update({
      where: { id },
      data: {
        status: StatusCobranca.PAGA,
        pagaEm: new Date(`${soData(dados.pagaEm)}T00:00:00.000Z`),
        formaPagamento: dados.formaPagamento,
        observacao: dados.observacao ?? cobranca.observacao,
      },
      include: INCLUDE,
    });
    return this.paraResumo(atualizada, hojeSemHora());
  }

  /** Desfaz o pagamento — erro de digitação acontece. */
  async estornar(profissionalId: string, id: string): Promise<CobrancaResumo> {
    await this.exigirPropria(profissionalId, id);
    const atualizada = await this.prisma.cobranca.update({
      where: { id },
      data: { status: StatusCobranca.PENDENTE, pagaEm: null, formaPagamento: null },
      include: INCLUDE,
    });
    return this.paraResumo(atualizada, hojeSemHora());
  }

  async cancelar(profissionalId: string, id: string): Promise<CobrancaResumo> {
    const cobranca = await this.exigirPropria(profissionalId, id);
    if (cobranca.status === StatusCobranca.PAGA) {
      throw ErroDominio.conflito('Cobrança paga não pode ser cancelada. Estorne antes.');
    }
    const atualizada = await this.prisma.cobranca.update({
      where: { id },
      data: { status: StatusCobranca.CANCELADA },
      include: INCLUDE,
    });
    return this.paraResumo(atualizada, hojeSemHora());
  }

  /** Remove a série inteira de parcelas — só as que ainda não foram pagas. */
  async removerLote(profissionalId: string, id: string): Promise<{ removidas: number }> {
    const cobranca = await this.exigirPropria(profissionalId, id);
    if (!cobranca.loteId) {
      await this.prisma.cobranca.delete({ where: { id } });
      return { removidas: 1 };
    }
    const r = await this.prisma.cobranca.deleteMany({
      where: { loteId: cobranca.loteId, profissionalId, status: { not: StatusCobranca.PAGA } },
    });
    return { removidas: r.count };
  }

  private async exigirPropria(profissionalId: string, id: string) {
    const cobranca = await this.prisma.cobranca.findUnique({ where: { id } });
    if (!cobranca || cobranca.profissionalId !== profissionalId) {
      throw ErroDominio.naoEncontrado('Cobrança');
    }
    return cobranca;
  }
}
