import { Injectable } from '@nestjs/common';
import {
  montarEvolucaoCorporal,
  type ConsultaEvolucao,
  type EvolucaoCorporal,
} from '@vivio/contracts';
import { PrismaService } from '../../infra/prisma.service';

/**
 * Busca as medidas; o cálculo mora em `@vivio/contracts`.
 *
 * Ele era daqui. Não precisava ser: é conta sobre linhas que quem pergunta JÁ
 * PODE LER — se não pudesse, o guard não teria deixado chegar até aqui. Uma
 * agregação assim não precisa de servidor, precisa de um lugar com teste.
 *
 * Mudou de lugar em vez de ser reescrito do outro lado. É a diferença entre
 * mover a lógica e traduzi-la: tradução é como as regras de alerta divergiram
 * da fonte uma vez.
 */
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

    return montarEvolucaoCorporal(medidas);
  }
}
