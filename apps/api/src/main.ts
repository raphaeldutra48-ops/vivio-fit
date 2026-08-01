import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { origensPermitidas } from './origens';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const origens = origensPermitidas();

  // Atrás do proxy do Railway, `req.ip` seria o IP do proxy — o mesmo para
  // todo mundo — e o limite de tentativas por IP trancaria o login geral em
  // vez de trancar o atacante. PROXY_HOPS diz quantos proxies confiar para ler
  // o X-Forwarded-For. Confiar demais é pior que não confiar: quem manda o
  // cabeçalho na mão escolheria o próprio IP.
  const saltos = Number(process.env.PROXY_HOPS ?? 0);
  if (saltos > 0) app.set('trust proxy', saltos);
  else if (process.env.NODE_ENV === 'production') {
    Logger.warn(
      'PROXY_HOPS não definida. Se a API estiver atrás de proxy, o limite por IP verá um IP só.',
      'Bootstrap',
    );
  }

  if (origens.length === 0) {
    // Falhar aqui é melhor que subir uma API que nenhuma tela consegue usar,
    // ou pior, uma que aceita todo mundo.
    Logger.error(
      'ORIGENS_PERMITIDAS não configurada. Defina as URLs da web e do app, separadas por vírgula.',
      'Bootstrap',
    );
    process.exit(1);
  }

  app.setGlobalPrefix('api/v1');
  // `credentials` é o que permite o cookie httpOnly do refresh ir e voltar.
  // `Retry-After` não é um cabeçalho que o CORS libera sozinho: sem declará-lo,
  // o navegador o esconde do JavaScript e o 429 chega sem dizer quanto esperar.
  // O corpo também traz `detalhes.segundos`, que é o que a tela usa hoje.
  app.enableCors({ origin: origens, credentials: true, exposedHeaders: ['Retry-After'] });

  // A documentação descreve a superfície inteira da API, inclusive rotas de
  // dado de saúde. Fica fora do ar em produção.
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Vívio Fit API')
      .setDescription('API do super-app de treino, nutrição e saúde integrada')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));
  }

  const porta = Number(process.env.PORT ?? 3333);
  // '0.0.0.0' e não o padrão: em contêiner, escutar só localhost torna a API
  // inalcançável de fora dele.
  await app.listen(porta, '0.0.0.0');
  Logger.log(`API na porta ${porta} — origens: ${origens.join(', ')}`, 'Bootstrap');
}

void bootstrap();
