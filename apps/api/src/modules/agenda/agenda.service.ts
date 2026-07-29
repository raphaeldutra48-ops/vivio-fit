import { Injectable } from '@nestjs/common';
import { Papel, Prisma, StatusCompromisso, StatusVinculo, TipoCompromisso } from '@prisma/client';
import {
  DURACAO_PADRAO_MIN,
  STATUS_ATIVOS,
  type CompromissoResumo,
  type ConsultaAgenda,
  type CriarBloqueioInput,
  type CriarCompromissoInput,
  type DefinirDisponibilidadeInput,
  type HorarioLivre,
  type JanelaDisponivel,
  type MudarStatusInput,
  type RemarcarCompromissoInput,
  type UsuarioAutenticado,
} from '@vivio/contracts';
import { ErroDominio } from '../../common/erros/erro-dominio';
import { PrismaService } from '../../infra/prisma.service';

/** Nome da restrição EXCLUDE criada na migração da agenda. */
const RESTRICAO_SOBREPOSICAO = 'compromisso_sem_sobreposicao';

const INCLUDE = {
  aluno: { select: { id: true, nome: true, email: true } },
  profissional: { select: { id: true, nome: true, papel: true } },
} as const;

type CompromissoComPessoas = Prisma.CompromissoGetPayload<{ include: typeof INCLUDE }>;

@Injectable()
export class AgendaService {
  constructor(private readonly prisma: PrismaService) {}

  // --- compromissos --------------------------------------------------------

  async listar(profissionalId: string, consulta: ConsultaAgenda): Promise<CompromissoResumo[]> {
    const compromissos = await this.prisma.compromisso.findMany({
      where: {
        profissionalId,
        inicioEm: { gte: new Date(consulta.de), lte: new Date(consulta.ate) },
        ...(consulta.incluirCancelados
          ? {}
          : { status: { not: StatusCompromisso.CANCELADO } }),
      },
      include: INCLUDE,
      orderBy: { inicioEm: 'asc' },
    });
    return compromissos.map((c) => this.paraResumo(c));
  }

  /** O que o aluno vê: os compromissos dele com qualquer profissional. */
  async meusCompromissos(alunoId: string, consulta: ConsultaAgenda): Promise<CompromissoResumo[]> {
    const compromissos = await this.prisma.compromisso.findMany({
      where: {
        alunoId,
        inicioEm: { gte: new Date(consulta.de), lte: new Date(consulta.ate) },
        status: { not: StatusCompromisso.CANCELADO },
      },
      include: INCLUDE,
      orderBy: { inicioEm: 'asc' },
    });
    return compromissos.map((c) => this.paraResumo(c));
  }

  async criar(
    profissional: UsuarioAutenticado,
    dados: CriarCompromissoInput,
  ): Promise<CompromissoResumo> {
    await this.exigirVinculoAtivo(dados.alunoId, profissional.id);

    const inicioEm = dados.inicioEm;
    const fimEm =
      dados.fimEm ??
      new Date(
        inicioEm.getTime() +
          (dados.duracaoMin ?? DURACAO_PADRAO_MIN[dados.tipo]) * 60_000,
      );

    if (fimEm <= inicioEm) {
      throw ErroDominio.conflito('O fim precisa ser depois do início.');
    }

    try {
      const criado = await this.prisma.compromisso.create({
        data: {
          profissionalId: profissional.id,
          alunoId: dados.alunoId,
          tipo: dados.tipo as TipoCompromisso,
          titulo: dados.titulo,
          inicioEm,
          fimEm,
          local: dados.local,
          observacao: dados.observacao,
          criadoPorId: profissional.id,
        },
        include: INCLUDE,
      });
      return this.paraResumo(criado);
    } catch (erro) {
      throw this.traduzirConflitoDeHorario(erro, inicioEm, fimEm);
    }
  }

