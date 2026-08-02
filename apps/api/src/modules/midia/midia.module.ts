import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ARMAZENAMENTO, type Armazenamento } from './armazenamento';
import { ArmazenamentoLocal } from './armazenamento-local';
import { ArmazenamentoR2 } from './armazenamento-r2';
import { escolherDriverDeMidia } from './escolher-armazenamento';
import { MidiaController } from './midia.controller';
import { MidiaService } from './midia.service';

/**
 * Global: exercícios e fotos precisam gerar link assinado ao devolver o recurso.
 *
 * O driver é escolhido por configuração — R2 quando o bucket está apontado,
 * disco local caso contrário. **Nenhum serviço muda**: era exatamente para
 * isso que a interface `Armazenamento` existia desde o começo.
 */
@Global()
@Module({
  controllers: [MidiaController],
  providers: [
    // O local continua registrado por si: o controller de mídia usa os métodos
    // dele (gravar, verificar assinatura) que só existem no modo disco.
    ArmazenamentoLocal,
    {
      provide: ARMAZENAMENTO,
      inject: [ConfigService, ArmazenamentoLocal],
      useFactory: (config: ConfigService, local: ArmazenamentoLocal): Armazenamento =>
        escolherDriverDeMidia(config, new Logger('Midia')) === 'R2'
          ? new ArmazenamentoR2(config)
          : local,
    },
    MidiaService,
  ],
  exports: [MidiaService, ARMAZENAMENTO],
})
export class MidiaModule {}
