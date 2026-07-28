import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificacoesService } from './notificacoes.service';

/**
 * Dispara os lembretes a cada minuto.
 *
 * LIMITAÇÃO CONHECIDA: roda dentro do processo da API. Com mais de uma
 * instância, todas executariam a varredura — o que é seguro (a unique
 * (userId, tipo, referenteA) impede envio duplicado), mas desperdiça consulta.
 * A fila com BullMQ/Redis resolve isso quando o Redis existir.
 */
@Injectable()
export class LembretesScheduler {
  private readonly logger = new Logger(LembretesScheduler.name);
  private readonly habilitado: boolean;

  constructor(
    private readonly notificacoes: NotificacoesService,
    config: ConfigService,
  ) {
    // Desligado nos testes: o e2e chama o serviço direto com horário injetado.
    this.habilitado = config.get<string>('LEMBRETES_ATIVOS') !== 'false';
  }

  @Cron(CronExpression.EVERY_MINUTE, { name: 'lembretes' })
  async varrer(): Promise<void> {
    if (!this.habilitado) return;
    try {
      const { enviados } = await this.notificacoes.dispararLembretesDevidos();
      if (enviados > 0) this.logger.log(`${enviados} lembrete(s) disparado(s)`);
    } catch (erro) {
      // Nunca deixar a exceção subir: o scheduler pararia de rodar.
      this.logger.error('falha na varredura de lembretes', erro as Error);
    }
  }
}
