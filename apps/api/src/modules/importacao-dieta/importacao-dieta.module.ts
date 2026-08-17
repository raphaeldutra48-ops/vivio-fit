import { Module } from '@nestjs/common';
import { MidiaModule } from '../midia/midia.module';
import { ImportacaoDietaController } from './importacao-dieta.controller';
import { ImportacaoDietaService } from './importacao-dieta.service';
import { LeitorDeDietaService } from './leitor-de-dieta.service';

@Module({
  // O armazenamento vem do MidiaModule: o documento já está lá, e o leitor
  // precisa dos bytes para mandar ao modelo.
  imports: [MidiaModule],
  controllers: [ImportacaoDietaController],
  providers: [ImportacaoDietaService, LeitorDeDietaService],
})
export class ImportacaoDietaModule {}
