import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  MACROS_ZERADOS,
  type Macros,
  type ReceitaResumo,
  type RefeicaoSalvaResumo,
  type SalvarReceitaInput,
  type SalvarRefeicaoInput,
} from '@vivio/contracts';
import { ErroDominio } from '../../common/erros/erro-dominio';
import { PrismaService } from '../../infra/prisma.service';
import { macrosDaPorcao, somarMacros } from './macros';

const RECEITA_INCLUDE = {
  ingredientes: { orderBy: { ordem: 'asc' }, include: { alimento: true } },
} as const;

const REFEICAO_INCLUDE = {
  itens: {
    orderBy: { ordem: 'asc' },
    include: { alimento: true, receita: { include: RECEITA_INCLUDE } },
  },
} as const;

type LinhaReceita = Prisma.ReceitaGetPayload<{ include: typeof RECEITA_INCLUDE }>;
type LinhaRefeicao = Prisma.RefeicaoSalvaGetPayload<{ include: typeof REFEICAO_INCLUDE }>;

const num = (v: Prisma.Decimal | number | null): number => (v === null ? 0 : Number(v));
const arredondar = (v: number): number => Math.round(v * 100) / 100;

/** Divide cada macro pelo rendimento. */
function porPorcao(totais: Macros, rendePorcoes: number): Macros {
  // Rendimento zero seria divisão por zero; o schema já barra, isto é a rede.
  const divisor = rendePorcoes > 0 ? rendePorcoes : 1;
  return {
    kcal: arredondar(totais.kcal / divisor),
    proteinaG: arredondar(totais.proteinaG / divisor),
    carboidratoG: arredondar(totais.carboidratoG / divisor),
    gorduraG: arredondar(totais.gorduraG / divisor),
    fibraG: arredondar(totais.fibraG / divisor),
  };
}

function multiplicar(m: Macros, fator: number): Macros {
  return {
    kcal: arredondar(m.kcal * fator),
    proteinaG: arredondar(m.proteinaG * fator),
    carboidratoG: arredondar(m.carboidratoG * fator),
    gorduraG: arredondar(m.gorduraG * fator),
    fibraG: arredondar(m.fibraG * fator),
  };
}

@Injectable()
export class ReceitasService {
  constructor(private readonly prisma: PrismaService) {}

  // --- receitas -------------------------------------------------------------

  private paraReceita(r: LinhaReceita): ReceitaResumo {
    const ingredientes = r.ingredientes.map((i) => ({
      id: i.id,
      alimentoId: i.alimentoId,
      nome: i.alimento.nome,
      quantidadeG: num(i.quantidadeG),
      observacao: i.observacao,
      macros: macrosDaPorcao(i.alimento, i.quantidadeG),
    }));

    const macrosTotais = somarMacros(ingredientes.map((i) => i.macros));
    const rende = num(r.rendePorcoes);

    return {
      id: r.id,
      nome: r.nome,
      descricao: r.descricao,
      modoPreparo: r.modoPreparo,
      rendePorcoes: rende,
      nomeDaPorcao: r.nomeDaPorcao,
      tempoMinutos: r.tempoMinutos,
      ingredientes,
      macrosTotais,
      macrosPorPorcao: porPorcao(macrosTotais, rende),
      pesoTotalG: arredondar(ingredientes.reduce((s, i) => s + i.quantidadeG, 0)),
    };
  }

  async listarReceitas(autorId: string, busca?: string): Promise<ReceitaResumo[]> {
    const receitas = await this.prisma.receita.findMany({
      where: {
        autorId,
        deletadoEm: null,
        ...(busca ? { nome: { contains: busca, mode: Prisma.QueryMode.insensitive } } : {}),
      },
      include: RECEITA_INCLUDE,
      orderBy: { atualizadoEm: 'desc' },
      take: 100,
    });
    return receitas.map((r) => this.paraReceita(r));
  }

  async criarReceita(autorId: string, dados: SalvarReceitaInput): Promise<ReceitaResumo> {
    await this.exigirAlimentos(dados.ingredientes.map((i) => i.alimentoId));

    const criada = await this.prisma.receita.create({
      data: {
        autorId,
        nome: dados.nome.trim(),
        descricao: dados.descricao,
        modoPreparo: dados.modoPreparo,
        rendePorcoes: dados.rendePorcoes,
        nomeDaPorcao: dados.nomeDaPorcao,
        tempoMinutos: dados.tempoMinutos,
        ingredientes: {
          create: dados.ingredientes.map((i, ordem) => ({
            alimentoId: i.alimentoId,
            quantidadeG: i.quantidadeG,
            observacao: i.observacao,
            ordem,
          })),
        },
      },
      include: RECEITA_INCLUDE,
    });
    return this.paraReceita(criada);
  }

  async atualizarReceita(
    autorId: string,
    id: string,
    dados: SalvarReceitaInput,
  ): Promise<ReceitaResumo> {
    await this.exigirReceitaPropria(autorId, id);
    await this.exigirAlimentos(dados.ingredientes.map((i) => i.alimentoId));

    const atualizada = await this.prisma.$transaction(async (tx) => {
      await tx.ingredienteReceita.deleteMany({ where: { receitaId: id } });
      return tx.receita.update({
        where: { id },
        data: {
          nome: dados.nome.trim(),
          descricao: dados.descricao ?? null,
          modoPreparo: dados.modoPreparo ?? null,
          rendePorcoes: dados.rendePorcoes,
          nomeDaPorcao: dados.nomeDaPorcao ?? null,
          tempoMinutos: dados.tempoMinutos ?? null,
          ingredientes: {
            create: dados.ingredientes.map((i, ordem) => ({
              alimentoId: i.alimentoId,
              quantidadeG: i.quantidadeG,
              observacao: i.observacao,
              ordem,
            })),
          },
        },
        include: RECEITA_INCLUDE,
      });
    });
    return this.paraReceita(atualizada);
  }

