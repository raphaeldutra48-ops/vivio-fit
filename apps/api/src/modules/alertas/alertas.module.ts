import { Module } from '@nestjs/common';
import { AlertasController } from './alertas.controller';
import { AlertasService } from './alertas.service';

@Module({
  controllers: [AlertasController],
  providers: [AlertasService],
  // Exportado porque o registro de exame dispara a geração dos alertas.
  exports: [AlertasService],
})
export class AlertasModule {}
