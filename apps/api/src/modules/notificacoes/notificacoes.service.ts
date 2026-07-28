import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma, TipoLembrete } from '@prisma/client';
import {
  PREVIA_LEMBRETE,
  type DefinirLembreteInput,
  type LembreteResumo,
  type NotificacaoResumo,
  type RegistrarDispositivoInput,
} from '@vivio/contracts';
import { PrismaService } from '../../infra/prisma.service';
import { estaNaHora, momentoLocal } from './agenda';
import { ENVIADOR, type Enviador } from './enviador';

@Injectable()
export class NotificacoesService {
  private readonly logger = new Logger(NotificacoesService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENVIADOR) private readonly enviador: Enviador,
  ) {}

  // --- dispositivos --------------------------------------------------------

  /**
   * O mesmo token pode migrar de conta (celular emprestado, troca de login),
   * então o upsert reatribui em vez de duplicar.
   */
  async registrarDispositivo(userId: string, dados: RegistrarDispositivoInput): Promise<void> {
    await this.prisma.tokenDispositivo.upsert({
      where: { token: dados.token },
      create: { userId, token: dados.token, plataforma: dados.plataforma },
      update: { userId, plataforma: dados.plataforma, ativo: true, usadoEm: new Date() },
    });
  }

  async removerDispositivo(userId: string, token: string): Promise<void> {
    await this.prisma.tokenDispositivo.updateMany({
      where: { userId, token },
      data: { ativo: false },
    });
  }

  // --- configuração --------------------------------------------------------

  async listarLembretes(alunoId: string): Promise<LembreteResumo[]> {
    const configs = await this.prisma.configuracaoLembrete.findMany({ where: { alunoId } });
    return configs.map((c) => ({
      id: c.id,
      tipo: c.tipo,
      horarios: c.horarios,
      diasDaSemana: c.diasDaSemana,
      canais: c.canais,
      ativo: c.ativo,
    }));
  }

  async definirLembrete(alunoId: string, dados: DefinirLembreteInput): Promise<LembreteResumo> {
    const salvo = await this.prisma.configuracaoLembrete.upsert({
      where: { alunoId_tipo: { alunoId, tipo: dados.tipo } },
      create: {
        alunoId,
        tipo: dados.tipo,
        horarios: dados.horarios,
        diasDaSemana: dados.diasDaSemana,
        canais: dados.canais,
        ativo: dados.ativo,
      },
      update: {
        horarios: dados.horarios,
        diasDaSemana: dados.diasDaSemana,
        canais: dados.canais,
        ativo: dados.ativo,
      },
    });

    return {
      id: salvo.id,
      tipo: salvo.tipo,
      horarios: salvo.horarios,
      diasDaSemana: salvo.diasDaSemana,
      canais: salvo.canais,
      ativo: salvo.ativo,
    };
  }

  async listarNotificacoes(userId: string, limite = 30): Promise<NotificacaoResumo[]> {
    const registros = await this.prisma.notificacao.findMany({
      where: { userId },
      orderBy: { criadoEm: 'desc' },
      take: limite,
    });
    return registros.map((n) => ({
      id: n.id,
      tipo: n.tipo,
      titulo: n.titulo,
      corpo: n.corpo,
      deeplink: n.deeplink,
      agendadaPara: n.agendadaPara.toISOString(),
      enviadaEm: n.enviadaEm?.toISOString() ?? null,
      lidaEm: n.lidaEm?.toISOString() ?? null,
    }));
  }

  async marcarComoLida(userId: string, id: string): Promise<void> {
    await this.prisma.notificacao.updateMany({
      where: { id, userId, lidaEm: null },
      data: { lidaEm: new Date() },
    });
  }

  // --- disparo -------------------------------------------------------------

  /**
   * Varre os lembretes devidos AGORA e dispara.
   *
   * Chamado a cada minuto pelo scheduler, e diretamente pelos testes — por isso
   * recebe `agora`: horário injetado torna o comportamento verificável sem
   * esperar o relógio.
   */
  async dispararLembretesDevidos(agora = new Date()): Promise<{ enviados: number }> {
    const configs = await this.prisma.configuracaoLembrete.findMany({
      where: { ativo: true, canais: { has: 'PUSH' } },
      include: { aluno: { include: { perfilAluno: { select: { timezone: true } } } } },
    });

    let enviados = 0;

    for (const config of configs) {
      const timezone = config.aluno.perfilAluno?.timezone ?? 'America/Sao_Paulo';
      const momento = momentoLocal(agora, timezone);

      if (!estaNaHora(momento, config.horarios, config.diasDaSemana)) continue;
      if (config.tipo === TipoLembrete.TREINO && (await this.jaTreinouHoje(config.alunoId, momento.data))) {
        continue; // lembrar quem já treinou é ruído
      }

      const criada = await this.criarSeNaoExistir(config.alunoId, config.tipo, momento.data, agora);
      if (!criada) continue; // já existia: lembrete do dia já foi gerado

      await this.entregar(criada.id, config.alunoId, criada.titulo, criada.corpo, criada.deeplink);
      enviados++;
    }

    return { enviados };
  }

  /** Não lembrar de treinar quem já treinou — a checagem é no dia local do aluno. */
  private async jaTreinouHoje(alunoId: string, dataLocal: string): Promise<boolean> {
    const inicio = new Date(`${dataLocal}T00:00:00.000Z`);
    const fim = new Date(`${dataLocal}T23:59:59.999Z`);
    const total = await this.prisma.execucaoTreino.count({
      where: { alunoId, iniciadoEm: { gte: inicio, lte: fim } },
    });
    return total > 0;
  }

  /**
   * A unique (userId, tipo, referenteA) é a defesa real contra duplicata:
   * se o scheduler rodar duas vezes no mesmo minuto, ou houver duas instâncias
   * da API, o segundo insert falha e nada é enviado de novo.
   */
  private async criarSeNaoExistir(
    userId: string,
    tipo: TipoLembrete,
    dataLocal: string,
    agora: Date,
  ) {
    const previa = PREVIA_LEMBRETE[tipo];
    try {
      return await this.prisma.notificacao.create({
        data: {
          userId,
          tipo,
          titulo: previa.titulo,
          corpo: previa.corpo,
          deeplink: tipo === TipoLembrete.TREINO ? 'viviofit://treino' : null,
          referenteA: new Date(`${dataLocal}T00:00:00.000Z`),
          agendadaPara: agora,
        },
      });
    } catch (erro) {
      if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002') return null;
      throw erro;
    }
  }

  private async entregar(
    notificacaoId: string,
    userId: string,
    titulo: string,
    corpo: string,
    deeplink: string | null,
  ): Promise<void> {
    const dispositivos = await this.prisma.tokenDispositivo.findMany({
      where: { userId, ativo: true },
      select: { token: true },
    });

    if (dispositivos.length === 0) {
      // Sem dispositivo o lembrete fica registrado, mas não entregue. O app
      // mostra na lista de notificações quando o aluno abrir.
      await this.prisma.notificacao.update({
        where: { id: notificacaoId },
        data: { falhaEm: new Date(), erro: 'SEM_DISPOSITIVO' },
      });
      return;
    }

    try {
      const resultado = await this.enviador.enviar({
        tokens: dispositivos.map((d) => d.token),
        titulo,
        corpo,
        deeplink: deeplink ?? undefined,
      });

      if (resultado.tokensInvalidos.length > 0) {
        await this.prisma.tokenDispositivo.updateMany({
          where: { token: { in: resultado.tokensInvalidos } },
          data: { ativo: false },
        });
      }

      await this.prisma.notificacao.update({
        where: { id: notificacaoId },
        data: { enviadaEm: new Date() },
      });
    } catch (erro) {
      this.logger.error(`falha ao entregar notificação ${notificacaoId}`, erro as Error);
      await this.prisma.notificacao.update({
        where: { id: notificacaoId },
        data: { falhaEm: new Date(), erro: String(erro).slice(0, 200) },
      });
    }
  }
}
