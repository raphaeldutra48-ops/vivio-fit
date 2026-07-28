import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ENVIADOR, EnviadorDeLog } from './enviador';
import { LembretesScheduler } from './lembretes.scheduler';
import { NotificacoesController } from './notificacoes.controller';
import { NotificacoesService } from './notificacoes.service';

/**
 * Trocar o driver de push em produção é substituir o provider de ENVIADOR por
 * uma implementação com o SDK do Firebase. O agendamento não muda.
 */
@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [NotificacoesController],
  providers: [
    EnviadorDeLog,
    { provide: ENVIADOR, useExisting: EnviadorDeLog },
    NotificacoesService,
    LembretesScheduler,
  ],
  exports: [NotificacoesService],
})
export class NotificacoesModule {}
