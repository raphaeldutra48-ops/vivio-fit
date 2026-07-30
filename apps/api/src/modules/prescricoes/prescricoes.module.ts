import { Module } from '@nestjs/common';
import {
  ModelosPrescricaoController,
  PrescricoesController,
  PrescritiveisController,
} from './prescricoes.controller';
import { PrescricoesService } from './prescricoes.service';

@Module({
  controllers: [PrescritiveisController, ModelosPrescricaoController, PrescricoesController],
  providers: [PrescricoesService],
})
export class PrescricoesModule {}