  async remarcar(
    profissional: UsuarioAutenticado,
    compromissoId: string,
    dados: RemarcarCompromissoInput,
  ): Promise<CompromissoResumo> {
    const atual = await this.exigirDono(profissional.id, compromissoId);
    if (atual.status === StatusCompromisso.REALIZADO) {
      throw ErroDominio.conflito('Compromisso já realizado não pode ser remarcado.');
    }

    try {
      const atualizado = await this.prisma.compromisso.update({
        where: { id: compromissoId },
        data: {
          inicioEm: dados.inicioEm,
          fimEm: dados.fimEm,
          local: dados.local,
          observacao: dados.observacao,
          // Remarcar zera a confirmação: o aluno precisa confirmar o horário novo.
          status: StatusCompromisso.AGENDADO,
        },
        include: INCLUDE,
      });
      return this.paraResumo(atualizado);
    } catch (erro) {
      throw this.traduzirConflitoDeHorario(erro, dados.inicioEm, dados.fimEm);
    }
  }

  async mudarStatus(
    usuario: UsuarioAutenticado,
    compromissoId: string,
    dados: MudarStatusInput,
  ): Promise<CompromissoResumo> {
    const atual = await this.prisma.compromisso.findUnique({ where: { id: compromissoId } });
    if (!atual) throw ErroDominio.naoEncontrado('Compromisso');

    const ehDono = atual.profissionalId === usuario.id;
    const ehAluno = atual.alunoId === usuario.id;
    if (!ehDono && !ehAluno) throw ErroDominio.naoEncontrado('Compromisso');

    // O aluno confirma presença ou cancela; marcar como realizado ou faltou é
    // registro clínico, e isso é do profissional.
    if (
      !ehDono &&
      dados.status !== StatusCompromisso.CONFIRMADO &&
      dados.status !== StatusCompromisso.CANCELADO
    ) {
      throw ErroDominio.papelNaoAutorizado(
        'Você pode confirmar ou cancelar; o restante é o profissional que registra.',
      );
    }

    const atualizado = await this.prisma.compromisso.update({
      where: { id: compromissoId },
      data: {
        status: dados.status,
        ...(dados.status === StatusCompromisso.CANCELADO
          ? { canceladoEm: new Date(), motivoCancelamento: dados.motivo }
          : {}),
      },
      include: INCLUDE,
    });
    return this.paraResumo(atualizado);
  }

  // --- disponibilidade -----------------------------------------------------

  async definirDisponibilidade(
    profissionalId: string,
    dados: DefinirDisponibilidadeInput,
  ): Promise<JanelaDisponivel[]> {
    // Substitui a semana inteira: é mais previsível para quem edita do que
    // tentar casar janela por janela.
    const janelas = await this.prisma.$transaction(async (tx) => {
      await tx.disponibilidadeSlot.deleteMany({ where: { profissionalId } });
      if (dados.janelas.length === 0) return [];
      await tx.disponibilidadeSlot.createMany({
        data: dados.janelas.map((j) => ({ profissionalId, ...j })),
      });
      return tx.disponibilidadeSlot.findMany({
        where: { profissionalId },
        orderBy: [{ diaSemana: 'asc' }, { horaInicio: 'asc' }],
      });
    });

    return janelas.map((j) => ({
      id: j.id,
      diaSemana: j.diaSemana,
      horaInicio: j.horaInicio,
      horaFim: j.horaFim,
      duracaoMin: j.duracaoMin,
    }));
  }

  async listarDisponibilidade(profissionalId: string): Promise<JanelaDisponivel[]> {
    const janelas = await this.prisma.disponibilidadeSlot.findMany({
      where: { profissionalId },
      orderBy: [{ diaSemana: 'asc' }, { horaInicio: 'asc' }],
    });
    return janelas.map((j) => ({
      id: j.id,
      diaSemana: j.diaSemana,
      horaInicio: j.horaInicio,
      horaFim: j.horaFim,
      duracaoMin: j.duracaoMin,
    }));
  }

  async criarBloqueio(profissionalId: string, dados: CriarBloqueioInput) {
    return this.prisma.bloqueioAgenda.create({
      data: { profissionalId, inicioEm: dados.inicioEm, fimEm: dados.fimEm, motivo: dados.motivo },
    });
  }

