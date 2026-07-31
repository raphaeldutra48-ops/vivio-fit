import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { ErroFilter } from '../src/common/filters/erro.filter';
import { PrismaService } from '../src/infra/prisma.service';
import { criarAlunoVerificado, url } from './apoio';

describe('Materiais (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let servidor: ReturnType<INestApplication['getHttpServer']>;

  const senha = 'Senha@123';
  const sufixo = Date.now().toString(36);
  let tokenPersonal: string;
  let tokenNutri: string;

  /** Aluno com vínculo ativo com o personal. */
  let idAluno: string;
  let tokenAluno: string;
  /** Sem vínculo com o personal — não pode receber material dele. */
  let idEstranho: string;
  let tokenEstranho: string;

  let idMaterial: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new ErroFilter());
    await app.init();
    prisma = app.get(PrismaService);
    servidor = app.getHttpServer();

    const entrar = async (email: string) =>
      (await request(servidor).post(url('/auth/login')).send({ email, senha })).body.accessToken;
    tokenPersonal = await entrar('personal@viviofit.com.br');
    tokenNutri = await entrar('nutri@viviofit.com.br');

    const email = `material.${sufixo}@exemplo.com`;
    const aluno = await criarAlunoVerificado(servidor, {
      nome: 'Aluno Material',
      email,
      senha,
      dataNascimento: '1992-03-03',
    });
    idAluno = aluno.usuario.id;
    tokenAluno = aluno.accessToken;

    const convite = await request(servidor)
      .post(url('/vinculos/convidar'))
      .set('Authorization', `Bearer ${tokenPersonal}`)
      .send({ email })
      .expect(201);
    await request(servidor)
      .patch(url(`/vinculos/${convite.body.id}/aceitar`))
      .set('Authorization', `Bearer ${tokenAluno}`)
      .expect(200);

    const estranho = await criarAlunoVerificado(servidor, {
      nome: 'Aluno Estranho',
      email: `estranho.${sufixo}@exemplo.com`,
      senha,
      dataNascimento: '1993-04-04',
    });
    idEstranho = estranho.usuario.id;
    tokenEstranho = estranho.accessToken;
  });

  afterAll(async () => {
    const ids = [idAluno, idEstranho];
    await prisma.material.deleteMany({ where: { titulo: { contains: sufixo } } });
    await prisma.vinculo.deleteMany({ where: { alunoId: { in: ids } } });
    await prisma.perfilAluno.deleteMany({ where: { userId: { in: ids } } });
    await prisma.sessaoRefresh.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await app.close();
  });

  describe('biblioteca', () => {
    it('cria material do tipo LINK', async () => {
      const r = await request(servidor)
        .post(url('/materiais'))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .send({
          titulo: `Vídeo de aquecimento ${sufixo}`,
          tipo: 'LINK',
          url: 'https://exemplo.com/aquecimento',
          etiquetas: ['Mobilidade', 'INICIANTE'],
        })
        .expect(201);

      idMaterial = r.body.id;
      // Etiqueta normalizada: buscar por "mobilidade" precisa achar.
      expect(r.body.etiquetas).toEqual(['mobilidade', 'iniciante']);
    });

    it('LINK sem url é recusado', async () => {
      await request(servidor)
        .post(url('/materiais'))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .send({ titulo: `Sem url ${sufixo}`, tipo: 'LINK' })
        .expect(422);
    });

    it('ARQUIVO com tipo não aceito é recusado', async () => {
      await request(servidor)
        .post(url('/materiais'))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .send({
          titulo: `Executável ${sufixo}`,
          tipo: 'ARQUIVO',
          chave: 'materiais/x/y.exe',
          mimeType: 'application/x-msdownload',
        })
        .expect(422);
    });

    it('filtra por etiqueta', async () => {
      const r = await request(servidor)
        .get(url('/materiais?etiqueta=mobilidade'))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .expect(200);

      expect(r.body.some((m: { id: string }) => m.id === idMaterial)).toBe(true);
    });

    it('o material de um profissional não aparece para o outro', async () => {
      const r = await request(servidor)
        .get(url('/materiais'))
        .set('Authorization', `Bearer ${tokenNutri}`)
        .expect(200);

      expect(r.body.some((m: { id: string }) => m.id === idMaterial)).toBe(false);
    });
  });

  describe('compartilhamento', () => {
    it('antes de compartilhar, o aluno não vê', async () => {
      const r = await request(servidor)
        .get(url('/materiais/meus'))
        .set('Authorization', `Bearer ${tokenAluno}`)
        .expect(200);

      expect(r.body).toHaveLength(0);
    });

    /** Vínculo é a fronteira: a lista de alunos não é lista de disparo. */
    it('não compartilha com quem não é seu aluno', async () => {
      const r = await request(servidor)
        .post(url(`/materiais/${idMaterial}/compartilhar`))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .send({ alunoIds: [idEstranho] })
        .expect(403);

      expect(r.body.erro.codigo).toBe('PAPEL_NAO_AUTORIZADO');
    });

    it('compartilha com o aluno vinculado', async () => {
      const r = await request(servidor)
        .post(url(`/materiais/${idMaterial}/compartilhar`))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .send({ alunoIds: [idAluno] })
        .expect(201);

      expect(r.body.compartilhadoCom).toHaveLength(1);
      expect(r.body.compartilhadoCom[0].vistoEm).toBeNull();
    });

    it('agora o aluno vê, com o nome de quem mandou', async () => {
      const r = await request(servidor)
        .get(url('/materiais/meus'))
        .set('Authorization', `Bearer ${tokenAluno}`)
        .expect(200);

      expect(r.body).toHaveLength(1);
      expect(r.body[0].titulo).toContain('Vídeo de aquecimento');
      expect(r.body[0].autor.nome).toBeTruthy();
    });

    it('compartilhar de novo não duplica nem apaga o histórico', async () => {
      const r = await request(servidor)
        .post(url(`/materiais/${idMaterial}/compartilhar`))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .send({ alunoIds: [idAluno] })
        .expect(201);

      expect(r.body.compartilhadoCom).toHaveLength(1);
    });

    it('quem não recebeu leva 404, não 403', async () => {
      // 403 confirmaria que o material existe — 404 não conta nada.
      await request(servidor)
        .get(url(`/materiais/${idMaterial}/abrir`))
        .set('Authorization', `Bearer ${tokenEstranho}`)
        .expect(404);
    });

    it('abrir um LINK avisa que não é arquivo', async () => {
      const r = await request(servidor)
        .get(url(`/materiais/${idMaterial}/abrir`))
        .set('Authorization', `Bearer ${tokenAluno}`)
        .expect(409);

      expect(r.body.erro.mensagem).toContain('link');
    });

    it('descompartilhar tira da lista do aluno', async () => {
      await request(servidor)
        .delete(url(`/materiais/${idMaterial}/compartilhar/${idAluno}`))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .expect(204);

      const r = await request(servidor)
        .get(url('/materiais/meus'))
        .set('Authorization', `Bearer ${tokenAluno}`)
        .expect(200);

      expect(r.body).toHaveLength(0);
    });
  });
});
