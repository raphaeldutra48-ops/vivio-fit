import { Injectable } from '@nestjs/common';
import { EscopoDado, Papel } from '@prisma/client';
import {
  FINALIDADE_POR_ESCOPO,
  VERSAO_TERMO_ATUAL,
  type ConsentimentoResumo,
  type UsuarioAutenticado,
} from '@vivio/contracts';
import { ErroDominio } from '../../common/erros/erro-dominio';
import { PrismaService } from '../../infra/prisma.service';

const SELECAO_PESSOA = { id: true, nome: true, email: true, avatarUrl: true } as const;

@Injectable()
export class ConsentimentosService {
  constructor(private readonly prisma: PrismaService) {}

  /** O aluno vê exatamente o que compartilha e com quem. */
  async listar(alunoId: string, incluirRevogados = false): Promise<ConsentimentoResumo[]> {
    const registros = await this.prisma.consentimento.findMany({
      where: { alunoId, ...(incluirRevogados ? {} : { revogadoEm: null }) },
      include: { profissional: { select: SELECAO_PESSOA } },
      orderBy: { concedidoEm: 'desc' },
    });

    return registros.map((c) => ({
      id: c.id,
      escopo: c.escopo,
      finalidade: c.finalidade,
      versaoTermo: c.versaoTermo,
      concedidoEm: c.concedidoEm.toISOString(),
      revogadoEm: c.revogadoEm?.toISOString() ?? null,
      profissional: c.profissional,
    }));
  }

  async conceder(
    aluno: UsuarioAutenticado,
    escopo: EscopoDado,
    profissionalId: string | null | undefined,
    ctx: { ip?: string; userAgent?: string },
  ): Promise<ConsentimentoResumo> {
    if (profissionalId) {
      const profissional = await this.prisma.user.findUnique({
        where: { id: profissionalId },
        select: { papel: true },
      });
      const ehProfissional =
        profissional?.papel === Papel.PERSONAL ||
        profissional?.papel === Papel.NUTRICIONISTA ||
        profissional?.papel === Papel.MEDICO;
      if (!ehProfissional) throw ErroDominio.naoEncontrado('Profissional');
    }

    const jaExiste = await this.prisma.consentimento.findFirst({
      where: {
        alunoId: aluno.id,
        escopo,
        profissionalId: profissionalId ?? null,
        revogadoEm: null,
        versaoTermo: VERSAO_TERMO_ATUAL,
      },
    });
    if (jaExiste) throw ErroDominio.conflito('Este consentimento já está ativo.');

    const criado = await this.prisma.consentimento.create({
      data: {
        alunoId: aluno.id,
        escopo,
        profissionalId: profissionalId ?? null,
        finalidade: FINALIDADE_POR_ESCOPO[escopo],
        versaoTermo: VERSAO_TERMO_ATUAL,
        ipOrigem: ctx.ip,
        userAgent: ctx.userAgent,
      },
      include: { profissional: { select: SELECAO_PESSOA } },
    });

    return {
      id: criado.id,
      escopo: criado.escopo,
      finalidade: criado.finalidade,
      versaoTermo: criado.versaoTermo,
      concedidoEm: criado.concedidoEm.toISOString(),
      revogadoEm: null,
      profissional: criado.profissional,
    };
  }

  /**
   * Revogação. Não deleta o registro: marca `revogadoEm`.
   * O histórico de que houve consentimento entre as datas X e Y é a prova de
   * que o acesso ocorrido naquele período era legítimo.
   */
  async revogar(aluno: UsuarioAutenticado, consentimentoId: string): Promise<void> {
    const consentimento = await this.prisma.consentimento.findUnique({
      where: { id: consentimentoId },
    });

    if (!consentimento || consentimento.alunoId !== aluno.id) {
      throw ErroDominio.naoEncontrado('Consentimento');
    }
    if (consentimento.revogadoEm) {
      throw ErroDominio.conflito('Este consentimento já foi revogado.');
    }

    await this.prisma.consentimento.update({
      where: { id: consentimentoId },
      data: { revogadoEm: new Date() },
    });
  }
}
