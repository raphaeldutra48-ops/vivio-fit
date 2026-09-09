import { Injectable } from '@nestjs/common';
import { Prisma, TipoSerie } from '@prisma/client';
import type { AnterioresDaSessao, HistoricoCarga, SerieComExecucao } from '@vivio/contracts';
import { montarAnterioresDaSessao, montarHistoricoDeCarga } from '@vivio/contracts';
import { ErroDominio } from '../../common/erros/erro-dominio';
import { PrismaService } from '../../infra/prisma.service';

interface LinhaSerie {
  exercicioId: string;
  execucaoId: string;
  serieNum: number;
  repsFeitas: number;
  cargaKg: Prisma.Decimal;
  tipo: TipoSerie;
  rpe: number | null;
  iniciadoEm: Date;
  criadoEm: Date;
}

/**
 * As duas leituras da tela de execução.
 *
 * O serviço faz a parte que só o banco sabe fazer — buscar, e buscar barato. A
 * conta em si mora em `@vivio/contracts`, porque o SDK falando direto com o
 * Postgres precisa do mesmo resultado: dois cálculos da mesma sugestão de
 * carga dariam conselhos diferentes na web e no celular, e ninguém saberia
 * qual seguir.
 */
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

    // Todas as séries desses exercícios. O corte por execução é da função de
    // contrato: só interessa a ÚLTIMA vez de cada exercício.
    const linhas = await this.prisma.$queryRaw<LinhaSerie[]>`
      SELECT s."exercicioId", s."execucaoId", s."serieNum", s."repsFeitas", s."cargaKg",
             s."tipo", s."rpe", e."iniciadoEm", e."criadoEm"
      FROM "SerieExecutada" s
      JOIN "ExecucaoTreino" e ON e.id = s."execucaoId"
      WHERE e."alunoId" = ${alunoId}
        AND s."exercicioId" = ANY(${exercicioIds})
    `;

    /*
      Dor relatada no treino. É a guarda que vem ANTES do número: quem completou
      as repetições sentindo dor é exatamente quem não deve subir carga.
    */
    const comDor = await this.prisma.feedbackTreino.findMany({
      where: { teveDor: true, execucao: { alunoId } },
      select: { execucaoId: true },
    });

    return montarAnterioresDaSessao({
      series: linhas.map(paraSerieDeContrato),
      itens: sessao.itens,
      execucoesComDor: new Set(comDor.map((f) => f.execucaoId)),
    });
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

    const linhas = await this.prisma.$queryRaw<LinhaSerie[]>`
      SELECT s."exercicioId", s."execucaoId", s."serieNum", s."repsFeitas", s."cargaKg",
             s."tipo", s."rpe", e."iniciadoEm", e."criadoEm"
      FROM "SerieExecutada" s
      JOIN "ExecucaoTreino" e ON e.id = s."execucaoId"
      WHERE e."alunoId" = ${alunoId} AND s."exercicioId" = ${exercicioId}
      ORDER BY e."iniciadoEm" DESC
      LIMIT ${limite * 12}
    `;

    return montarHistoricoDeCarga({
      exercicioId: exercicio.id,
      exercicioNome: exercicio.nome,
      series: linhas.map(paraSerieDeContrato),
      limite,
    });
  }
}

/**
 * `Decimal` vira `number` e `Date` vira ISO antes de a conta começar.
 *
 * A função de contrato não sabe de Prisma nem de PostgREST de propósito: um
 * `Decimal` que escapasse até lá viraria concatenação em vez de soma, e o
 * volume do treino sairia com dois números colados.
 */
function paraSerieDeContrato(l: LinhaSerie): SerieComExecucao {
  return {
    exercicioId: l.exercicioId,
    execucaoId: l.execucaoId,
    serieNum: l.serieNum,
    repsFeitas: l.repsFeitas,
    cargaKg: Number(l.cargaKg),
    tipo: l.tipo,
    rpe: l.rpe,
    iniciadoEm: l.iniciadoEm.toISOString(),
    criadoEm: l.criadoEm.toISOString(),
  };
}
