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

  it('assinatura adulterada não entra', async () => {
    /*
      Troca um caractere do MEIO da assinatura, e não do fim.

      A primeira versão deste teste trocava o último, e passava reto: a
      assinatura ES256 tem 64 bytes, que em base64url dão 86 caracteres —
      86 × 6 = 516 bits para 512 de dados. Os 4 bits que sobram são
      preenchimento, e vivem justamente no último caractere. Trocar `A` por
      `B` ali mexia só no preenchimento, os bytes decodificavam idênticos, e o
      token continuava válido. O teste dizia "adulterado" sobre um token que
      não tinha sido adulterado.
    */
    const [cabecalho, corpo, assinatura] = tokenSupabase.split('.');
    const meio = Math.floor(assinatura!.length / 2);
    const trocado =
      assinatura!.slice(0, meio) +
      (assinatura![meio] === 'A' ? 'B' : 'A') +
      assinatura!.slice(meio + 1);

    await request(app.getHttpServer())
      .get(url('/me'))
      .set('Authorization', `Bearer ${cabecalho}.${corpo}.${trocado}`)
      .expect(401);
  });

  it('editar as claims para virar outra pessoa não entra', async () => {
    // A adulteração que de fato interessa: trocar `vivio_id` por outro id e
    // manter a assinatura. É o que separa "o token diz quem eu sou" de "o
    // token PROVA quem eu sou".
    const [cabecalho, corpo, assinatura] = tokenSupabase.split('.');
    const claims = JSON.parse(Buffer.from(corpo!, 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >;
    claims.vivio_id = 'sou-outra-pessoa';
    const corpoTrocado = Buffer.from(JSON.stringify(claims)).toString('base64url');

    await request(app.getHttpServer())
      .get(url('/me'))
      .set('Authorization', `Bearer ${cabecalho}.${corpoTrocado}.${assinatura}`)
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
