import { Injectable } from '@nestjs/common';
import { Papel, StatusVinculo } from '@prisma/client';
import type { UsuarioAutenticado, VinculoResumo } from '@vivio/contracts';
import { ErroDominio } from '../../common/erros/erro-dominio';
import { PrismaService } from '../../infra/prisma.service';

const PAPEIS_PROFISSIONAIS: Papel[] = [Papel.PERSONAL, Papel.NUTRICIONISTA, Papel.MEDICO];

const SELECAO_PESSOA = { id: true, nome: true, email: true, avatarUrl: true } as const;

@Injectable()
export class VinculosService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Cria o convite. A direção depende de quem chama: profissional convida aluno,
   * aluno convida profissional. O convite nasce PENDENTE — vínculo só existe
   * quando o outro lado aceita.
   */
  async convidar(solicitante: UsuarioAutenticado, emailConvidado: string): Promise<VinculoResumo> {
    const convidado = await this.prisma.user.findUnique({
      where: { email: emailConvidado.toLowerCase().trim() },
      select: { ...SELECAO_PESSOA, papel: true, deletadoEm: true },
    });

    if (!convidado || convidado.deletadoEm) {
      throw ErroDominio.naoEncontrado('Usuário com este e-mail');
    }
    if (convidado.id === solicitante.id) {
      throw ErroDominio.conflito('Você não pode se vincular a si mesmo.');
    }

    let alunoId: string;
    let profissionalId: string;
    let tipo: Papel;

    if (solicitante.papel === Papel.ALUNO) {
      if (!PAPEIS_PROFISSIONAIS.includes(convidado.papel)) {
        throw ErroDominio.conflito('Este e-mail não pertence a um profissional de saúde.');
      }
      alunoId = solicitante.id;
      profissionalId = convidado.id;
      tipo = convidado.papel;
    } else if (PAPEIS_PROFISSIONAIS.includes(solicitante.papel)) {
      if (convidado.papel !== Papel.ALUNO) {
        throw ErroDominio.conflito('Este e-mail não pertence a um aluno.');
      }
      alunoId = convidado.id;
      profissionalId = solicitante.id;
      tipo = solicitante.papel;
    } else {
      throw ErroDominio.papelNaoAutorizado('Apenas alunos e profissionais criam vínculos.');
    }

    await this.exigirProfissionalVerificado(profissionalId);

    const existente = await this.prisma.vinculo.findUnique({
      where: { alunoId_profissionalId: { alunoId, profissionalId } },
    });

    if (existente) {
      if (existente.status === StatusVinculo.ATIVO) {
        throw ErroDominio.conflito('Este vínculo já está ativo.');
      }
      if (existente.status === StatusVinculo.PENDENTE) {
        throw ErroDominio.conflito('Já existe um convite pendente para esta pessoa.');
      }
      // Vínculo encerrado ou recusado pode ser reaberto — o histórico anterior fica.
      const reaberto = await this.prisma.vinculo.update({
        where: { id: existente.id },
        data: {
          status: StatusVinculo.PENDENTE,
          convidadoPorId: solicitante.id,
          encerradoEm: null,
        },
        include: { aluno: { select: SELECAO_PESSOA }, profissional: { select: SELECAO_PESSOA } },
      });
      return this.paraResumo(reaberto, solicitante.id);
    }

    const criado = await this.prisma.vinculo.create({
      data: { alunoId, profissionalId, tipo, convidadoPorId: solicitante.id },
      include: { aluno: { select: SELECAO_PESSOA }, profissional: { select: SELECAO_PESSOA } },
    });
    return this.paraResumo(criado, solicitante.id);
  }

  async aceitar(usuario: UsuarioAutenticado, vinculoId: string): Promise<VinculoResumo> {
    const vinculo = await this.buscarComoParticipante(usuario, vinculoId);

    if (vinculo.status !== StatusVinculo.PENDENTE) {
      throw ErroDominio.conflito('Este convite não está mais pendente.');
    }
    if (vinculo.convidadoPorId === usuario.id) {
      throw ErroDominio.conflito('Quem enviou o convite não pode aceitá-lo.');
    }

    await this.exigirProfissionalVerificado(vinculo.profissionalId);

    // Regra: 1 vínculo ATIVO por tipo de profissional. Trocar de personal exige
    // encerrar o anterior — o histórico dele permanece.
    const jaTem = await this.prisma.vinculo.findFirst({
      where: { alunoId: vinculo.alunoId, tipo: vinculo.tipo, status: StatusVinculo.ATIVO },
    });
    if (jaTem) {
      throw ErroDominio.conflito(
        `Este aluno já possui um profissional ativo do tipo ${vinculo.tipo}. Encerre o vínculo atual antes.`,
        { vinculoAtivoId: jaTem.id },
      );
    }

    const atualizado = await this.prisma.vinculo.update({
      where: { id: vinculo.id },
      data: { status: StatusVinculo.ATIVO, iniciadoEm: new Date() },
      include: { aluno: { select: SELECAO_PESSOA }, profissional: { select: SELECAO_PESSOA } },
    });
    return this.paraResumo(atualizado, usuario.id);
  }

  async recusar(usuario: UsuarioAutenticado, vinculoId: string): Promise<VinculoResumo> {
    const vinculo = await this.buscarComoParticipante(usuario, vinculoId);
    if (vinculo.status !== StatusVinculo.PENDENTE) {
      throw ErroDominio.conflito('Este convite não está mais pendente.');
    }

    const atualizado = await this.prisma.vinculo.update({
      where: { id: vinculo.id },
      data: { status: StatusVinculo.RECUSADO },
      include: { aluno: { select: SELECAO_PESSOA }, profissional: { select: SELECAO_PESSOA } },
    });
    return this.paraResumo(atualizado, usuario.id);
  }

  /** Qualquer um dos dois lados pode encerrar. O histórico gerado não é apagado. */
  async encerrar(usuario: UsuarioAutenticado, vinculoId: string): Promise<VinculoResumo> {
    const vinculo = await this.buscarComoParticipante(usuario, vinculoId);
    if (vinculo.status !== StatusVinculo.ATIVO) {
      throw ErroDominio.conflito('Este vínculo não está ativo.');
    }

    const atualizado = await this.prisma.vinculo.update({
      where: { id: vinculo.id },
      data: { status: StatusVinculo.ENCERRADO, encerradoEm: new Date() },
      include: { aluno: { select: SELECAO_PESSOA }, profissional: { select: SELECAO_PESSOA } },
    });
    return this.paraResumo(atualizado, usuario.id);
  }

  /** Carteira do profissional. */
  async meusAlunos(usuario: UsuarioAutenticado, status?: StatusVinculo): Promise<VinculoResumo[]> {
    const vinculos = await this.prisma.vinculo.findMany({
      where: { profissionalId: usuario.id, status: status ?? undefined },
      include: { aluno: { select: SELECAO_PESSOA }, profissional: { select: SELECAO_PESSOA } },
      orderBy: { criadoEm: 'desc' },
    });
    return vinculos.map((v) => this.paraResumo(v, usuario.id));
  }

  /** Equipe de cuidado do aluno. */
  async meusProfissionais(usuario: UsuarioAutenticado): Promise<VinculoResumo[]> {
    const vinculos = await this.prisma.vinculo.findMany({
      where: { alunoId: usuario.id },
      include: { aluno: { select: SELECAO_PESSOA }, profissional: { select: SELECAO_PESSOA } },
      orderBy: { criadoEm: 'desc' },
    });
    return vinculos.map((v) => this.paraResumo(v, usuario.id));
  }

  // --- auxiliares ---------------------------------------------------------

  private async exigirProfissionalVerificado(profissionalId: string): Promise<void> {
    const perfil = await this.prisma.perfilProfissional.findUnique({
      where: { userId: profissionalId },
      select: { verificadoEm: true },
    });
    if (!perfil?.verificadoEm) {
      throw ErroDominio.conflito(
        'Este profissional ainda não teve o registro no conselho verificado pela plataforma.',
      );
    }
  }

  private async buscarComoParticipante(usuario: UsuarioAutenticado, vinculoId: string) {
    const vinculo = await this.prisma.vinculo.findUnique({ where: { id: vinculoId } });
    if (!vinculo) throw ErroDominio.naoEncontrado('Vínculo');
    if (vinculo.alunoId !== usuario.id && vinculo.profissionalId !== usuario.id) {
      // Não revelamos que o vínculo existe para quem não faz parte dele.
      throw ErroDominio.naoEncontrado('Vínculo');
    }
    return vinculo;
  }

  private paraResumo(
    v: {
      id: string;
      tipo: Papel;
      status: StatusVinculo;
      iniciadoEm: Date | null;
      encerradoEm: Date | null;
      alunoId: string;
      convidadoPorId: string;
      aluno: { id: string; nome: string; email: string; avatarUrl: string | null };
      profissional: { id: string; nome: string; email: string; avatarUrl: string | null };
    },
    idDeQuemConsulta: string,
  ): VinculoResumo {
    const souOAluno = v.alunoId === idDeQuemConsulta;
    return {
      id: v.id,
      tipo: v.tipo,
      status: v.status,
      iniciadoEm: v.iniciadoEm?.toISOString() ?? null,
      encerradoEm: v.encerradoEm?.toISOString() ?? null,
      contraparte: souOAluno ? v.profissional : v.aluno,
      aguardandoMinhaResposta:
        v.status === StatusVinculo.PENDENTE && v.convidadoPorId !== idDeQuemConsulta,
    };
  }
}
