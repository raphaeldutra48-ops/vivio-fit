import { Module } from '@nestjs/common';
import { AguaService } from './agua.service';
import { AlimentosService } from './alimentos.service';
import { CardapiosService } from './cardapios.service';
import { ComprasService } from './compras.service';
import { DietasService } from './dietas.service';
import { AlimentosController, CardapiosController, NutricaoController } from './nutricao.controller';
import { RefeicoesService } from './refeicoes.service';

@Module({
  controllers: [AlimentosController, NutricaoController, CardapiosController],
  providers: [AlimentosService, DietasService, AguaService, RefeicoesService, CardapiosService, ComprasService],
  exports: [AguaService],
})
export class NutricaoModule {}
