import { Module } from '@nestjs/common';
import { AguaService } from './agua.service';
import { AlimentosService } from './alimentos.service';
import { DietasService } from './dietas.service';
import { AlimentosController, NutricaoController } from './nutricao.controller';
import { RefeicoesService } from './refeicoes.service';

@Module({
  controllers: [AlimentosController, NutricaoController],
  providers: [AlimentosService, DietasService, AguaService, RefeicoesService],
  exports: [AguaService],
})
export class NutricaoModule {}
