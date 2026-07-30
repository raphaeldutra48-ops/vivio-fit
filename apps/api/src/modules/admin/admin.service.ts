import { Injectable } from '@nestjs/common';
import { Prisma, StatusConta } from '@prisma/client';
import {
  StatusVerificacao,
  type ListarProfissionaisQuery,
  type ProfissionalParaVerificar,
} from '@vivio/contracts';
import { ErroDominio } from '../../common/erros/erro-dominio';
import { PrismaService } from '../../infra/prisma.service';

const INCLUDE = {
  user: true,
  verificadoPor: { select: { id: true, nome: true } },
} as const;

type LinhaPerfil = Prisma.PerfilProfissionalGetPayload<{ include: typeof INCLUDE }>;

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  private paraResumo(p: LinhaPerfil): ProfissionalParaVerificar {
    return {
      id: p.userId,
      nome: p.user.nome,
      email: p.user.email,
      telefone: p.user.telefone,
      tipo: p.tipo,
      registroConselho: p.registroConselho,
      ufRegistro: p.ufRegistro,
      especialidades: p.especialidades,
      bio: p.bio,
      emailVerificado: p.user.emailVerifEm !== null,
      status: this.statusDe(p),
      criadoEm: p.criadoEm.toISOString(),
      verificadoEm: p.verificadoEm?.toISOString() ?? null,
      verificadoPor: p.verificadoPor,
      recusadoEm: p.recusadoEm?.toISOString() ?? null,
      motivoRecusa: p.motivoRecusa,
    };
  }

  /** Verificado vence recusa: reaprovar depois de recusar é caminho normal. */
  private statusDe(p: LinhaPerfil): StatusVerificacao {
    if (p.verificadoEm) return StatusVerificacao.VERIFICADO;
    if (p.recusadoEm) return StatusVerificacao.RECUSADO;
    return StatusVerificacao.PENDENTE;
  }

  async listar(consulta: ListarProfissionaisQuery): Promise<ProfissionalParaVerificar[]> {
    const porStatus: Record<StatusVerificacao, Prisma.PerfilProfissionalWhereInput> = {
      PENDENTE: { verificadoEm: null, recusadoEm: null },
      VERIFICADO: { verificadoEm: { not: null } },
      RECUSADO: { verificadoEm: null, recusadoEm: { not: null } },
    };

    const perfis = await this.prisma.perfilProfissional.findMany({
      where: {
        user: {
          deletadoEm: null,
          ...(consulta.q
            ? {
                OR: [
                  { nome: { contains: consulta.q, mode: Prisma.QueryMode.insensitive } },
                  { email: { contains: consulta.q, mode: Prisma.QueryMode.insensitive } },
                ],
              }
            : {}),
        },
        ...(consulta.status ? porStatus[consulta.status] : {}),
      },
      include: INCLUDE,
      // Mais antigo primeiro: quem espera há mais tempo é atendido antes.
      orderBy: { criadoEm: 'asc' },
      take: consulta.limit,
    });

    return perfis.map((p) => this.paraResumo(p));
  }

  async contarPendentes(): Promise<number> {
    return this.prisma.perfilProfissional.count({
      where: { verificadoEm: null, recusadoEm: null, user: { deletadoEm: null } },
    });
  }

  /**
   * Aprova o registro no conselho e destrava a conta.
   *
   * Confirmar o e-mail continua sendo com o profissional: aprovar o registro
   * não prova posse do endereço, são duas checagens diferentes.
   */
  async verificar(adminId: string, profissionalId: string): Promise<ProfissionalParaVerificar> {
    const perfil = await this.prisma.perfilProfissional.findUnique({
      where: { userId: profissionalId },
    });
    if (!perfil) throw ErroDominio.naoEncontrado('Profissional');

    const [, atualizado] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: profissionalId },
        data: { status: StatusConta.ATIVA },
      }),
      this.prisma.perfilProfissional.update({
        where: { userId: profissionalId },
        data: {
          verificadoEm: perfil.verificadoEm ?? new Date(),
          verificadoPorId: adminId,
          // Aprovar depois de recusar limpa a recusa — o histórico fica na auditoria.
          recusadoEm: null,
          motivoRecusa: null,
        },
        include: INCLUDE,
      }),
    ]);

    return this.paraResumo(atualizado);
  }

  async recusar(
    adminId: string,
    profissionalId: string,
    motivo: string,
  ): Promise<ProfissionalParaVerificar> {
    const perfil = await this.prisma.perfilProfissional.findUnique({
      where: { userId: profissionalId },
    });
    if (!perfil) throw ErroDominio.naoEncontrado('Profissional');

    const atualizado = await this.prisma.perfilProfissional.update({
      where: { userId: profissionalId },
      data: {
        // Recusar revoga a verificação anterior, se havia.
        verificadoEm: null,
        verificadoPorId: adminId,
        recusadoEm: new Date(),
        motivoRecusa: motivo.trim(),
      },
      include: INCLUDE,
    });

    return this.paraResumo(atualizado);
  }
}
