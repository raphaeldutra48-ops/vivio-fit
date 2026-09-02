import { createClient } from '@supabase/supabase-js';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { ErroFilter } from '../src/common/filters/erro.filter';
import { url } from './apoio';

/**
 * A API aceita o token que o Supabase emite.
 *
 * É o que torna a migração possível por partes. A autenticação já saiu daqui;
 * as 177 rotas de dados saem por grupos, com o app no ar. No meio do caminho o
 * SDK manda um token que esta API não emitiu, e ela precisa reconhecê-lo — ou
 * a alternativa vira um dia de virada, com tudo de uma vez, num app de saúde
 * com gente usando.
 *
 * Este arquivo morre junto com `apps/api`. Enquanto ele existe, é ele que
 * garante que a ponte não caiu.
 */
const urlSupabase = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;

describe.skipIf(!urlSupabase || !anon)('token do Supabase na API (e2e)', () => {
  let app: INestApplication;
  let tokenSupabase = '';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new ErroFilter());
    await app.init();

    const supa = createClient(urlSupabase!, anon!, { auth: { persistSession: false } });
    const { data, error } = await supa.auth.signInWithPassword({
      email: 'personal@viviofit.com.br',
      password: 'Senha@123',
    });
    if (error || !data.session) throw new Error(`login no Supabase falhou: ${error?.message}`);
    tokenSupabase = data.session.access_token;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('o token do Supabase entra, e a API reconhece a pessoa certa', async () => {
    const r = await request(app.getHttpServer())
      .get(url('/me'))
      .set('Authorization', `Bearer ${tokenSupabase}`)
      .expect(200);

    expect(r.body.email).toBe('personal@viviofit.com.br');
    expect(r.body.papel).toBe('PERSONAL');
  });

  it('token adulterado não entra', async () => {
    // Troca o último caractere da assinatura. O corpo continua legível e
    // plausível; o que não fecha é a assinatura — que é a única coisa que
    // decide.
    const partes = tokenSupabase.split('.');
    const assinatura = partes[2]!;
    const adulterado = `${partes[0]}.${partes[1]}.${assinatura.slice(0, -1)}${
      assinatura.endsWith('A') ? 'B' : 'A'
    }`;

    await request(app.getHttpServer())
      .get(url('/me'))
      .set('Authorization', `Bearer ${adulterado}`)
      .expect(401);
  });

  it('token de outro emissor não entra', async () => {
    /*
      O corpo é o de um token válido; a assinatura é de outra chave. Sem a
      conferência de `issuer`, um projeto Supabase qualquer — inclusive um que
      qualquer pessoa cria de graça — emitiria token aceito aqui.
    */
    const forjado = [
      Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
      Buffer.from(
        JSON.stringify({
          sub: '00000000-0000-0000-0000-000000000000',
          vivio_id: 'qualquer',
          aud: 'authenticated',
          iss: 'https://outroprojeto.supabase.co/auth/v1',
          exp: Math.floor(Date.now() / 1000) + 3600,
        }),
      ).toString('base64url'),
      Buffer.from('assinatura-inventada').toString('base64url'),
    ].join('.');

    await request(app.getHttpServer())
      .get(url('/me'))
      .set('Authorization', `Bearer ${forjado}`)
      .expect(401);
  });

  it('sem token continua sendo 401', async () => {
    await request(app.getHttpServer()).get(url('/me')).expect(401);
  });
});
