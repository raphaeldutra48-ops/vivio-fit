import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ErroFilter } from './common/filters/erro.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { HealthController } from './health.controller';
import { PrismaModule } from './infra/prisma.module';
import { AuditoriaModule } from './modules/auditoria/auditoria.module';
import { AuthModule } from './modules/auth/auth.module';
import { ConsentimentosModule } from './modules/consentimentos/consentimentos.module';
import { MedidasModule } from './modules/medidas/medidas.module';
import { MeController } from './modules/users/me.controller';
import { VinculosModule } from './modules/vinculos/vinculos.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    JwtModule.register({ global: true }),
    PrismaModule,
    AuditoriaModule, // global: os guards registram negativas
    AuthModule,
    VinculosModule,
    ConsentimentosModule,
    MedidasModule,
  ],
  controllers: [HealthController, MeController],
  providers: [
    // Autenticação é o padrão. Rota aberta exige @Publico() explícito.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_FILTER, useClass: ErroFilter },
  ],
})
export class AppModule {}
