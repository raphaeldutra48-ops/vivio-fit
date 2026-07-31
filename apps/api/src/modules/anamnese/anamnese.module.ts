import { Module } from '@nestjs/common';
import { AnamnesesController, ModelosAnamneseController } from './anamnese.controller';
import { AnamneseService } from './anamnese.service';

@Module({
  controllers: [ModelosAnamneseController, AnamnesesController],
  providers: [AnamneseService],
})
export class AnamneseModule {}
