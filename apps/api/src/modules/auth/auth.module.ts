import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { CORREIO, CorreioDeLog, CorreioSmtp } from './correio';
import { TokenService } from './token.service';
import { VerificacaoEmailService } from './verificacao-email.service';

/**
 * O driver de e-mail é escolhido por configuração: com `SMTP_URL` definida,
 * entrega de verdade; sem ela, imprime no log. Assim produção só precisa da
 * variável — nenhum código muda.
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
        const url = config.get<string>('SMTP_URL');
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
