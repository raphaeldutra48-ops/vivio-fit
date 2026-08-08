import { Injectable } from '@nestjs/common';
import type { EvolucaoDeCarga, PainelDeProgresso } from '@vivio/contracts';
import { PrismaService } from '../../infra/prisma.service';
import { CheckinService } from '../checkin/checkin.service';
import { estimar1rm, seriesDeTrabalho, volumeKg } from '../treinos/metricas';

const DIA_EM_MS = 24 * 60 * 60 * 1000;

/** Quantos exercícios entram no destaque de evolução de carga. */
const DESTAQUES = 5;

/**
 * Menos que isso não é tendência, é uma medição solta.
 *
 * Sem esta regra, quem fez supino uma única vez apareceria com "+0%" ou, pior,
 * com uma variação enorme por causa de um dia de teste de carga.
 */
const MINIMO_DE_SESSOES_PARA_TENDENCIA = 2;

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
      orderBy: { iniciadoEm: 'desc' },
    });

    const [checkins, variacaoPesoKg] = await Promise.all([
      this.resumoDeCheckins(alunoId, dias),
      this.variacaoDePeso(alunoId, de),
    ]);

    return {
      dias,
      treino: this.resumoDeTreino(execucoes, dias),
      checkins,
      cargas: await this.evolucaoDeCarga(alunoId, de),
      variacaoPesoKg,
    };
  }

  private resumoDeTreino(
    execucoes: { iniciadoEm: Date; duracaoSeg: number | null; series: unknown[] }[],
    dias: number,
  ): PainelDeProgresso['treino'] {
    const total = execucoes.length;

    const volume = execucoes.reduce(
      (soma, e) =>
        soma +
        volumeKg(
          (e.series as { cargaKg: unknown; repsFeitas: number; tipo: string }[]).map((s) => ({
            cargaKg: Number(s.cargaKg),
            repsFeitas: s.repsFeitas,
            tipo: s.tipo,
          })),
        ),
      0,
    );

    /*
      Só sessões finalizadas entram no tempo. Treino em andamento tem
      `duracaoSeg` nulo, e contá-lo como zero puxaria a média para baixo — o
      personal veria "média de 20 minutos" para quem treina 50.
    */
    const comDuracao = execucoes.filter((e) => e.duracaoSeg !== null);
    const segundos = comDuracao.reduce((s, e) => s + (e.duracaoSeg ?? 0), 0);

    const ultimo = execucoes[0]?.iniciadoEm ?? null;

    return {
      total,
      volumeKg: Number(volume.toFixed(2)),
      minutos: Math.round(segundos / 60),
      duracaoMediaMin:
        comDuracao.length === 0 ? null : Math.round(segundos / comDuracao.length / 60),
      porSemana: Number(((total / dias) * 7).toFixed(1)),
      ultimoEm: ultimo?.toISOString() ?? null,
      diasSemTreinar: ultimo
        ? Math.floor((Date.now() - ultimo.getTime()) / DIA_EM_MS)
        : null,
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

  /**
   * Compara o melhor 1RM da primeira metade do período com o da segunda.
   *
   * Primeira contra última sessão seria mais simples e mais frágil: um dia
   * ruim no fim viraria "regrediu 8%". Metades diluem o ruído sem esconder
   * tendência real.
   */
  private async evolucaoDeCarga(alunoId: string, de: Date): Promise<EvolucaoDeCarga[]> {
    const series = await this.prisma.serieExecutada.findMany({
      where: { execucao: { alunoId, iniciadoEm: { gte: de } } },
      select: {
        exercicioId: true,
        cargaKg: true,
        repsFeitas: true,
        tipo: true,
        execucao: { select: { iniciadoEm: true } },
      },
      orderBy: { execucao: { iniciadoEm: 'asc' } },
    });

    const porExercicio = new Map<
      string,
      { quando: number; carga: number; reps: number; tipo: string }[]
    >();

    for (const s of series) {
      const atual = porExercicio.get(s.exercicioId) ?? [];
      atual.push({
        quando: s.execucao.iniciadoEm.getTime(),
        carga: Number(s.cargaKg),
        reps: s.repsFeitas,
        tipo: s.tipo,
      });
      porExercicio.set(s.exercicioId, atual);
    }

    const nomes = new Map(
      (
        await this.prisma.exercicio.findMany({
          where: { id: { in: [...porExercicio.keys()] } },
          select: { id: true, nome: true },
        })
      ).map((e) => [e.id, e.nome]),
    );

    const evolucoes: EvolucaoDeCarga[] = [];

    for (const [exercicioId, todas] of porExercicio) {
      const diasDistintos = new Set(todas.map((s) => new Date(s.quando).toDateString()));
      if (diasDistintos.size < MINIMO_DE_SESSOES_PARA_TENDENCIA) continue;

      const meio = (todas[0]!.quando + todas[todas.length - 1]!.quando) / 2;
      const primeira = todas.filter((s) => s.quando <= meio);
      const segunda = todas.filter((s) => s.quando > meio);
      if (primeira.length === 0 || segunda.length === 0) continue;

      const melhor = (lista: typeof todas) => {
        const consideradas = seriesDeTrabalho(
          lista.map((s) => ({ cargaKg: s.carga, repsFeitas: s.reps, tipo: s.tipo })),
        );
        return Math.max(...consideradas.map((s) => estimar1rm(s.cargaKg, s.repsFeitas)));
      };

      const inicio = melhor(primeira);
      const fim = melhor(segunda);
      if (inicio <= 0) continue;

      evolucoes.push({
        exercicioId,
        exercicioNome: nomes.get(exercicioId) ?? 'Exercício',
        inicio1rmKg: Number(inicio.toFixed(1)),
        fim1rmKg: Number(fim.toFixed(1)),
        variacaoPercentual: Number((((fim - inicio) / inicio) * 100).toFixed(1)),
      });
    }

    /*
      Ordena por variação absoluta, não pela maior alta: quem regrediu 12% é
      mais urgente para o personal do que quem subiu 12%. Um painel que só
      mostra boa notícia não serve para acompanhar ninguém.
    */
    return evolucoes
      .sort((a, b) => Math.abs(b.variacaoPercentual) - Math.abs(a.variacaoPercentual))
      .slice(0, DESTAQUES);
  }

  private async variacaoDePeso(alunoId: string, de: Date): Promise<number | null> {
    const medidas = await this.prisma.medida.findMany({
      where: { alunoId, data: { gte: de }, pesoKg: { not: null }, deletadoEm: null },
      select: { pesoKg: true, data: true },
      orderBy: { data: 'asc' },
    });

    if (medidas.length < 2) return null;

    const primeiro = Number(medidas[0]!.pesoKg);
    const ultimo = Number(medidas[medidas.length - 1]!.pesoKg);
    return Number((ultimo - primeiro).toFixed(1));
  }
}
