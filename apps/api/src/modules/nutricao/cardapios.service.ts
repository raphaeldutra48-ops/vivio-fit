import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  AplicarModeloInput,
  CriarModeloCardapioInput,
  ModeloCardapioCompleto,
  ModeloCardapioResumo,
  PlanoDietaCompleto,
  SalvarComoModeloInput,
} from '@vivio/contracts';
import { ErroDominio } from '../../common/erros/erro-dominio';
import { PrismaService } from '../../infra/prisma.service';
import { DietasService } from './dietas.service';
import { macrosDaPorcao, somarMacros } from './macros';

const INCLUDE_MODELO = {
  refeicoes: {
    orderBy: { ordem: Prisma.SortOrder.asc },
    include: {
      itens: { orderBy: { ordem: Prisma.SortOrder.asc }, include: { alimento: true } },
    },
  },
} as const;

type ModeloComTudo = Prisma.ModeloCardapioGetPayload<{ include: typeof INCLUDE_MODELO }>;

@Injectable()
export class CardapiosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dietas: DietasService,
  ) {}

  async listar(nutricionistaId: string): Promise<ModeloCardapioResumo[]> {
    const modelos = await this.prisma.modeloCardapio.findMany({
      where: { nutricionistaId, deletadoEm: null },
      include: INCLUDE_MODELO,
      orderBy: { atualizadoEm: 'desc' },
    });
    return modelos.map((m) => {
      const { refeicoes: _r, ...resumo } = this.paraCompleto(m);
      return resumo;
    });
  }

  async obter(nutricionistaId: string, modeloId: string): Promise<ModeloCardapioCompleto> {
    const modelo = await this.prisma.modeloCardapio.findUnique({
      where: { id: modeloId },
      include: INCLUDE_MODELO,
    });
    if (!modelo || modelo.deletadoEm || modelo.nutricionistaId !== nutricionistaId) {
      throw ErroDominio.naoEncontrado('Modelo de cardápio');
    }
    return this.paraCompleto(modelo);
  }

  async criar(
    nutricionistaId: string,
    dados: CriarModeloCardapioInput,
  ): Promise<ModeloCardapioCompleto> {
    await this.exigirAlimentos(dados.refeicoes.flatMap((r) => r.itens.map((i) => i.alimentoId)));

    const criado = await this.prisma.modeloCardapio.create({
      data: {
        nutricionistaId,
        nome: dados.nome.trim(),
        descricao: dados.descricao,
        kcalAlvo: dados.kcalAlvo,
        proteinaAlvoG: dados.proteinaAlvoG,
        carboAlvoG: dados.carboAlvoG,
        gorduraAlvoG: dados.gorduraAlvoG,
        refeicoes: {
          create: dados.refeicoes.map((r, ir) => ({
            nome: r.nome,
            horarioSugerido: r.horarioSugerido,
            ordem: ir,
            itens: {
              create: r.itens.map((i, ii) => ({
                alimentoId: i.alimentoId,
                quantidadeG: i.quantidadeG,
                observacao: i.observacao,
                ordem: ii,
              })),
            },
          })),
        },
      },
      include: INCLUDE_MODELO,
    });

    return this.paraCompleto(criado);
  }

  /** Transforma um plano já entregue a um paciente em molde reutilizável. */
  async salvarComoModelo(
    nutricionistaId: string,
    dados: SalvarComoModeloInput,
  ): Promise<ModeloCardapioCompleto> {
    const plano = await this.prisma.planoDieta.findUnique({
      where: { id: dados.planoDietaId },
      include: {
        refeicoes: {
          orderBy: { ordem: 'asc' },
          include: { itens: { orderBy: { ordem: 'asc' } } },
        },
      },
    });
    // Só quem escreveu o plano pode transformá-lo em molde.
    if (!plano || plano.nutricionistaId !== nutricionistaId) {
      throw ErroDominio.naoEncontrado('Plano alimentar');
    }

    return this.criar(nutricionistaId, {
      nome: dados.nome,
      descricao: dados.descricao,
      kcalAlvo: plano.kcalAlvo ?? undefined,
      proteinaAlvoG: plano.proteinaAlvoG ?? undefined,
      carboAlvoG: plano.carboAlvoG ?? undefined,
      gorduraAlvoG: plano.gorduraAlvoG ?? undefined,
      refeicoes: plano.refeicoes.map((r) => ({
        nome: r.nome,
        horarioSugerido: r.horarioSugerido ?? undefined,
        itens: r.itens.map((i) => ({
          alimentoId: i.alimentoId,
          quantidadeG: Number(i.quantidadeG),
          observacao: i.observacao ?? undefined,
        })),
      })),
    });
  }

  /**
   * Aplica o molde num paciente. Cria um PlanoDieta INDEPENDENTE: ajustar a
   * dieta dele depois não mexe no molde, e editar o molde não altera dietas
   * já entregues.
   */
  async aplicar(
    nutricionistaId: string,
    modeloId: string,
    alunoId: string,
    dados: AplicarModeloInput,
  ): Promise<PlanoDietaCompleto> {
    const modelo = await this.obter(nutricionistaId, modeloId);

    return this.dietas.criar(alunoId, nutricionistaId, {
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
    });
  }

  async remover(nutricionistaId: string, modeloId: string): Promise<void> {
    await this.obter(nutricionistaId, modeloId);
    await this.prisma.modeloCardapio.update({
      where: { id: modeloId },
      data: { deletadoEm: new Date() },
    });
  }

  private async exigirAlimentos(ids: string[]): Promise<void> {
    const unicos = [...new Set(ids)];
    const achados = await this.prisma.alimento.findMany({
      where: { id: { in: unicos } },
      select: { id: true },
    });
    if (achados.length !== unicos.length) throw ErroDominio.naoEncontrado('Alimento');
  }

  private paraCompleto(m: ModeloComTudo): ModeloCardapioCompleto {
    const refeicoes = m.refeicoes.map((r) => {
      const itens = r.itens.map((i) => ({
        id: i.id,
        quantidadeG: Number(i.quantidadeG),
        observacao: i.observacao,
        macros: macrosDaPorcao(i.alimento, i.quantidadeG),
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
      criadoEm: m.criadoEm.toISOString(),
      refeicoes,
    };
  }
}
