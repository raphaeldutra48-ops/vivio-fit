import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  MENOR_E_MELHOR,
  MetricaCorporal,
  ROTULO_METRICA,
  UNIDADE_METRICA,
  type ConsultaEvolucao,
  type EvolucaoCorporal,
  type PontoDaSerie,
  type SerieCorporal,
} from '@vivio/contracts';
import { PrismaService } from '../../infra/prisma.service';

const num = (v: Prisma.Decimal | null): number | null => (v === null ? null : Number(v));

@Injectable()
export class EvolucaoService {
  constructor(private readonly prisma: PrismaService) {}

  async series(alunoId: string, consulta: ConsultaEvolucao): Promise<EvolucaoCorporal> {
    const medidas = await this.prisma.medida.findMany({
      where: {
        alunoId,
        deletadoEm: null,
        ...(consulta.de || consulta.ate
          ? {
              data: {
                ...(consulta.de ? { gte: new Date(consulta.de) } : {}),
                ...(consulta.ate ? { lte: new Date(consulta.ate) } : {}),
              },
            }
          : {}),
      },
      orderBy: { data: 'asc' },
      take: consulta.limit,
    });

    const pontos = medidas.map((m) => {
      const peso = num(m.pesoKg);
      const percentual = num(m.percentualGordura);

      // Massa magra e gorda: usa o valor da bioimpedância se houver; senão
      // deriva de peso + % de gordura. É o que permite o gráfico existir mesmo
      // com uma balança comum e um adipômetro.
      const massaGorda = peso !== null && percentual !== null ? (peso * percentual) / 100 : null;
      const massaMagra =
        num(m.massaMagraKg) ?? (peso !== null && massaGorda !== null ? peso - massaGorda : null);

      return {
        data: m.data.toISOString().slice(0, 10),
        valores: {
          PESO: peso,
          GORDURA_PERCENTUAL: percentual,
          MASSA_MAGRA: massaMagra === null ? null : Math.round(massaMagra * 100) / 100,
          MASSA_GORDA: massaGorda === null ? null : Math.round(massaGorda * 100) / 100,
          CINTURA: num(m.cinturaCm),
          QUADRIL: num(m.quadrilCm),
          BRACO: num(m.bracoCm),
          COXA: num(m.coxaCm),
          TORAX: num(m.toraxCm),
        } as Record<MetricaCorporal, number | null>,
      };
    });

    const series: SerieCorporal[] = Object.values(MetricaCorporal)
      .map((metrica) => this.montarSerie(metrica, pontos))
      // Métrica sem nenhuma medição não vira gráfico vazio na tela.
      .filter((s) => s.pontos.length > 0);

    return {
      de: medidas[0]?.data.toISOString().slice(0, 10) ?? '',
      ate: medidas[medidas.length - 1]?.data.toISOString().slice(0, 10) ?? '',
      totalMedicoes: medidas.length,
      series,
    };
  }

  private montarSerie(
    metrica: MetricaCorporal,
    linhas: { data: string; valores: Record<MetricaCorporal, number | null> }[],
  ): SerieCorporal {
    const pontos: PontoDaSerie[] = linhas
      .filter((l) => l.valores[metrica] !== null)
      .map((l) => ({ data: l.data, valor: l.valores[metrica]! }));

    const primeiro = pontos[0]?.valor ?? null;
    const ultimo = pontos[pontos.length - 1]?.valor ?? null;

    // Um ponto só não é evolução — é um retrato. Sem variação a exibir.
    const temVariacao = pontos.length >= 2 && primeiro !== null && ultimo !== null;
    const variacao = temVariacao ? Math.round((ultimo - primeiro) * 100) / 100 : null;
    const variacaoPercentual =
      temVariacao && primeiro !== 0
        ? Math.round(((ultimo - primeiro) / primeiro) * 1000) / 10
        : null;

    return {
      metrica,
      rotulo: ROTULO_METRICA[metrica],
      unidade: UNIDADE_METRICA[metrica],
      pontos,
      primeiro,
      ultimo,
      variacao,
      variacaoPercentual,
      evoluiuBem:
        variacao === null || variacao === 0
          ? null
          : MENOR_E_MELHOR.has(metrica)
            ? variacao < 0
            : variacao > 0,
    };
  }
}