  async removerReceita(autorId: string, id: string): Promise<void> {
    await this.exigirReceitaPropria(autorId, id);
    // Soft delete: refeições salvas podem apontar para ela.
    await this.prisma.receita.update({ where: { id }, data: { deletadoEm: new Date() } });
  }

  // --- refeições salvas -----------------------------------------------------

  private paraRefeicao(r: LinhaRefeicao): RefeicaoSalvaResumo {
    const itens = r.itens.map((i) => {
      if (i.receita) {
        const porcoes = num(i.porcoes);
        const daReceita = this.paraReceita(i.receita);
        return {
          id: i.id,
          nome: i.receita.nome,
          ehReceita: true,
          alimentoId: null,
          receitaId: i.receitaId,
          quantidadeG: null,
          porcoes,
          observacao: i.observacao,
          macros: multiplicar(daReceita.macrosPorPorcao, porcoes),
        };
      }

      return {
        id: i.id,
        nome: i.alimento?.nome ?? 'Item removido',
        ehReceita: false,
        alimentoId: i.alimentoId,
        receitaId: null,
        quantidadeG: num(i.quantidadeG),
        porcoes: null,
        observacao: i.observacao,
        macros: i.alimento ? macrosDaPorcao(i.alimento, i.quantidadeG ?? 0) : { ...MACROS_ZERADOS },
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

  async listarRefeicoes(autorId: string): Promise<RefeicaoSalvaResumo[]> {
    const refeicoes = await this.prisma.refeicaoSalva.findMany({
      where: { autorId, deletadoEm: null },
      include: REFEICAO_INCLUDE,
      orderBy: [{ horarioSugerido: 'asc' }, { atualizadoEm: 'desc' }],
      take: 100,
    });
    return refeicoes.map((r) => this.paraRefeicao(r));
  }

  async criarRefeicao(autorId: string, dados: SalvarRefeicaoInput): Promise<RefeicaoSalvaResumo> {
    await this.exigirItens(autorId, dados);

    const criada = await this.prisma.refeicaoSalva.create({
      data: {
        autorId,
        nome: dados.nome.trim(),
        horarioSugerido: dados.horarioSugerido,
        observacao: dados.observacao,
        itens: { create: this.paraItens(dados) },
      },
      include: REFEICAO_INCLUDE,
    });
    return this.paraRefeicao(criada);
  }

  async atualizarRefeicao(
    autorId: string,
    id: string,
    dados: SalvarRefeicaoInput,
  ): Promise<RefeicaoSalvaResumo> {
    await this.exigirRefeicaoPropria(autorId, id);
    await this.exigirItens(autorId, dados);

    const atualizada = await this.prisma.$transaction(async (tx) => {
      await tx.itemRefeicaoSalva.deleteMany({ where: { refeicaoId: id } });
      return tx.refeicaoSalva.update({
        where: { id },
        data: {
          nome: dados.nome.trim(),
          horarioSugerido: dados.horarioSugerido ?? null,
          observacao: dados.observacao ?? null,
          itens: { create: this.paraItens(dados) },
        },
        include: REFEICAO_INCLUDE,
      });
    });
    return this.paraRefeicao(atualizada);
  }

  async removerRefeicao(autorId: string, id: string): Promise<void> {
    await this.exigirRefeicaoPropria(autorId, id);
    await this.prisma.refeicaoSalva.update({ where: { id }, data: { deletadoEm: new Date() } });
  }

  // --- auxiliares -----------------------------------------------------------

  private paraItens(dados: SalvarRefeicaoInput) {
    return dados.itens.map((i, ordem) => ({
      alimentoId: i.alimentoId ?? null,
      receitaId: i.receitaId ?? null,
      quantidadeG: i.quantidadeG ?? null,
      porcoes: i.porcoes ?? null,
      observacao: i.observacao,
      ordem,
    }));
  }

  private async exigirAlimentos(ids: string[]): Promise<void> {
    const unicos = [...new Set(ids)];
    const achados = await this.prisma.alimento.count({ where: { id: { in: unicos } } });
    if (achados !== unicos.length) throw ErroDominio.naoEncontrado('Alimento');
  }

  /** Receita de outro profissional não entra na refeição — nem existe para ele. */
  private async exigirItens(autorId: string, dados: SalvarRefeicaoInput): Promise<void> {
    const alimentos = dados.itens.map((i) => i.alimentoId).filter((v): v is string => Boolean(v));
    if (alimentos.length > 0) await this.exigirAlimentos(alimentos);

    const receitas = [
      ...new Set(dados.itens.map((i) => i.receitaId).filter((v): v is string => Boolean(v))),
    ];
    if (receitas.length === 0) return;

    const achadas = await this.prisma.receita.count({
      where: { id: { in: receitas }, autorId, deletadoEm: null },
    });
    if (achadas !== receitas.length) throw ErroDominio.naoEncontrado('Receita');
  }

  private async exigirReceitaPropria(autorId: string, id: string): Promise<void> {
    const receita = await this.prisma.receita.findUnique({ where: { id } });
    if (!receita || receita.deletadoEm || receita.autorId !== autorId) {
      throw ErroDominio.naoEncontrado('Receita');
    }
  }

  private async exigirRefeicaoPropria(autorId: string, id: string): Promise<void> {
    const refeicao = await this.prisma.refeicaoSalva.findUnique({ where: { id } });
    if (!refeicao || refeicao.deletadoEm || refeicao.autorId !== autorId) {
      throw ErroDominio.naoEncontrado('Refeição');
    }
  }
}
