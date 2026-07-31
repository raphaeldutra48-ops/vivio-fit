import { Module } from '@nestjs/common';
import { AguaService } from './agua.service';
import { AlimentosService } from './alimentos.service';
import { CardapiosService } from './cardapios.service';
import { ComprasService } from './compras.service';
import { DietasService } from './dietas.service';
import { AlimentosController, CardapiosController, NutricaoController } from './nutricao.controller';
import { ReceitasController, RefeicoesSalvasController } from './receitas.controller';
import { ReceitasService } from './receitas.service';
import { RefeicoesService } from './refeicoes.service';

@Module({
  controllers: [
    AlimentosController,
    NutricaoController,
    CardapiosController,
    ReceitasController,
    RefeicoesSalvasController,
  ],
  providers: [
    AlimentosService,
    DietasService,
    AguaService,
    RefeicoesService,
    CardapiosService,
    ComprasService,
    ReceitasService,
  ],
  exports: [AguaService],
})
export class NutricaoModule {}
