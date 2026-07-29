import { Module } from '@nestjs/common';
import { EvolucaoService } from './evolucao.service';
import { MedidasController } from './medidas.controller';
import { MedidasService } from './medidas.service';

@Module({
  controllers: [MedidasController],
  providers: [MedidasService, EvolucaoService],
})
export class MedidasModule {}
