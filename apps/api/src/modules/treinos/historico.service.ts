import { Injectable } from '@nestjs/common';
import { Prisma, TipoSerie } from '@prisma/client';
import type {
  AnterioresDaSessao,
  HistoricoCarga,
  PontoHistoricoCarga,
  SerieAnterior,
  SugestaoDeCarga,
} from '@vivio/contracts';
import { ErroDominio } from '../../common/erros/erro-dominio';
import { PrismaService } from '../../infra/prisma.service';
import { sugerirCarga } from './progressao';

interface LinhaSerie {
  exercicioId: string;
  execucaoId: string;
  serieNum: number;
  repsFeitas: number;
  cargaKg: Prisma.Decimal;
  tipo: TipoSerie;
  rpe: number | null;
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
        // `repsAlvo` entra porque a sugestão é dupla progressão: sem saber a
        // faixa que o plano pede, não dá para dizer se o aluno fechou o topo.
        itens: { select: { exercicioId: true, repsAlvo: true } },
      },
    });
    if (!sessao || sessao.plano.alunoId !== alunoId) {
      throw ErroDominio.naoEncontrado('Sessão de treino');
    }

    const exercicioIds = [...new Set(sessao.itens.map((i) => i.exercicioId))];
    if (exercicioIds.length === 0) return { porExercicio: {}, ultimaVezEm: {}, sugestao: {} };

    // Todas as séries desses exercícios, mais recentes primeiro. O corte por
    // execução é feito abaixo: só interessa a ÚLTIMA vez de cada exercício.
    const linhas = await this.prisma.$queryRaw<LinhaSerie[]>`
      SELECT s."exercicioId", s."execucaoId", s."serieNum", s."repsFeitas", s."cargaKg",
             s."tipo", s."rpe", e."iniciadoEm"
      FROM "SerieExecutada" s
      JOIN "ExecucaoTreino" e ON e.id = s."execucaoId"
      WHERE e."alunoId" = ${alunoId}
        AND s."exercicioId" = ANY(${exercicioIds})
      ORDER BY e."iniciadoEm" DESC, e."criadoEm" DESC, s."serieNum" ASC
    `;

    /*
      Dor relatada no treino, por execucao. E a guarda que vem ANTES do numero:
      quem completou as repeticoes sentindo dor e exatamente quem nao deve
      subir carga, e e quem a regra numerica sozinha mandaria subir.
    */
    const execucoesComDor = new Set(
      (
        await this.prisma.feedbackTreino.findMany({
          where: { teveDor: true, execucao: { alunoId } },
          select: { execucaoId: true },
        })
      ).map((f) => f.execucaoId),
    );

    /** `execucaoId:serieNum` -> RPE informado. O contrato de SerieAnterior nao
     *  carrega RPE (a coluna ANTERIOR nao o mostra), mas a sugestao precisa. */
    const rpePorSerie = new Map<string, number>();
    for (const l of linhas) {
      if (l.rpe !== null) rpePorSerie.set(`${l.execucaoId}:${l.serieNum}`, l.rpe);
    }

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

    /*
      A sugestão é calculada por EXERCÍCIO, e não por item do plano: o mesmo
      exercício pode aparecer duas vezes na sessão, e as duas vezes têm o mesmo
      histórico. Se um item pede 8-12 e outro pede 15-20, vence o primeiro —
      caso raro, e uma sugestão consistente é melhor que duas conflitantes na
      mesma tela.
    */
    const alvoPorExercicio = new Map<string, string>();
    for (const item of sessao.itens) {
      if (!alvoPorExercicio.has(item.exercicioId)) {
        alvoPorExercicio.set(item.exercicioId, item.repsAlvo);
      }
    }

    const sugestao: Record<string, SugestaoDeCarga> = {};
    for (const exercicioId of exercicioIds) {
      const series = porExercicio[exercicioId] ?? [];
      sugestao[exercicioId] = sugerirCarga({
        ultimaSessao: series.map((s) => ({
          cargaKg: s.cargaKg,
          repsFeitas: s.repsFeitas,
          tipo: s.tipo,
          rpe: rpePorSerie.get(`${execucaoEscolhida[exercicioId]}:${s.serieNum}`) ?? null,
        })),
        repsAlvo: alvoPorExercicio.get(exercicioId) ?? '',
        teveDorNoTreino: execucoesComDor.has(execucaoEscolhida[exercicioId] ?? ''),
      });
    }

    return { porExercicio, ultimaVezEm, sugestao };
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
