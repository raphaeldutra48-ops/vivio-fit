import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  Papel,
  type AlertaResumo,
  type Marcador,
  type PapelDestino,
  type SeveridadeAlerta,
  type SexoBiologico,
} from '@vivio/contracts';
import { ErroDominio } from '../../common/erros/erro-dominio';
import { PrismaService } from '../../infra/prisma.service';
import { podeVerMarcador } from '../exames/escopo';
import { alertasDoExame, type ResultadoParaRegra } from './regras';

type LinhaAlerta = Prisma.AlertaClinicoGetPayload<{
  include: { reconhecidoPor: { select: { id: true; nome: true } } };
}>;

@Injectable()
export class AlertasService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Gera e grava os alertas de um exame.
   *
   * `skipDuplicates` com a unique (aluno, papel, regra, exame): reprocessar o
   * mesmo exame não duplica aviso, e reconhecer um alerta não faz o próximo
   * registro ressuscitá-lo.
   */
  async gerarParaExame(
    alunoId: string,
    exameId: string,
    resultados: ResultadoParaRegra[],
    sexo: SexoBiologico,
  ): Promise<number> {
    const gerados = alertasDoExame(resultados, sexo);
    if (gerados.length === 0) return 0;

    const { count } = await this.prisma.alertaClinico.createMany({
      data: gerados.map((a) => ({
        alunoId,
        exameId,
        papelDestino: a.papelDestino,
        severidade: a.severidade,
        regra: a.regra,
        titulo: a.titulo,
        orientacao: a.orientacao,
        marcadorOrigem: a.marcador,
      })),
      skipDuplicates: true,
    });

    return count;
  }

  /** Só os alertas endereçados ao papel de quem pediu. */
  async listar(alunoId: string, papel: Papel): Promise<AlertaResumo[]> {
    const alertas = await this.prisma.alertaClinico.findMany({
      where: { alunoId, papelDestino: papel },
      include: { reconhecidoPor: { select: { id: true, nome: true } } },
      orderBy: [{ reconhecidoEm: { sort: 'asc', nulls: 'first' } }, { criadoEm: 'desc' }],
      take: 100,
    });

    return alertas.map((a) => this.paraResumo(a, papel));
  }

  async reconhecer(
    alunoId: string,
    alertaId: string,
    usuarioId: string,
    papel: Papel,
    anotacao?: string,
  ): Promise<AlertaResumo> {
    // O `papelDestino` no where é o que impede reconhecer alerta alheio: o
    // nutricionista não dá baixa no aviso que era do personal.
    const alerta = await this.prisma.alertaClinico.findFirst({
      where: { id: alertaId, alunoId, papelDestino: papel },
    });
    if (!alerta) throw ErroDominio.naoEncontrado('Alerta');

    const atualizado = await this.prisma.alertaClinico.update({
      where: { id: alertaId },
      data: { reconhecidoEm: new Date(), reconhecidoPorId: usuarioId, anotacao },
      include: { reconhecidoPor: { select: { id: true, nome: true } } },
    });

    return this.paraResumo(atualizado, papel);
  }

  /**
   * A serialização é onde a privacidade se cumpre.
   *
   * `marcadorOrigem` e `exameId` só saem para quem pode ver aquele marcador.
   * Para o personal saem sempre nulos; para o nutricionista, nulos quando o
   * alerta nasceu de um marcador de escopo médico — que é justamente o caso do
   * aviso de tireoide.
   */
  private paraResumo(a: LinhaAlerta, papel: Papel): AlertaResumo {
    const marcador = a.marcadorOrigem as Marcador | null;
    const podeRastrear = marcador !== null && podeVerMarcador(papel, marcador);

    return {
      id: a.id,
      papelDestino: a.papelDestino as PapelDestino,
      severidade: a.severidade as SeveridadeAlerta,
      titulo: a.titulo,
      orientacao: a.orientacao,
      marcadorOrigem: podeRastrear ? marcador : null,
      exameId: podeRastrear ? a.exameId : null,
      criadoEm: a.criadoEm.toISOString(),
      reconhecidoEm: a.reconhecidoEm?.toISOString() ?? null,
      reconhecidoPor: a.reconhecidoPor,
    };
  }
}
