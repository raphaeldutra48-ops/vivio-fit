import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { ErroFilter } from '../src/common/filters/erro.filter';
import { PrismaService } from '../src/infra/prisma.service';
import { criarAlunoVerificado } from './apoio';

/** Imagem PNG 1x1 válida — suficiente para exercitar o fluxo de upload. */
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

describe('Mídia, vídeo de exercício e fotos de evolução (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let servidor: ReturnType<INestApplication['getHttpServer']>;

  const senha = 'Senha@123';
  const sufixo = Date.now().toString(36);
  let tokenPersonal: string;
  let tokenNutri: string;
  let tokenAluno: string;
  let idAluno: string;
  let idExercicio: string;
  let idFoto: string;

  const url = (c: string) => `/api/v1${c}`;
  const semHost = (u: string) => u.replace(/^https?:\/\/[^/]+/, '');

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
      .send({ email: 'personal@viviofit.com.br', senha });
    tokenPersonal = login.body.accessToken;
    const loginNutri = await request(servidor)
      .post(url('/auth/login'))
      .send({ email: 'nutri@viviofit.com.br', senha });
    tokenNutri = loginNutri.body.accessToken;

    // Aluno exclusivo deste teste (ver pendência resolvida em C6).
    const email = `midia.${sufixo}@exemplo.com`;
    const registro = await criarAlunoVerificado(servidor, {
      nome: 'Aluno Mídia',
      email,
      senha,
      dataNascimento: '1994-03-15',
    });
    tokenAluno = registro.accessToken;
    idAluno = registro.usuario.id;

    const convite = await request(servidor)
      .post(url('/vinculos/convidar'))
      .set('Authorization', `Bearer ${tokenPersonal}`)
      .send({ email })
      .expect(201);
    await request(servidor)
      .patch(url(`/vinculos/${convite.body.id}/aceitar`))
      .set('Authorization', `Bearer ${tokenAluno}`)
      .expect(200);
    await request(servidor)
      .post(url('/consentimentos'))
      .set('Authorization', `Bearer ${tokenAluno}`)
      .send({ escopo: 'EVOLUCAO' })
      .expect(201);

    const exercicio = await request(servidor)
      .post(url('/exercicios'))
      .set('Authorization', `Bearer ${tokenPersonal}`)
      .send({ nome: `Exercicio com video ${sufixo}`, grupoMuscular: 'PEITO' })
      .expect(201);
    idExercicio = exercicio.body.id;
  });

  afterAll(async () => {
    await prisma.fotoEvolucao.deleteMany({ where: { alunoId: idAluno } });
    await prisma.consentimento.deleteMany({ where: { alunoId: idAluno } });
    await prisma.vinculo.deleteMany({ where: { alunoId: idAluno } });
    await prisma.perfilAluno.deleteMany({ where: { userId: idAluno } });
    await prisma.sessaoRefresh.deleteMany({ where: { userId: idAluno } });
    await prisma.logAuditoria.deleteMany({
      where: { OR: [{ alunoId: idAluno }, { atorId: idAluno }] },
    });
    await prisma.user.deleteMany({ where: { id: idAluno } });
    await prisma.exercicio.deleteMany({ where: { nome: { contains: sufixo } } });
    await app.close();
  });

  describe('autorização de upload', () => {
    it('recusa formato fora da lista', async () => {
      const r = await request(servidor)
        .post(url('/midia/upload-url'))
        .set('Authorization', `Bearer ${tokenAluno}`)
        .send({ tipo: 'FOTO_EVOLUCAO', mimeType: 'application/x-msdownload', tamanhoBytes: 1000 })
        .expect(409);

      expect(r.body.erro.codigo).toBe('CONFLITO');
    });

    it('recusa arquivo acima do limite', async () => {
      const r = await request(servidor)
        .post(url('/midia/upload-url'))
        .set('Authorization', `Bearer ${tokenAluno}`)
        .send({ tipo: 'FOTO_EVOLUCAO', mimeType: 'image/png', tamanhoBytes: 50 * 1024 * 1024 })
        .expect(409);

      expect(r.body.erro.mensagem).toContain('MB');
    });

    /** A chave é do servidor: o cliente não escolhe onde escreve. */
    it('a chave gerada contém o id de quem pediu', async () => {
      const r = await request(servidor)
        .post(url('/midia/upload-url'))
        .set('Authorization', `Bearer ${tokenAluno}`)
        .send({ tipo: 'FOTO_EVOLUCAO', mimeType: 'image/png', tamanhoBytes: PNG_1X1.byteLength })
        .expect(201);

      expect(r.body.chave.startsWith(`evolucao/${idAluno}/`)).toBe(true);
      expect(r.body.metodo).toBe('PUT');
      expect(new Date(r.body.expiraEm).getTime()).toBeGreaterThan(Date.now());
    });

    it('exige autenticação', async () => {
      await request(servidor)
        .post(url('/midia/upload-url'))
        .send({ tipo: 'FOTO_EVOLUCAO', mimeType: 'image/png', tamanhoBytes: 100 })
        .expect(401);
    });
  });

  describe('link assinado', () => {
    it('sem assinatura válida o upload é recusado', async () => {
      await request(servidor)
        .put(url('/midia/arquivo'))
        .query({ chave: `evolucao/${idAluno}/invasao.png`, expira: Date.now() + 60_000, assinatura: 'forjada' })
        .send(PNG_1X1)
        .expect(401);
    });

    it('assinatura expirada é recusada', async () => {
      const autorizacao = await request(servidor)
        .post(url('/midia/upload-url'))
        .set('Authorization', `Bearer ${tokenAluno}`)
        .send({ tipo: 'FOTO_EVOLUCAO', mimeType: 'image/png', tamanhoBytes: PNG_1X1.byteLength });

      const link = new URL(autorizacao.body.urlUpload);
      link.searchParams.set('expira', String(Date.now() - 1000));

      await request(servidor)
        .put(semHost(link.toString()))
        .send(PNG_1X1)
        .expect(401);
    });
  });

  describe('foto de evolução', () => {
    let chave: string;

    it('o aluno envia a foto e registra', async () => {
      const autorizacao = await request(servidor)
        .post(url('/midia/upload-url'))
        .set('Authorization', `Bearer ${tokenAluno}`)
        .send({ tipo: 'FOTO_EVOLUCAO', mimeType: 'image/png', tamanhoBytes: PNG_1X1.byteLength })
        .expect(201);
      chave = autorizacao.body.chave;

      const envio = await request(servidor)
        .put(semHost(autorizacao.body.urlUpload))
        .set('Content-Type', 'image/png')
        .send(PNG_1X1)
        .expect(200);
      expect(envio.body.tamanhoBytes).toBe(PNG_1X1.byteLength);

      const registro = await request(servidor)
        .post(url(`/alunos/${idAluno}/fotos`))
        .set('Authorization', `Bearer ${tokenAluno}`)
        .send({
          chave,
          mimeType: 'image/png',
          tamanhoBytes: PNG_1X1.byteLength,
          data: '2026-07-28',
          angulo: 'FRENTE',
        })
        .expect(201);

      idFoto = registro.body.id;
      // Padrão é NÃO compartilhar: consentir com EVOLUCAO não é liberar cada foto.
      expect(registro.body.visivelPara).toEqual([]);
      expect(registro.body.url).toContain('assinatura=');
    });

    it('o link assinado entrega o arquivo', async () => {
      const lista = await request(servidor)
        .get(url(`/alunos/${idAluno}/fotos`))
        .set('Authorization', `Bearer ${tokenAluno}`)
        .expect(200);

      const arquivo = await request(servidor).get(semHost(lista.body[0].url)).expect(200);
      expect(arquivo.body).toBeInstanceOf(Buffer);
      expect((arquivo.body as Buffer).byteLength).toBe(PNG_1X1.byteLength);
    });

    /** O teste central de privacidade deste passo. */
    it('personal com vínculo e consentimento NÃO vê a foto por padrão', async () => {
      const r = await request(servidor)
        .get(url(`/alunos/${idAluno}/fotos`))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .expect(200);

      expect(r.body).toHaveLength(0);
    });

    it('o aluno libera para o personal e só então ele vê', async () => {
      await request(servidor)
        .patch(url(`/alunos/${idAluno}/fotos/${idFoto}/visibilidade`))
        .set('Authorization', `Bearer ${tokenAluno}`)
        .send({ visivelPara: ['PERSONAL'] })
        .expect(200);

      const doPersonal = await request(servidor)
        .get(url(`/alunos/${idAluno}/fotos`))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .expect(200);
      expect(doPersonal.body).toHaveLength(1);

      // A nutricionista não foi liberada — e nem tem vínculo com este aluno.
      await request(servidor)
        .get(url(`/alunos/${idAluno}/fotos`))
        .set('Authorization', `Bearer ${tokenNutri}`)
        .expect(403);
    });

    it('o profissional não envia foto pelo aluno', async () => {
      const r = await request(servidor)
        .post(url(`/alunos/${idAluno}/fotos`))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .send({ chave: `evolucao/${idAluno}/x.png`, mimeType: 'image/png', tamanhoBytes: 10 })
        .expect(403);

      expect(r.body.erro.codigo).toBe('PAPEL_NAO_AUTORIZADO');
    });

    it('registrar chave de outra pessoa é recusado', async () => {
      await request(servidor)
        .post(url(`/alunos/${idAluno}/fotos`))
        .set('Authorization', `Bearer ${tokenAluno}`)
        .send({ chave: 'evolucao/outro-aluno/roubada.png', mimeType: 'image/png', tamanhoBytes: 10 })
        .expect(409);
    });

    it('apagar remove da listagem mas preserva o registro', async () => {
      await request(servidor)
        .delete(url(`/alunos/${idAluno}/fotos/${idFoto}`))
        .set('Authorization', `Bearer ${tokenAluno}`)
        .expect(204);

      const r = await request(servidor)
        .get(url(`/alunos/${idAluno}/fotos`))
        .set('Authorization', `Bearer ${tokenAluno}`)
        .expect(200);
      expect(r.body).toHaveLength(0);

      const registro = await prisma.fotoEvolucao.findUnique({ where: { id: idFoto } });
      expect(registro?.deletadoEm).not.toBeNull();
    });
  });

  describe('vídeo de exercício', () => {
    it('vincula o vídeo e devolve link assinado', async () => {
      const autorizacao = await request(servidor)
        .post(url('/midia/upload-url'))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .send({ tipo: 'VIDEO_EXERCICIO', mimeType: 'video/mp4', tamanhoBytes: 1024 })
        .expect(201);

      await request(servidor)
        .put(semHost(autorizacao.body.urlUpload))
        .set('Content-Type', 'video/mp4')
        .send(Buffer.alloc(1024, 7))
        .expect(200);

      const vinculado = await request(servidor)
        .patch(url(`/exercicios/${idExercicio}/video`))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .send({ chave: autorizacao.body.chave })
        .expect(200);
      expect(vinculado.body.temVideo).toBe(true);

      const link = await request(servidor)
        .get(url(`/exercicios/${idExercicio}/video`))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .expect(200);
      expect(link.body.url).toContain('assinatura=');

      const arquivo = await request(servidor).get(semHost(link.body.url)).expect(200);
      expect((arquivo.body as Buffer).byteLength).toBe(1024);
    });

    it('não deixa vincular vídeo enviado por outra pessoa', async () => {
      await request(servidor)
        .patch(url(`/exercicios/${idExercicio}/video`))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .send({ chave: 'exercicios/outro-profissional/video.mp4' })
        .expect(409);
    });
  });
});
