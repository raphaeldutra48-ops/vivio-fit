import { Module } from '@nestjs/common';
import { ExamesController } from './exames.controller';
import { ExamesService } from './exames.service';

@Module({
  controllers: [ExamesController],
  providers: [ExamesService],
})
export class ExamesModule {}
