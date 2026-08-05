import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { urlDoSmtp } from '../../entrega-de-email';
import { CORREIO, CorreioDeLog, CorreioSmtp } from './correio';
import { TokenService } from './token.service';
import { VerificacaoEmailService } from './verificacao-email.service';

/**
 * O driver de e-mail é escolhido por configuração: havendo para onde enviar,
 * entrega de verdade; sem isso, imprime no log. Assim produção só precisa da
 * variável — nenhum código muda.
 *
 * O "para onde enviar" sai de `RESEND_API_KEY` ou de `SMTP_URL` — ver
 * `urlDoSmtp`, que é a mesma função que o arranque usa para decidir se a API
 * pode subir. Duas leituras diferentes dessa configuração dariam uma API que
 * sobe dizendo que está tudo bem e um correio que imprime no log.
 */
@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    VerificacaoEmailService,
    CorreioDeLog,
    {
      provide: CORREIO,
      inject: [ConfigService, CorreioDeLog],
      useFactory: (config: ConfigService, log: CorreioDeLog) => {
        const url = urlDoSmtp();
        if (!url) return log;
        return new CorreioSmtp(
          url,
          config.get<string>('EMAIL_REMETENTE') ?? 'Vívio Fit <nao-responda@viviofit.com.br>',
        );
      },
    },
  ],
  exports: [TokenService],
})
export class AuthModule {}
