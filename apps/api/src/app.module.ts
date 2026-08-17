import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import cookieParser from 'cookie-parser';
import { ErroFilter } from './common/filters/erro.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { LimiteInterceptor } from './common/limite/limite.interceptor';
import { HealthController } from './health.controller';
import { PrismaModule } from './infra/prisma.module';
import { AgendaModule } from './modules/agenda/agenda.module';
import { AuditoriaModule } from './modules/auditoria/auditoria.module';
import { AuthModule } from './modules/auth/auth.module';
import { AvaliacaoModule } from './modules/avaliacao/avaliacao.module';
import { ExamesModule } from './modules/exames/exames.module';
import { AlertasModule } from './modules/alertas/alertas.module';
import { CondicoesModule } from './modules/condicoes/condicoes.module';
import { ChatModule } from './modules/chat/chat.module';
import { ConsentimentosModule } from './modules/consentimentos/consentimentos.module';
import { ExerciciosModule } from './modules/exercicios/exercicios.module';
import { FotosModule } from './modules/fotos/fotos.module';
import { CheckinModule } from './modules/checkin/checkin.module';
import { ComparativoModule } from './modules/comparativo/comparativo.module';
import { CalorimetriaModule } from './modules/calorimetria/calorimetria.module';
import { CardioModule } from './modules/cardio/cardio.module';
import { ImportacaoDietaModule } from './modules/importacao-dieta/importacao-dieta.module';
import { FeedbackModule } from './modules/feedback/feedback.module';
import { MetasModule } from './modules/metas/metas.module';
import { ProgressoModule } from './modules/progresso/progresso.module';
import { MedidasModule } from './modules/medidas/medidas.module';
import { MidiaModule } from './modules/midia/midia.module';
import { NotificacoesModule } from './modules/notificacoes/notificacoes.module';
import { NutricaoModule } from './modules/nutricao/nutricao.module';
import { AdminModule } from './modules/admin/admin.module';
import { AnamneseModule } from './modules/anamnese/anamnese.module';
import { FinanceiroModule } from './modules/financeiro/financeiro.module';
import { MateriaisModule } from './modules/materiais/materiais.module';
import { RelatoriosModule } from './modules/relatorios/relatorios.module';
import { SiteModule } from './modules/site/site.module';
import { PrescricoesModule } from './modules/prescricoes/prescricoes.module';
import { TreinosModule } from './modules/treinos/treinos.module';
import { MeController } from './modules/users/me.controller';
import { PerfilService } from './modules/users/perfil.service';
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
    CheckinModule,
    ProgressoModule,
    MetasModule,
    ComparativoModule,
    FeedbackModule,
    CardioModule,
    ImportacaoDietaModule,
    CalorimetriaModule,
    ExerciciosModule,
    TreinosModule,
    FotosModule,
    NotificacoesModule,
    NutricaoModule,
    ChatModule,
    AgendaModule,
    AvaliacaoModule,
    ExamesModule,
    AlertasModule,
    CondicoesModule,
    PrescricoesModule,
    AdminModule,
    AnamneseModule,
    RelatoriosModule,
    MateriaisModule,
    FinanceiroModule,
    SiteModule,
  ],
  controllers: [HealthController, MeController],
  providers: [
    // Autenticação é o padrão. Rota aberta exige @Publico() explícito.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_FILTER, useClass: ErroFilter },
    // Inerte onde não há @Limite(): limitar uma rota é decisão explícita.
    { provide: APP_INTERCEPTOR, useClass: LimiteInterceptor },
    PerfilService,
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
