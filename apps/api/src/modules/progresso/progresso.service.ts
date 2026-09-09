import { Injectable } from '@nestjs/common';
import type { PainelDeProgresso } from '@vivio/contracts';
import {
  montarEvolucaoDeCarga,
  resumoDeTreinoNoPeriodo,
  variacaoDePeso,
} from '@vivio/contracts';
import { PrismaService } from '../../infra/prisma.service';
import { CheckinService } from '../checkin/checkin.service';

const DIA_EM_MS = 24 * 60 * 60 * 1000;

/**
 * O painel de progresso: quatro leituras numa tela.
 *
 * **Nada aqui é dado novo.** Tudo já existe em execuções, check-ins e medidas —
 * e é por isso que as contas moram em `@vivio/contracts`: o SDK monta o mesmo
 * painel falando direto com o Postgres, e dois cálculos do mesmo volume dariam
 * dois números para o mesmo mês.
 */
@Injectable()
export class ProgressoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly checkin: CheckinService,
  ) {}

  async painel(alunoId: string, dias: number): Promise<PainelDeProgresso> {
    const de = new Date(Date.now() - dias * DIA_EM_MS);

    const execucoes = await this.prisma.execucaoTreino.findMany({
      where: { alunoId, iniciadoEm: { gte: de } },
      include: { series: true },
    });

    const [checkins, variacaoPesoKg, cargas] = await Promise.all([
      this.resumoDeCheckins(alunoId, dias),
      this.variacaoDePeso(alunoId, de),
      this.evolucaoDeCarga(alunoId, de),
    ]);

    return {
      dias,
      treino: resumoDeTreinoNoPeriodo(
        execucoes.map((e) => ({
          iniciadoEm: e.iniciadoEm.toISOString(),
          duracaoSeg: e.duracaoSeg,
          series: e.series.map((s) => ({
            cargaKg: Number(s.cargaKg),
            repsFeitas: s.repsFeitas,
            tipo: s.tipo,
          })),
        })),
        dias,
      ),
      checkins,
      cargas,
      variacaoPesoKg,
    };
  }

  /**
   * `null` quando o aluno nunca registrou check-in — diferente de zero, que
   * significaria "registrou e não treinou". A tela precisa distinguir "sem
   * dado" de "dado ruim" para não cobrar quem só não conhece o recurso.
   */
  private async resumoDeCheckins(
    alunoId: string,
    dias: number,
  ): Promise<PainelDeProgresso['checkins']> {
    const r = await this.checkin.resumo(alunoId, dias);
    if (r.comCheckin === 0) return null;

    return {
      comCheckin: r.comCheckin,
      aderencia: r.aderencia,
      energiaMedia: r.energiaMedia,
      diasComDor: r.diasComDor,
      diasSemCheckin: r.diasSemCheckin,
    };
  }

  private async evolucaoDeCarga(alunoId: string, de: Date): Promise<PainelDeProgresso['cargas']> {
    const series = await this.prisma.serieExecutada.findMany({
      where: { execucao: { alunoId, iniciadoEm: { gte: de } } },
      select: {
        exercicioId: true,
        cargaKg: true,
        repsFeitas: true,
        tipo: true,
        execucao: { select: { iniciadoEm: true } },
      },
    });

    const nomes = await this.prisma.exercicio.findMany({
      where: { id: { in: [...new Set(series.map((s) => s.exercicioId))] } },
      select: { id: true, nome: true },
    });

    return montarEvolucaoDeCarga(
      series.map((s) => ({
        exercicioId: s.exercicioId,
        quando: s.execucao.iniciadoEm.toISOString(),
        cargaKg: Number(s.cargaKg),
        repsFeitas: s.repsFeitas,
        tipo: s.tipo,
      })),
      Object.fromEntries(nomes.map((e) => [e.id, e.nome])),
    );
  }

  private async variacaoDePeso(alunoId: string, de: Date): Promise<number | null> {
    const medidas = await this.prisma.medida.findMany({
      where: { alunoId, data: { gte: de }, pesoKg: { not: null }, deletadoEm: null },
      select: { pesoKg: true },
      orderBy: { data: 'asc' },
    });
    return variacaoDePeso(medidas.map((m) => Number(m.pesoKg)));
  }
}
