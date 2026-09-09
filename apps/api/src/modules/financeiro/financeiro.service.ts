import { Injectable } from '@nestjs/common';
import { Prisma, StatusCobranca, StatusVinculo } from '@prisma/client';
import {
  gerarBrCode,
  hojeSemHora,
  montarCobrancaResumo,
  montarResumoFinanceiro,
  normalizarChavePix,
  soData,
  somarMeses,
  validarChavePix,
  type CobrancaComPix,
  type CobrancaResumo,
  type ConsultaFinanceiro,
  type CriarCobrancaInput,
  type DadosDePagamento,
  type RegistrarPagamentoInput,
  type ResumoFinanceiro,
  type SalvarPagamentoInput,
  type SituacaoCobranca,
  type TipoChavePix,
} from '@vivio/contracts';
import { randomUUID } from 'node:crypto';
import { ErroDominio } from '../../common/erros/erro-dominio';
import { PrismaService } from '../../infra/prisma.service';

const INCLUDE = { aluno: { select: { id: true, nome: true } } } as const;
type LinhaCobranca = Prisma.CobrancaGetPayload<{ include: typeof INCLUDE }>;

/*
  `soData`, `hojeSemHora` e `somarMeses` moravam aqui e foram para
  `@vivio/contracts`: o SDK monta o mesmo painel falando direto com o
  Postgres, e duas versões de "dia 31 em fevereiro" gerariam a parcela em
  meses diferentes conforme quem criou a cobrança.
*/

@Injectable()
export class FinanceiroService {
  constructor(private readonly prisma: PrismaService) {}


  /** A montagem mora no contrato: o SDK desenha a mesma linha. */
  private paraResumo(c: LinhaCobranca, hoje: Date): CobrancaResumo {
    return montarCobrancaResumo(this.paraLinha(c), hoje);
  }

  private paraLinha(c: LinhaCobranca) {
    return {
      id: c.id,
      aluno: c.aluno,
      descricao: c.descricao,
      valorCentavos: c.valorCentavos,
      vencimento: soData(c.vencimento),
      status: c.status as string,
      pagaEm: c.pagaEm ? soData(c.pagaEm) : null,
      formaPagamento: c.formaPagamento,
      observacao: c.observacao,
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

    /*
      Os totais consideram o mês inteiro, e não o filtro — filtrar por
      "atrasada" não pode zerar o que já foi recebido. Quem faz essa conta é o
      contrato, porque o SDK desenha o mesmo painel.
    */
    return montarResumoFinanceiro({
      mes,
      cobrancas: cobrancas.map((c) => this.paraLinha(c)),
      situacao: consulta.situacao,
      hoje,
    });
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

  // --- PIX ------------------------------------------------------------------

  async obterDadosDePagamento(profissionalId: string): Promise<DadosDePagamento | null> {
    const dados = await this.prisma.dadosDePagamento.findUnique({ where: { profissionalId } });
    if (!dados) return null;
    return {
      tipoChave: dados.tipoChave as TipoChavePix,
      chave: dados.chave,
      recebedor: dados.recebedor,
      cidade: dados.cidade,
    };
  }

  async salvarDadosDePagamento(
    profissionalId: string,
    dados: SalvarPagamentoInput,
  ): Promise<DadosDePagamento> {
    const problema = validarChavePix(dados.tipoChave, dados.chave);
    if (problema) throw ErroDominio.conflito(problema);

    // Guarda já normalizada: o código é montado a partir daqui, e formatar na
    // hora de gerar espalharia a regra por dois lugares.
    const chave = normalizarChavePix(dados.tipoChave, dados.chave);

    const salvo = await this.prisma.dadosDePagamento.upsert({
      where: { profissionalId },
      create: {
        profissionalId,
        tipoChave: dados.tipoChave,
        chave,
        recebedor: dados.recebedor.trim(),
        cidade: dados.cidade.trim(),
      },
      update: {
        tipoChave: dados.tipoChave,
        chave,
        recebedor: dados.recebedor.trim(),
        cidade: dados.cidade.trim(),
      },
    });

    return {
      tipoChave: salvo.tipoChave as TipoChavePix,
      chave: salvo.chave,
      recebedor: salvo.recebedor,
      cidade: salvo.cidade,
    };
  }

  /**
   * Gera o "copia e cola" de uma cobrança.
   *
   * O identificador leva o id curto da cobrança, então o profissional
   * reconhece o depósito no extrato — é a única conciliação possível sem
   * gateway.
   */
  async gerarPix(profissionalId: string, cobrancaId: string): Promise<CobrancaComPix> {
    const cobranca = await this.prisma.cobranca.findUnique({
      where: { id: cobrancaId },
      include: { aluno: { select: { nome: true } } },
    });
    if (!cobranca || cobranca.profissionalId !== profissionalId) {
      throw ErroDominio.naoEncontrado('Cobrança');
    }
    if (cobranca.status === StatusCobranca.PAGA) {
      throw ErroDominio.conflito('Esta cobrança já está paga.');
    }

    const dados = await this.prisma.dadosDePagamento.findUnique({ where: { profissionalId } });
    if (!dados) {
      throw ErroDominio.conflito(
        'Cadastre sua chave PIX em Receba Fácil antes de gerar o código.',
      );
    }

    return {
      cobrancaId: cobranca.id,
      valorCentavos: cobranca.valorCentavos,
      descricao: cobranca.descricao,
      aluno: cobranca.aluno.nome,
      brCode: gerarBrCode({
        chave: dados.chave,
        recebedor: dados.recebedor,
        cidade: dados.cidade,
        valorCentavos: cobranca.valorCentavos,
        identificador: cobranca.id.slice(-10),
      }),
    };
  }

  private async exigirPropria(profissionalId: string, id: string) {
    const cobranca = await this.prisma.cobranca.findUnique({ where: { id } });
    if (!cobranca || cobranca.profissionalId !== profissionalId) {
      throw ErroDominio.naoEncontrado('Cobrança');
    }
    return cobranca;
  }
}
