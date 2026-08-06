import { Module } from '@nestjs/common';
import { CheckinController } from './checkin.controller';
import { CheckinService } from './checkin.service';

@Module({
  controllers: [CheckinController],
  providers: [CheckinService],
  // Exportado porque o painel de progresso e o alerta de baixa adesão leem
  // daqui — o cálculo de aderência tem de ser um só.
  exports: [CheckinService],
})
export class CheckinModule {}
