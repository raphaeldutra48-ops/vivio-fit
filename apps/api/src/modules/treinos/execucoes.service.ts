import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ExecucaoResumo, RegistrarExecucaoInput } from '@vivio/contracts';
import type { RecordeBatido } from '@vivio/contracts';
import { ErroDominio } from '../../common/erros/erro-dominio';
import { PrismaService } from '../../infra/prisma.service';
import { marcasDe, recordesBatidos, seriesDeTrabalho, volumeKg } from './metricas';

type ExecucaoCompleta = Prisma.ExecucaoTreinoGetPayload<{
  include: { sessao: { select: { nome: true; planoId: true } }; series: true; feedback: true };
}>;

// Sem `as const`: ele congelaria o array de orderBy como readonly, e os tipos
// gerados do Prisma só aceitam array mutável.
const INCLUDE: Prisma.ExecucaoTreinoInclude = {
  sessao: { select: { nome: true, planoId: true } },
  series: { orderBy: [{ itemTreinoId: Prisma.SortOrder.asc }, { serieNum: Prisma.SortOrder.asc }] },
  feedback: true,
};

@Injectable()
export class ExecucoesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Registra um treino realizado.
   *
   * Idempotente por `clienteUuid`: se a execução já existe, devolve a que está
   * gravada com `jaRegistrada: true` em vez de criar outra. Isso é o que permite
   * o celular reenviar a fila offline sem medo — e é exatamente o caso que
   * duplicaria treino se fosse tratado como erro.
   */
  async registrar(alunoId: string, dados: RegistrarExecucaoInput): Promise<ExecucaoResumo> {
    const jaExiste = await this.prisma.execucaoTreino.findUnique({
      where: { clienteUuid: dados.clienteUuid },
      include: INCLUDE,
    });
    if (jaExiste) {
      if (jaExiste.alunoId !== alunoId) throw ErroDominio.conflito('Execução de outro aluno.');
      return { ...this.paraResumo(jaExiste), jaRegistrada: true };
    }

    const sessao = await this.prisma.sessaoTreino.findUnique({
      where: { id: dados.sessaoId },
      include: {
        plano: { select: { alunoId: true } },
        itens: { select: { id: true, exercicioId: true } },
      },
    });
    if (!sessao || sessao.plano.alunoId !== alunoId) {
      throw ErroDominio.naoEncontrado('Sessão de treino');
    }

    // Série precisa pertencer à sessão executada — senão o histórico de carga
    // de um exercício poderia ser contaminado por outro plano.
    const exercicioPorItem = new Map(sessao.itens.map((i) => [i.id, i.exercicioId]));
    const invalidos = dados.series.filter((s) => !exercicioPorItem.has(s.itemTreinoId));
    if (invalidos.length > 0) {
      throw ErroDominio.conflito('Há séries que não pertencem a esta sessão.', {
        itens: invalidos.map((s) => s.itemTreinoId),
      });
    }

    const duracaoSeg = dados.finalizadoEm
      ? Math.max(0, Math.round((dados.finalizadoEm.getTime() - dados.iniciadoEm.getTime()) / 1000))
      : null;

    try {
      const criada = await this.prisma.execucaoTreino.create({
        data: {
          alunoId,
          sessaoId: dados.sessaoId,
          clienteUuid: dados.clienteUuid,
          iniciadoEm: dados.iniciadoEm,
          finalizadoEm: dados.finalizadoEm,
          duracaoSeg,
          series: {
            create: dados.series.map((s) => ({
              ...s,
              // Congelado no registro: o exercício é a chave estável do histórico.
              exercicioId: exercicioPorItem.get(s.itemTreinoId)!,
            })),
          },
          feedback: dados.feedback ? { create: dados.feedback } : undefined,
        },
        include: INCLUDE,
      });
      /*
        Os recordes são apurados DEPOIS de gravar, comparando o que veio agora
        com o que já existia antes desta execução. Fazer antes exigiria confiar
        que o envio vai dar certo; fazer depois de gravar significa que a
        medalha só aparece para treino que ficou registrado.
      */
      return { ...this.paraResumo(criada), recordes: await this.apurarRecordes(alunoId, criada) };
    } catch (erro) {
      // Corrida: dois envios simultâneos do mesmo uuid. O segundo lê o do primeiro.
      if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002') {
        const existente = await this.prisma.execucaoTreino.findUnique({
          where: { clienteUuid: dados.clienteUuid },
          include: INCLUDE,
        });
        if (existente) return { ...this.paraResumo(existente), jaRegistrada: true };
      }
      throw erro;
    }
  }

  async listar(alunoId: string, limite = 30): Promise<ExecucaoResumo[]> {
    const execucoes = await this.prisma.execucaoTreino.findMany({
      where: { alunoId },
      include: INCLUDE,
      orderBy: { iniciadoEm: 'desc' },
      take: limite,
    });
    return execucoes.map((e) => this.paraResumo(e));
  }

  /**
   * Quais marcas desta execução superaram o melhor de antes.
   *
   * "Antes" exclui a própria execução (`id: { not: ... }`) — sem isso a série
   * recém-gravada entraria na comparação e nada nunca seria recorde, porque o
   * melhor histórico já incluiria o de hoje.
   */
  private async apurarRecordes(
    alunoId: string,
    execucao: ExecucaoCompleta,
  ): Promise<RecordeBatido[]> {
    const porExercicio = new Map<string, { cargaKg: number; repsFeitas: number; tipo: string }[]>();
    for (const s of execucao.series) {
      const atual = porExercicio.get(s.exercicioId) ?? [];
      atual.push({ cargaKg: Number(s.cargaKg), repsFeitas: s.repsFeitas, tipo: s.tipo });
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

    const batidos: RecordeBatido[] = [];

    for (const [exercicioId, series] of porExercicio) {
      const hoje = marcasDe(series);
      if (!hoje) continue;

      const anteriores = await this.prisma.serieExecutada.findMany({
        where: {
          exercicioId,
          execucao: { alunoId, id: { not: execucao.id } },
        },
        select: { cargaKg: true, repsFeitas: true, tipo: true },
      });

      const antes = marcasDe(
        anteriores.map((s) => ({
          cargaKg: Number(s.cargaKg),
          repsFeitas: s.repsFeitas,
          tipo: s.tipo,
        })),
      );

      for (const r of recordesBatidos(hoje, antes)) {
        batidos.push({
          exercicioId,
          exercicioNome: nomes.get(exercicioId) ?? 'Exercício',
          ...r,
        });
      }
    }

    return batidos;
  }

  private paraResumo(e: ExecucaoCompleta): ExecucaoResumo {
    const series = e.series.map((s) => ({
      itemTreinoId: s.itemTreinoId,
      exercicioId: s.exercicioId,
      serieNum: s.serieNum,
      repsFeitas: s.repsFeitas,
      cargaKg: Number(s.cargaKg),
      tipo: s.tipo,
      rpe: s.rpe,
    }));

    return {
      id: e.id,
      clienteUuid: e.clienteUuid,
      sessaoId: e.sessaoId,
      sessaoNome: e.sessao.nome,
      iniciadoEm: e.iniciadoEm.toISOString(),
      finalizadoEm: e.finalizadoEm?.toISOString() ?? null,
      duracaoSeg: e.duracaoSeg,
      totalSeries: seriesDeTrabalho(series).length,
      volumeTotalKg: volumeKg(series),
      /*
        Vazio por padrão. Só o registro de uma execução nova apura recorde —
        listar o histórico não deve fazer uma consulta por exercício por linha,
        e "bateu recorde" é notícia do momento, não atributo permanente da
        sessão.
      */
      recordes: [],
      series,
      feedback: e.feedback
        ? {
            dificuldade: e.feedback.dificuldade,
            teveDor: e.feedback.teveDor,
            localDor: e.feedback.localDor,
            sensacao: e.feedback.sensacao,
            comentario: e.feedback.comentario,
          }
        : null,
    };
  }
}
