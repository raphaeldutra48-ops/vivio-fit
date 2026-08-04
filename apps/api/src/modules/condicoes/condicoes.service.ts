import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CondicaoResumo,
  GravidadeCondicao,
  RegiaoCorpo,
  RegistrarCondicaoInput,
  TipoCondicao,
} from '@vivio/contracts';
import { ErroDominio } from '../../common/erros/erro-dominio';
import { PrismaService } from '../../infra/prisma.service';
import { AlertasService } from '../alertas/alertas.service';

type LinhaCondicao = Prisma.CondicaoSaudeGetPayload<{
  include: {
    registradoPor: { select: { id: true; nome: true } };
    resolvidaPor: { select: { id: true; nome: true } };
  };
}>;

const COM_AUTORES = {
  registradoPor: { select: { id: true, nome: true } },
  resolvidaPor: { select: { id: true, nome: true } },
} as const;

@Injectable()
export class CondicoesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly alertas: AlertasService,
  ) {}

  /** Ativas primeiro, e dentro delas as mais graves no topo. */
  async listar(alunoId: string): Promise<CondicaoResumo[]> {
    const condicoes = await this.prisma.condicaoSaude.findMany({
      where: { alunoId },
      include: COM_AUTORES,
      orderBy: [{ resolvidaEm: { sort: 'asc', nulls: 'first' } }, { criadoEm: 'desc' }],
      take: 100,
    });

    return condicoes.map(paraResumo);
  }

  async registrar(
    alunoId: string,
    autorId: string,
    dados: RegistrarCondicaoInput,
  ): Promise<CondicaoResumo> {
    const condicao = await this.prisma.condicaoSaude.create({
      data: {
        alunoId,
        registradoPorId: autorId,
        tipo: dados.tipo,
        descricao: dados.descricao.trim(),
        regiao: dados.regiao,
        gravidade: dados.gravidade,
        inicioEm: dados.inicioEm ? new Date(dados.inicioEm.toISOString().slice(0, 10)) : null,
        observacao: dados.observacao,
      },
      include: COM_AUTORES,
    });

    /*
      Fora de transação, pela mesma razão do exame: se a geração falhar, a
      condição continua gravada e correta. Perder um aviso é ruim; perder o
      diagnóstico que o médico acabou de registrar é pior. E é idempotente.
    */
    await this.alertas.gerarParaCondicao(alunoId, condicao.id, {
      tipo: dados.tipo,
      descricao: condicao.descricao,
      regiao: (dados.regiao ?? null) as RegiaoCorpo | null,
      gravidade: dados.gravidade,
    });

    return paraResumo(condicao);
  }

  /**
   * Resolve — nunca apaga.
   *
   * Histórico de lesão muda a conduta mesmo depois da alta: quem já rompeu o
   * ligamento cruzado não volta a agachar como antes. Apagar destruiria isso.
   */
  async resolver(
    alunoId: string,
    condicaoId: string,
    autorId: string,
    observacao?: string,
  ): Promise<CondicaoResumo> {
    const existente = await this.prisma.condicaoSaude.findFirst({
      where: { id: condicaoId, alunoId },
    });
    if (!existente) throw ErroDominio.naoEncontrado('Condição');
    if (existente.resolvidaEm) throw ErroDominio.conflito('Esta condição já está resolvida.');

    const condicao = await this.prisma.condicaoSaude.update({
      where: { id: condicaoId },
      data: {
        resolvidaEm: new Date(),
        resolvidaPorId: autorId,
        // Anexa em vez de substituir: o texto de quem registrou não se perde.
        observacao: observacao
          ? [existente.observacao, observacao].filter(Boolean).join('\n\n')
          : existente.observacao,
      },
      include: COM_AUTORES,
    });

    // O aviso existia porque a condição valia. Deixá-lo pendente faria o
    // personal continuar evitando agachamento por uma lesão que já teve alta.
    await this.alertas.removerDaCondicao(condicaoId);

    return paraResumo(condicao);
  }
}

function paraResumo(c: LinhaCondicao): CondicaoResumo {
  return {
    id: c.id,
    tipo: c.tipo as TipoCondicao,
    descricao: c.descricao,
    regiao: (c.regiao as RegiaoCorpo | null) ?? null,
    gravidade: c.gravidade as GravidadeCondicao,
    inicioEm: c.inicioEm ? c.inicioEm.toISOString().slice(0, 10) : null,
    observacao: c.observacao,
    registradoPor: c.registradoPor,
    criadoEm: c.criadoEm.toISOString(),
    resolvidaEm: c.resolvidaEm?.toISOString() ?? null,
    resolvidaPor: c.resolvidaPor,
  };
}
