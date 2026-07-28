import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api/v1');
  app.enableCors({ origin: true, credentials: true });

  const config = new DocumentBuilder()
    .setTitle('Vívio Fit API')
    .setDescription('API do super-app de treino, nutrição e saúde integrada')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));

  const porta = Number(process.env.PORT ?? 3333);
  await app.listen(porta);
  Logger.log(`API em http://localhost:${porta}/api/v1 — docs em /docs`, 'Bootstrap');
}

void bootstrap();
