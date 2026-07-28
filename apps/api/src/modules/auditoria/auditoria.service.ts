import { Injectable, Logger } from '@nestjs/common';
import { AcaoAuditoria, EscopoDado, Prisma } from '@prisma/client';
import type { AcessoRegistrado, ConsultaAuditoria } from '@vivio/contracts';
import { PrismaService } from '../../infra/prisma.service';

export interface EntradaAuditoria {
  atorId: string;
  acao: AcaoAuditoria;
  recursoTipo: string;
  recursoId?: string;
  alunoId?: string;
  escopo?: EscopoDado;
  ip?: string;
  userAgent?: string;
  metadata?: Prisma.InputJsonValue;
}

@Injectable()
export class AuditoriaService {
  private readonly logger = new Logger(AuditoriaService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Registra o acesso.
   *
   * Nunca lança: uma falha ao auditar não pode derrubar a requisição do usuário.
   * Mas também não pode passar despercebida — vai para o log de erro da aplicação.
   */
  async registrar(entrada: EntradaAuditoria): Promise<void> {
    try {
      await this.prisma.logAuditoria.create({
        data: {
          atorId: entrada.atorId,
          acao: entrada.acao,
          recursoTipo: entrada.recursoTipo,
          recursoId: entrada.recursoId,
          alunoId: entrada.alunoId,
          escopo: entrada.escopo,
          ip: entrada.ip,
          userAgent: entrada.userAgent,
          metadata: entrada.metadata,
        },
      });
    } catch (erro) {
      this.logger.error(
        `Falha ao gravar auditoria (${entrada.acao} ${entrada.recursoTipo})`,
        erro instanceof Error ? erro.stack : String(erro),
      );
    }
  }

  /**
   * Direito do titular: saber quem acessou seus dados, quando e o quê.
   * Só o próprio aluno consulta — nem o profissional, nem o admin.
   */
  async meusAcessos(
    alunoId: string,
    consulta: ConsultaAuditoria,
  ): Promise<{ dados: AcessoRegistrado[]; proximoCursor: string | null }> {
    const registros = await this.prisma.logAuditoria.findMany({
      where: {
        alunoId,
        escopo: consulta.escopo,
        // O próprio acesso do aluno aos seus dados não polui a lista.
        NOT: { atorId: alunoId },
      },
      include: { ator: { select: { id: true, nome: true, papel: true } } },
      orderBy: { criadoEm: 'desc' },
      take: consulta.limit + 1,
      ...(consulta.cursor ? { cursor: { id: consulta.cursor }, skip: 1 } : {}),
    });

    const temMais = registros.length > consulta.limit;
    const pagina = temMais ? registros.slice(0, consulta.limit) : registros;

    return {
      dados: pagina.map((r) => ({
        id: r.id,
        acao: r.acao,
        recursoTipo: r.recursoTipo,
        escopo: r.escopo,
        criadoEm: r.criadoEm.toISOString(),
        ator: r.ator,
      })),
      proximoCursor: temMais ? (pagina[pagina.length - 1]?.id ?? null) : null,
    };
  }
}
