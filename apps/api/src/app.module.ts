import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import cookieParser from 'cookie-parser';
import { ErroFilter } from './common/filters/erro.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { HealthController } from './health.controller';
import { PrismaModule } from './infra/prisma.module';
import { AgendaModule } from './modules/agenda/agenda.module';
import { AuditoriaModule } from './modules/auditoria/auditoria.module';
import { AuthModule } from './modules/auth/auth.module';
import { AvaliacaoModule } from './modules/avaliacao/avaliacao.module';
import { ChatModule } from './modules/chat/chat.module';
import { ConsentimentosModule } from './modules/consentimentos/consentimentos.module';
import { ExerciciosModule } from './modules/exercicios/exercicios.module';
import { FotosModule } from './modules/fotos/fotos.module';
import { MedidasModule } from './modules/medidas/medidas.module';
import { MidiaModule } from './modules/midia/midia.module';
import { NotificacoesModule } from './modules/notificacoes/notificacoes.module';
import { NutricaoModule } from './modules/nutricao/nutricao.module';
import { AdminModule } from './modules/admin/admin.module';
import { PrescricoesModule } from './modules/prescricoes/prescricoes.module';
import { TreinosModule } from './modules/treinos/treinos.module';
import { MeController } from './modules/users/me.controller';
import { VinculosModule } from './modules/vinculos/vinculos.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    JwtModule.register({ global: true }),
    PrismaModule,
    AuditoriaModule, // global: os guards registram negativas
    MidiaModule, // global: vários módulos assinam links de leitura
    AuthModule,
    VinculosModule,
    ConsentimentosModule,
    MedidasModule,
    ExerciciosModule,
    TreinosModule,
    FotosModule,
    NotificacoesModule,
    NutricaoModule,
    ChatModule,
    AgendaModule,
    AvaliacaoModule,
    PrescricoesModule,
    AdminModule,
  ],
  controllers: [HealthController, MeController],
  providers: [
    // Autenticação é o padrão. Rota aberta exige @Publico() explícito.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_FILTER, useClass: ErroFilter },
  ],
})
export class AppModule implements NestModule {
  /**
   * O parser de cookie fica aqui, e não no `main.ts`, porque os testes montam a
   * aplicação pelo módulo e nunca passam pelo bootstrap. No `main.ts` ele
   * existiria em produção e faltaria no teste — que é justamente onde a
   * diferença passaria despercebida.
   */
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(cookieParser()).forRoutes('*');
  }
}
