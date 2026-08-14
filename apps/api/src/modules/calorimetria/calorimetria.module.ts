import { Module } from '@nestjs/common';
import { CalorimetriaController } from './calorimetria.controller';
import { CalorimetriaService } from './calorimetria.service';

@Module({
  controllers: [CalorimetriaController],
  providers: [CalorimetriaService],
  exports: [CalorimetriaService],
})
export class CalorimetriaModule {}
