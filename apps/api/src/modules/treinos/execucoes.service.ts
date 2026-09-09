import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  ExecucaoResumo,
  MomentoDaDor,
  RegistrarExecucaoInput,
  TipoDeDor,
} from '@vivio/contracts';
import type { RecordeBatido } from '@vivio/contracts';
import { ErroDominio } from '../../common/erros/erro-dominio';
import { PrismaService } from '../../infra/prisma.service';
import { apurarRecordes, seriesDeTrabalho, volumeKg } from '@vivio/contracts';

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
   * A comparação em si mora em `@vivio/contracts`, porque o SDK apura a mesma
   * medalha falando direto com o Postgres. Aqui fica só o que exige o banco:
   * buscar o histórico e os nomes.
   */
  private async apurarRecordes(
    alunoId: string,
    execucao: ExecucaoCompleta,
  ): Promise<RecordeBatido[]> {
    const deHoje = execucao.series.map((s) => ({
      exercicioId: s.exercicioId,
      cargaKg: Number(s.cargaKg),
      repsFeitas: s.repsFeitas,
      tipo: s.tipo as string,
    }));
    const exercicioIds = [...new Set(deHoje.map((s) => s.exercicioId))];

    /*
      Duas consultas em paralelo, e não uma por exercício.

      A versão anterior perguntava o histórico dentro do laço: oito exercícios
      na sessão viravam oito consultas em fila, cada uma pagando a ida e volta
      até o banco — no caminho mais quente do app, que é o aluno apertando
      "concluir" com o celular na mão no meio da academia.

      **Sem corte de data e sem `take`, de propósito.** Recorde é "melhor de
      todos os tempos"; limitar a busca faria marca antiga sair da comparação e
      voltar como medalha nova — o aluno receberia parabéns por um peso que já
      tinha levantado no ano passado.

      Pelo mesmo motivo o aquecimento não é filtrado no SQL: `seriesDeTrabalho`
      tem um caso de borda em que ele conta (quando é tudo o que existe), e
      repetir a regra na consulta a faria divergir da versão testada.
    */
    const [listaDeNomes, historico] = await Promise.all([
      this.prisma.exercicio.findMany({
        where: { id: { in: exercicioIds } },
        select: { id: true, nome: true },
      }),
      this.prisma.serieExecutada.findMany({
        where: {
          exercicioId: { in: exercicioIds },
          // Excluir a execução recém-gravada: sem isso a série de agora entra
          // na comparação e nada nunca é recorde.
          execucao: { alunoId, id: { not: execucao.id } },
        },
        select: { exercicioId: true, cargaKg: true, repsFeitas: true, tipo: true },
      }),
    ]);

    return apurarRecordes({
      deHoje,
      anteriores: historico.map((s) => ({
        exercicioId: s.exercicioId,
        cargaKg: Number(s.cargaKg),
        repsFeitas: s.repsFeitas,
        tipo: s.tipo as string,
      })),
      nomes: Object.fromEntries(listaDeNomes.map((e) => [e.id, e.nome])),
    });
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
            dorTipo: e.feedback.dorTipo as TipoDeDor | null,
            dorMomento: e.feedback.dorMomento as MomentoDaDor | null,
            dorExercicioId: e.feedback.dorExercicioId,
            sensacao: e.feedback.sensacao,
            comentario: e.feedback.comentario,
          }
        : null,
    };
  }
}
