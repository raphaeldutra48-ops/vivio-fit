import { Global, Module } from '@nestjs/common';
import { ARMAZENAMENTO } from './armazenamento';
import { ArmazenamentoLocal } from './armazenamento-local';
import { MidiaController } from './midia.controller';
import { MidiaService } from './midia.service';

/**
 * Global: exercícios e fotos precisam gerar link assinado ao devolver o recurso.
 *
 * Trocar para S3 em produção é substituir o provider de ARMAZENAMENTO por uma
 * implementação com `@aws-sdk/s3-request-presigner`. Nenhum outro arquivo muda —
 * é por isso que a interface existe.
 */
@Global()
@Module({
  controllers: [MidiaController],
  providers: [
    ArmazenamentoLocal,
    { provide: ARMAZENAMENTO, useExisting: ArmazenamentoLocal },
    MidiaService,
  ],
  exports: [MidiaService, ARMAZENAMENTO],
})
export class MidiaModule {}
