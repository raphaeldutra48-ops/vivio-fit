import { Injectable } from '@nestjs/common';
import { Prisma, StatusPlano } from '@prisma/client';
import type {
  CriarPlanoDietaInput,
  PlanoDietaCompleto,
  PlanoDietaResumo,
  RefeicaoResumo,
} from '@vivio/contracts';
import { ErroDominio } from '../../common/erros/erro-dominio';
import { PrismaService } from '../../infra/prisma.service';
import { paraResumoAlimento } from './alimentos.service';
import { macrosDaPorcao, somarMacros } from './macros';

type DietaComTudo = Prisma.PlanoDietaGetPayload<{
  include: {
    nutricionista: { select: { id: true; nome: true } };
    refeicoes: { include: { itens: { include: { alimento: true } } } };
  };
}>;

// Sem anotacao de tipo: anotar como Prisma.PlanoDietaInclude apaga o tipo
// literal e o Prisma perde a inferencia do payload retornado.
const INCLUDE_COMPLETO = {
  nutricionista: { select: { id: true, nome: true } },
  refeicoes: {
    orderBy: { ordem: Prisma.SortOrder.asc },
    include: {
      itens: { orderBy: { ordem: Prisma.SortOrder.asc }, include: { alimento: true } },
    },
  },
} as const;

