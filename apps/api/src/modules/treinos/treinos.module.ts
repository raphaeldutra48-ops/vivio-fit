import { Module } from '@nestjs/common';
import { ExecucoesController } from './execucoes.controller';
import { ExecucoesService } from './execucoes.service';
import { PlanosController } from './planos.controller';
import { PlanosService } from './planos.service';

@Module({
  controllers: [PlanosController, ExecucoesController],
  providers: [PlanosService, ExecucoesService],
})
export class TreinosModule {}
