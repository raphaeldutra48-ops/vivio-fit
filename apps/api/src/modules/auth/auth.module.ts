import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { formaDeEnvio } from '../../entrega-de-email';
import { CORREIO, CorreioDeLog, CorreioResend, CorreioSmtp } from './correio';
import { RedefinicaoSenhaService } from './redefinicao-senha.service';
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
    RedefinicaoSenhaService,
    CorreioDeLog,
    {
      provide: CORREIO,
      inject: [ConfigService, CorreioDeLog],
      useFactory: (config: ConfigService, log: CorreioDeLog) => {
        const forma = formaDeEnvio();
        if (!forma) return log;

        const remetente =
          config.get<string>('EMAIL_REMETENTE') ?? 'Vívio Fit <nao-responda@viviofit.com.br>';

        return forma.via === 'RESEND'
          ? new CorreioResend(forma.chave, remetente)
          : new CorreioSmtp(forma.url, remetente);
      },
    },
  ],
  exports: [TokenService],
})
export class AuthModule {}