@Injectable()
export class DietasService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(alunoId: string): Promise<PlanoDietaResumo[]> {
    const planos = await this.prisma.planoDieta.findMany({
      where: { alunoId },
      include: INCLUDE_COMPLETO,
      orderBy: [{ status: 'asc' }, { criadoEm: 'desc' }],
    });
    return planos.map((p) => {
      const { refeicoes: _r, ...resumo } = this.paraCompleto(p);
      return resumo;
    });
  }

  async obterAtiva(alunoId: string): Promise<PlanoDietaCompleto> {
    const plano = await this.prisma.planoDieta.findFirst({
      where: { alunoId, status: StatusPlano.ATIVO },
      include: INCLUDE_COMPLETO,
    });
    if (!plano) throw ErroDominio.naoEncontrado('Plano alimentar ativo');
    return this.paraCompleto(plano);
  }

  async obter(alunoId: string, planoId: string): Promise<PlanoDietaCompleto> {
    const plano = await this.prisma.planoDieta.findUnique({
      where: { id: planoId },
      include: INCLUDE_COMPLETO,
    });
    if (!plano || plano.alunoId !== alunoId) throw ErroDominio.naoEncontrado('Plano alimentar');
    return this.paraCompleto(plano);
  }

  async criar(
    alunoId: string,
    nutricionistaId: string,
    dados: CriarPlanoDietaInput,
  ): Promise<PlanoDietaCompleto> {
    await this.exigirAlimentosExistentes(dados);

    const plano = await this.prisma.$transaction(async (tx) => {
      const criado = await tx.planoDieta.create({
        data: this.dadosDeCriacao(alunoId, nutricionistaId, dados),
        include: INCLUDE_COMPLETO,
      });
      if (dados.ativar) return this.ativarNaTransacao(tx, criado.id, alunoId);
      return criado;
    });

    return this.paraCompleto(plano);
  }

  /** Ajuste de dieta cria versão nova, como no treino — o histórico precisa ficar legível. */
  async criarNovaVersao(
    alunoId: string,
    nutricionistaId: string,
    planoAnteriorId: string,
    dados: CriarPlanoDietaInput,
  ): Promise<PlanoDietaCompleto> {
    const anterior = await this.prisma.planoDieta.findUnique({ where: { id: planoAnteriorId } });
    if (!anterior || anterior.alunoId !== alunoId) {
      throw ErroDominio.naoEncontrado('Plano alimentar');
    }
    await this.exigirAlimentosExistentes(dados);
    const eraAtivo = anterior.status === StatusPlano.ATIVO;

    const plano = await this.prisma.$transaction(async (tx) => {
      const nova = await tx.planoDieta.create({
        data: {
          ...this.dadosDeCriacao(alunoId, nutricionistaId, dados),
          versao: anterior.versao + 1,
          raizId: anterior.raizId ?? anterior.id,
        },
        include: INCLUDE_COMPLETO,
      });
      if (eraAtivo || dados.ativar) return this.ativarNaTransacao(tx, nova.id, alunoId);
      return nova;
    });

    return this.paraCompleto(plano);
  }

  async ativar(alunoId: string, planoId: string): Promise<PlanoDietaCompleto> {
    const plano = await this.prisma.planoDieta.findUnique({ where: { id: planoId } });
    if (!plano || plano.alunoId !== alunoId) throw ErroDominio.naoEncontrado('Plano alimentar');
    if (plano.status === StatusPlano.ATIVO) throw ErroDominio.conflito('Este plano já está ativo.');

    const ativado = await this.prisma.$transaction((tx) =>
      this.ativarNaTransacao(tx, planoId, alunoId),
    );
    return this.paraCompleto(ativado);
  }

  // --- auxiliares ---------------------------------------------------------

  private dadosDeCriacao(
    alunoId: string,
    nutricionistaId: string,
    dados: CriarPlanoDietaInput,
  ): Prisma.PlanoDietaCreateInput {
    return {
      aluno: { connect: { id: alunoId } },
      nutricionista: { connect: { id: nutricionistaId } },
      nome: dados.nome.trim(),
      observacao: dados.observacao,
      kcalAlvo: dados.kcalAlvo,
      proteinaAlvoG: dados.proteinaAlvoG,
      carboAlvoG: dados.carboAlvoG,
      gorduraAlvoG: dados.gorduraAlvoG,
      status: StatusPlano.RASCUNHO,
      refeicoes: {
        create: dados.refeicoes.map((refeicao, indiceRefeicao) => ({
          nome: refeicao.nome,
          horarioSugerido: refeicao.horarioSugerido,
          ordem: indiceRefeicao,
          itens: {
            create: refeicao.itens.map((item, indiceItem) => ({
              alimentoId: item.alimentoId,
              quantidadeG: item.quantidadeG,
              observacao: item.observacao,
              ordem: indiceItem,
            })),
          },
        })),
      },
    };
  }

  private async ativarNaTransacao(
    tx: Prisma.TransactionClient,
    planoId: string,
    alunoId: string,
  ) {
    await tx.planoDieta.updateMany({
      where: { alunoId, status: StatusPlano.ATIVO, NOT: { id: planoId } },
      data: { status: StatusPlano.ARQUIVADO, fimEm: new Date() },
    });
    return tx.planoDieta.update({
      where: { id: planoId },
      data: { status: StatusPlano.ATIVO, inicioEm: new Date() },
      include: INCLUDE_COMPLETO,
    });
  }

  private async exigirAlimentosExistentes(dados: CriarPlanoDietaInput): Promise<void> {
    const ids = [...new Set(dados.refeicoes.flatMap((r) => r.itens.map((i) => i.alimentoId)))];
    const encontrados = await this.prisma.alimento.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    if (encontrados.length !== ids.length) {
      const achados = new Set(encontrados.map((a) => a.id));
      throw ErroDominio.naoEncontrado(
        `Alimento (${ids.filter((id) => !achados.has(id)).join(', ')})`,
      );
    }
  }

  private paraCompleto(plano: DietaComTudo): PlanoDietaCompleto {
    const refeicoes: RefeicaoResumo[] = plano.refeicoes.map((r) => {
      const itens = r.itens.map((i) => ({
        id: i.id,
        ordem: i.ordem,
        quantidadeG: Number(i.quantidadeG),
        observacao: i.observacao,
        alimento: paraResumoAlimento(i.alimento),
        macros: macrosDaPorcao(i.alimento, i.quantidadeG),
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
      // Total real = soma dos itens. Nunca um número digitado à parte.
      macrosTotais: somarMacros(refeicoes.map((r) => r.macros)),
      totalRefeicoes: refeicoes.length,
      nutricionista: plano.nutricionista,
      refeicoes,
    };
  }
}
