import { Module } from '@nestjs/common';
import { ConsentimentosController } from './consentimentos.controller';
import { ConsentimentosService } from './consentimentos.service';

@Module({
  controllers: [ConsentimentosController],
  providers: [ConsentimentosService],
})
export class ConsentimentosModule {}
