import { Module } from '@nestjs/common';
import { ComparativoController } from './comparativo.controller';
import { ComparativoService } from './comparativo.service';

@Module({
  controllers: [ComparativoController],
  providers: [ComparativoService],
})
export class ComparativoModule {}