  /**
   * Horários livres de um dia: parte das janelas de atendimento e remove o que
   * já está ocupado por compromisso ativo ou por bloqueio.
   */
  async horariosLivres(
    profissionalId: string,
    dataISO: string,
    duracaoMin?: number,
  ): Promise<HorarioLivre[]> {
    const dia = new Date(`${dataISO}T00:00:00.000Z`);
    const fimDoDia = new Date(`${dataISO}T23:59:59.999Z`);
    // getUTCDay: 0=domingo. O app usa 1=segunda...7=domingo.
    const diaSemana = dia.getUTCDay() === 0 ? 7 : dia.getUTCDay();

    const [janelas, ocupados, bloqueios] = await Promise.all([
      this.prisma.disponibilidadeSlot.findMany({ where: { profissionalId, diaSemana } }),
      this.prisma.compromisso.findMany({
        where: {
          profissionalId,
          status: { in: STATUS_ATIVOS as StatusCompromisso[] },
          inicioEm: { lte: fimDoDia },
          fimEm: { gte: dia },
        },
        select: { inicioEm: true, fimEm: true },
      }),
      this.prisma.bloqueioAgenda.findMany({
        where: { profissionalId, inicioEm: { lte: fimDoDia }, fimEm: { gte: dia } },
        select: { inicioEm: true, fimEm: true },
      }),
    ]);

    const indisponiveis = [...ocupados, ...bloqueios];
    const livres: HorarioLivre[] = [];

    for (const janela of janelas) {
      const passo = (duracaoMin ?? janela.duracaoMin) * 60_000;
      const inicioJanela = new Date(`${dataISO}T${janela.horaInicio}:00.000Z`);
      const fimJanela = new Date(`${dataISO}T${janela.horaFim}:00.000Z`);

      for (let t = inicioJanela.getTime(); t + passo <= fimJanela.getTime(); t += passo) {
        const inicio = new Date(t);
        const fim = new Date(t + passo);
        const colide = indisponiveis.some((o) => inicio < o.fimEm && fim > o.inicioEm);
        if (!colide) livres.push({ inicioEm: inicio.toISOString(), fimEm: fim.toISOString() });
      }
    }

    return livres.sort((a, b) => a.inicioEm.localeCompare(b.inicioEm));
  }

  // --- auxiliares ----------------------------------------------------------

  private async exigirVinculoAtivo(alunoId: string, profissionalId: string): Promise<void> {
    const vinculo = await this.prisma.vinculo.findUnique({
      where: { alunoId_profissionalId: { alunoId, profissionalId } },
    });
    if (!vinculo || vinculo.status !== StatusVinculo.ATIVO) throw ErroDominio.vinculoAusente();
  }

  private async exigirDono(profissionalId: string, compromissoId: string) {
    const compromisso = await this.prisma.compromisso.findUnique({ where: { id: compromissoId } });
    if (!compromisso || compromisso.profissionalId !== profissionalId) {
      throw ErroDominio.naoEncontrado('Compromisso');
    }
    return compromisso;
  }

  /**
   * A restrição EXCLUDE do banco recusa a sobreposição; aqui ela vira uma
   * mensagem que o profissional entende, em vez de erro cru do Postgres.
   */
  private traduzirConflitoDeHorario(erro: unknown, inicioEm: Date, fimEm: Date): unknown {
    const texto = erro instanceof Error ? erro.message : String(erro);
    if (texto.includes(RESTRICAO_SOBREPOSICAO)) {
      return ErroDominio.conflito('Você já tem um compromisso neste horário.', {
        inicioEm: inicioEm.toISOString(),
        fimEm: fimEm.toISOString(),
      });
    }
    return erro;
  }

  private paraResumo(c: CompromissoComPessoas): CompromissoResumo {
    return {
      id: c.id,
      tipo: c.tipo,
      titulo: c.titulo,
      inicioEm: c.inicioEm.toISOString(),
      fimEm: c.fimEm.toISOString(),
      duracaoMin: Math.round((c.fimEm.getTime() - c.inicioEm.getTime()) / 60_000),
      local: c.local,
      observacao: c.observacao,
      status: c.status,
      motivoCancelamento: c.motivoCancelamento,
      aluno: c.aluno,
      profissional: { id: c.profissional.id, nome: c.profissional.nome, papel: c.profissional.papel },
    };
  }
}
