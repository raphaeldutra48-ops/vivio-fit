import { Module } from '@nestjs/common';
import { CheckinModule } from '../checkin/checkin.module';
import { ProgressoController } from './progresso.controller';
import { ProgressoService } from './progresso.service';

// Importa o CheckinModule em vez de recalcular adesão: a regra do denominador
// (dias com check-in, não dias do período) tem de existir num lugar só.
@Module({
  imports: [CheckinModule],
  controllers: [ProgressoController],
  providers: [ProgressoService],
})
export class ProgressoModule {}
