import { Module } from '@nestjs/common';
import { AlertasModule } from '../alertas/alertas.module';
import { CondicoesController } from './condicoes.controller';
import { CondicoesService } from './condicoes.service';

@Module({
  // Registrar condição é o que dispara os alertas cruzados.
  imports: [AlertasModule],
  controllers: [CondicoesController],
  providers: [CondicoesService],
})
export class CondicoesModule {}
