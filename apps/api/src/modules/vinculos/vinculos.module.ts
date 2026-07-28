import { Module } from '@nestjs/common';
import { AlunosController } from '../alunos/alunos.controller';
import { AlunosService } from '../alunos/alunos.service';
import { VinculosController } from './vinculos.controller';
import { VinculosService } from './vinculos.service';

@Module({
  controllers: [VinculosController, AlunosController],
  providers: [VinculosService, AlunosService],
  exports: [VinculosService],
})
export class VinculosModule {}
