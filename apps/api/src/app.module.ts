import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    // Módulos de domínio entram aqui a partir do B1.
  ],
  controllers: [HealthController],
})
export class AppModule {}
