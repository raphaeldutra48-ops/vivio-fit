import { Injectable } from '@nestjs/common';
import { Prisma, TipoSerie } from '@prisma/client';
import type {
  AnterioresDaSessao,
  HistoricoCarga,
  PontoHistoricoCarga,
  SerieAnterior,
} from '@vivio/contracts';
import { ErroDominio } from '../../common/erros/erro-dominio';
import { PrismaService } from '../../infra/prisma.service';

interface LinhaSerie {
  exercicioId: string;
  execucaoId: string;
  serieNum: number;
  repsFeitas: number;
  cargaKg: Prisma.Decimal;
  tipo: TipoSerie;
  iniciadoEm: Date;
}

/** Epley: estimativa de 1RM a partir de carga e repetições. */
function estimar1rm(cargaKg: number, reps: number): number {
  if (reps <= 1) return cargaKg;
  return Number((cargaKg * (1 + reps / 30)).toFixed(1));
}

@Injectable()
export class HistoricoService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Preenche a coluna "ANTERIOR" da tela de execução.
   *
   * Uma consulta só para a sessão inteira: buscar exercício por exercício seria
   * N requisições enquanto o aluno está de pé na academia, muitas vezes com
   * rede ruim.
   */
  async anterioresDaSessao(alunoId: string, sessaoId: string): Promise<AnterioresDaSessao> {
    const sessao = await this.prisma.sessaoTreino.findUnique({
      where: { id: sessaoId },
      include: {
        plano: { select: { alunoId: true } },
        itens: { select: { exercicioId: true } },
      },
    });
    if (!sessao || sessao.plano.alunoId !== alunoId) {
      throw ErroDominio.naoEncontrado('Sessão de treino');
    }

    const exercicioIds = [...new Set(sessao.itens.map((i) => i.exercicioId))];
    if (exercicioIds.length === 0) return { porExercicio: {}, ultimaVezEm: {} };

    // Todas as séries desses exercícios, mais recentes primeiro. O corte por
    // execução é feito abaixo: só interessa a ÚLTIMA vez de cada exercício.
    const linhas = await this.prisma.$queryRaw<LinhaSerie[]>`
      SELECT s."exercicioId", s."execucaoId", s."serieNum", s."repsFeitas", s."cargaKg",
             s."tipo", e."iniciadoEm"
      FROM "SerieExecutada" s
      JOIN "ExecucaoTreino" e ON e.id = s."execucaoId"
      WHERE e."alunoId" = ${alunoId}
        AND s."exercicioId" = ANY(${exercicioIds})
      ORDER BY e."iniciadoEm" DESC, e."criadoEm" DESC, s."serieNum" ASC
    `;

    const porExercicio: Record<string, SerieAnterior[]> = {};
    const ultimaVezEm: Record<string, string> = {};
    /** exercicioId -> id da execução escolhida como "a última". */
    const execucaoEscolhida: Record<string, string> = {};

    for (const linha of linhas) {
      // Desduplicar por ID, não por data: duas execuções podem ter o mesmo
      // `iniciadoEm` (registro retroativo, importação, fila offline reenviada
      // com horários iguais) e seriam somadas como se fossem uma.
      const escolhida = execucaoEscolhida[linha.exercicioId];
      if (escolhida === undefined) {
        execucaoEscolhida[linha.exercicioId] = linha.execucaoId;
        ultimaVezEm[linha.exercicioId] = linha.iniciadoEm.toISOString();
      } else if (escolhida !== linha.execucaoId) {
        continue; // série de uma execução mais antiga
      }

      (porExercicio[linha.exercicioId] ??= []).push({
        serieNum: linha.serieNum,
        repsFeitas: linha.repsFeitas,
        cargaKg: Number(linha.cargaKg),
        tipo: linha.tipo,
      });
    }

    return { porExercicio, ultimaVezEm };
  }

  /**
   * Progressão de carga de um exercício: "atual vs anteriores".
   * Agrupa por dia porque é assim que o aluno pensa a evolução.
   */
  async historicoDeCarga(
    alunoId: string,
    exercicioId: string,
    limite = 20,
  ): Promise<HistoricoCarga> {
    const exercicio = await this.prisma.exercicio.findUnique({
      where: { id: exercicioId },
      select: { id: true, nome: true },
    });
    if (!exercicio) throw ErroDominio.naoEncontrado('Exercício');

    const series = await this.prisma.serieExecutada.findMany({
      where: { exercicioId, execucao: { alunoId } },
      select: {
        serieNum: true,
        repsFeitas: true,
        cargaKg: true,
        tipo: true,
        execucao: { select: { iniciadoEm: true } },
      },
      orderBy: [{ execucao: { iniciadoEm: 'desc' } }, { serieNum: 'asc' }],
      take: limite * 12,
    });

    const porDia = new Map<string, SerieAnterior[]>();
    for (const s of series) {
      const dia = s.execucao.iniciadoEm.toISOString().slice(0, 10);
      (porDia.get(dia) ?? porDia.set(dia, []).get(dia)!).push({
        serieNum: s.serieNum,
        repsFeitas: s.repsFeitas,
        cargaKg: Number(s.cargaKg),
        tipo: s.tipo,
      });
    }

    const pontos: PontoHistoricoCarga[] = [...porDia.entries()]
      .slice(0, limite)
      .map(([data, doDia]) => {
        // Aquecimento não conta como carga de trabalho — inflaria a progressão
        // para baixo e distorceria o gráfico.
        const efetivas = doDia.filter((s) => s.tipo !== 'AQUECIMENTO');
        const consideradas = efetivas.length > 0 ? efetivas : doDia;

        return {
          data,
          cargaMaximaKg: Math.max(...consideradas.map((s) => s.cargaKg)),
          volumeKg: Number(
            consideradas.reduce((soma, s) => soma + s.cargaKg * s.repsFeitas, 0).toFixed(2),
          ),
          estimativa1rmKg: Math.max(
            ...consideradas.map((s) => estimar1rm(s.cargaKg, s.repsFeitas)),
          ),
          series: doDia,
        };
      })
      .reverse(); // cronológico para o gráfico

    return { exercicioId: exercicio.id, exercicioNome: exercicio.nome, pontos };
  }
}
