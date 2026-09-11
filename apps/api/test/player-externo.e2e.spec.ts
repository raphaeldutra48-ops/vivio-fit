import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { ErroFilter } from '../src/common/filters/erro.filter';
import { PrismaService } from '../src/infra/prisma.service';
import { url } from './apoio';

/**
 * O player do acervo externo (Prime) pela API.
 *
 * O que se protege: o player de fora chega à tela só quando não há vídeo
 * nosso, e só se for do host aceito — o endereço vira `src` de iframe.
 *
 * Usa um exercício PRIVADO criado aqui, e não o supino do catálogo: a suíte
 * roda contra o banco de produção, onde o catálogo já tem os links do Prime, e
 * teste que dependesse deles quebraria no dia em que alguém rodasse
 * `vincular-prime` com `DESFAZER=true`.
 */
describe('Player externo (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let servidor: ReturnType<INestApplication['getHttpServer']>;
  let token: string;
  let idPersonal: string;
  let idExercicio: string;

  const PLAYER = 'https://iframe.mediadelivery.net/embed/693551/cfbfd8aa-ad9c-4d86-a7a8-62b4c06420b1';
  const nome = `Exercício do player ${Date.now().toString(36)}`;

  const midia = () =>
    request(servidor)
      .post(url('/exercicios/midia'))
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: [idExercicio] })
      .expect(200);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new ErroFilter());
    await app.init();
    prisma = app.get(PrismaService);
    servidor = app.getHttpServer();

    const login = await request(servidor)
      .post(url('/auth/login'))
      .send({ email: 'personal@viviofit.com.br', senha: 'Senha@123' });
    token = login.body.accessToken;
    idPersonal = login.body.usuario.id;

    const criado = await prisma.exercicio.create({
      data: {
        nome,
        grupoMuscular: 'PEITO',
        escopo: 'PRIVADO',
        criadoPorId: idPersonal,
        videoExternoUrl: PLAYER,
        videoCredito: 'Prime Coaching — uso autorizado',
      },
    });
    idExercicio = criado.id;
  });

  afterAll(async () => {
    await prisma.exercicio.deleteMany({ where: { id: idExercicio } });
    await app.close();
  });

  it('sem vídeo nosso, a mídia traz o player de fora', async () => {
    const r = await midia();
    expect(r.body[idExercicio]).toEqual({
      imagemUrl: null,
      videoUrl: null,
      videoExternoUrl: PLAYER,
    });
  });

  it('o resumo do exercício também traz o player — ele não expira', async () => {
    const r = await request(servidor)
      .get(url('/exercicios'))
      .query({ q: nome })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const e = (r.body as { id: string; videoExternoUrl: string | null }[]).find(
      (x) => x.id === idExercicio,
    );
    expect(e?.videoExternoUrl).toBe(PLAYER);
  });

  it('com vídeo nosso, o player de fora não é mandado', async () => {
    /*
      Mandar os dois deixaria a escolha para cada tela, e bastaria uma
      decidir diferente para a demonstração genérica cobrir a nossa.
    */
    await prisma.exercicio.update({
      where: { id: idExercicio },
      data: { videoChave: `exercicios/${idPersonal}/player-teste.mp4` },
    });

    const r = await midia();
    expect(r.body[idExercicio].videoUrl).toBeTruthy();
    expect(r.body[idExercicio].videoExternoUrl).toBeNull();

    await prisma.exercicio.update({ where: { id: idExercicio }, data: { videoChave: null } });
  });

  it('endereço fora da lista de players não sai da API', async () => {
    await prisma.exercicio.update({
      where: { id: idExercicio },
      data: { videoExternoUrl: 'https://golpe.com/embed/x' },
    });

    const r = await midia();
    // Sem imagem, sem vídeo e com player recusado: não há mídia nenhuma.
    expect(r.body[idExercicio]).toBeUndefined();

    const lista = await request(servidor)
      .get(url('/exercicios'))
      .query({ q: nome })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const e = (lista.body as { id: string; videoExternoUrl: string | null }[]).find(
      (x) => x.id === idExercicio,
    );
    expect(e?.videoExternoUrl).toBeNull();
  });
});
