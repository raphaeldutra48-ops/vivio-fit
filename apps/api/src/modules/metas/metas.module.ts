import { Module } from '@nestjs/common';
import { MetasController } from './metas.controller';
import { MetasService } from './metas.service';

@Module({
  controllers: [MetasController],
  providers: [MetasService],
  // O painel de progresso lista as metas junto dos demais números.
  exports: [MetasService],
})
export class MetasModule {}
