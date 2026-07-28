import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  AlimentoResumo,
  BuscarSubstitutosQuery,
  ListarAlimentosQuery,
  SubstitutoSugerido,
} from '@vivio/contracts';
import { ErroDominio } from '../../common/erros/erro-dominio';
import { PrismaService } from '../../infra/prisma.service';
import { macrosDaPorcao, quantidadeEquivalentePorKcal } from './macros';

type LinhaAlimento = Prisma.AlimentoGetPayload<Record<string, never>>;

export function paraResumoAlimento(a: LinhaAlimento): AlimentoResumo {
  return {
    id: a.id,
    nome: a.nome,
    grupo: a.grupo,
    porcao100g: {
      kcal: Number(a.kcal),
      proteinaG: Number(a.proteinaG),
      carboidratoG: Number(a.carboidratoG),
      gorduraG: Number(a.gorduraG),
      fibraG: a.fibraG === null ? 0 : Number(a.fibraG),
    },
    medidaCaseira: a.medidaCaseira,
    medidaGramas: a.medidaGramas === null ? null : Number(a.medidaGramas),
  };
}

@Injectable()
export class AlimentosService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(consulta: ListarAlimentosQuery): Promise<AlimentoResumo[]> {
    const alimentos = await this.prisma.alimento.findMany({
      where: {
        ...(consulta.grupo ? { grupo: consulta.grupo } : {}),
        ...(consulta.q
          ? { nome: { contains: consulta.q, mode: Prisma.QueryMode.insensitive } }
          : {}),
      },
      orderBy: [{ grupo: 'asc' }, { nome: 'asc' }],
      take: consulta.limit,
    });
    return alimentos.map(paraResumoAlimento);
  }

  async grupos(): Promise<string[]> {
    const linhas = await this.prisma.alimento.findMany({
      distinct: ['grupo'],
      select: { grupo: true },
      orderBy: { grupo: 'asc' },
    });
    return linhas.map((l) => l.grupo);
  }

  /**
   * Substituições com equivalência nutricional.
   *
   * Iso-calórico primeiro (é o que o aluno percebe), depois filtrando por
   * proteína dentro da tolerância — trocar frango por arroz "bate as calorias"
   * mas destrói a dieta, e é isso que o desvio de proteína evita.
   */
  async substitutosPara(
    itemRefeicaoId: string,
    consulta: BuscarSubstitutosQuery,
  ): Promise<SubstitutoSugerido[]> {
    const item = await this.prisma.itemRefeicao.findUnique({
      where: { id: itemRefeicaoId },
      include: { alimento: true },
    });
    if (!item) throw ErroDominio.naoEncontrado('Item da refeição');

    const original = macrosDaPorcao(item.alimento, item.quantidadeG);
    if (original.kcal <= 0) return [];

    const candidatos = await this.prisma.alimento.findMany({
      where: { grupo: item.alimento.grupo, NOT: { id: item.alimentoId }, kcal: { gt: 0 } },
      take: 60,
    });

    const sugestoes: SubstitutoSugerido[] = [];

    for (const candidato of candidatos) {
      const quantidade = quantidadeEquivalentePorKcal(original.kcal, Number(candidato.kcal));
      if (quantidade === null || quantidade > 2000) continue;

      const macros = macrosDaPorcao(candidato, quantidade);
      const desvioProteina =
        original.proteinaG > 0
          ? (macros.proteinaG - original.proteinaG) / original.proteinaG
          : macros.proteinaG > 0
            ? 1
            : 0;

      if (Math.abs(desvioProteina) > consulta.tolerancia) continue;

      sugestoes.push({
        alimento: paraResumoAlimento(candidato),
        quantidadeEquivalenteG: quantidade,
        macros,
        desvioProteina: Math.round(desvioProteina * 1000) / 1000,
      });
    }

    // Mais parecido primeiro.
    sugestoes.sort((a, b) => Math.abs(a.desvioProteina) - Math.abs(b.desvioProteina));
    return sugestoes.slice(0, consulta.limit);
  }
}
