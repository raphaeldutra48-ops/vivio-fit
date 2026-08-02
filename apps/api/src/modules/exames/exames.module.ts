import { Module } from '@nestjs/common';
import { AlertasModule } from '../alertas/alertas.module';
import { ExamesController } from './exames.controller';
import { ExamesService } from './exames.service';

@Module({
  // Registrar exame é o que dispara os alertas cruzados.
  imports: [AlertasModule],
  controllers: [ExamesController],
  providers: [ExamesService],
})
export class ExamesModule {}
