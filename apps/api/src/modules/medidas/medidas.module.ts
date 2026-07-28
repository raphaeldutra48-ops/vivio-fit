import { Module } from '@nestjs/common';
import { MedidasController } from './medidas.controller';
import { MedidasService } from './medidas.service';

@Module({
  controllers: [MedidasController],
  providers: [MedidasService],
})
export class MedidasModule {}
