import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { ExercicioAGravar, ExercicioResumo } from '@vivio/contracts';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { ErroFilter } from '../src/common/filters/erro.filter';
import { PrismaService } from '../src/infra/prisma.service';
import { criarAlunoVerificado, url } from './apoio';

/**
 * Demonstração gravada pelo profissional.
 *
 * A regra que se protege: a gravação de quem acompanha a pessoa **vence** o
 * vídeo do acervo, e não vaza para aluno de outro profissional. É o que
 * permite gravar em cima do exercício global sem duplicá-lo — e duplicar
 * quebraria o histórico de carga, que é indexado por exercício.
 */
describe('Demonstração do profissional (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let servidor: ReturnType<INestApplication['getHttpServer']>;

  const senha = 'Senha@123';
  const sufixo = Date.now().toString(36);
  const emailAluno = `demo.aluno.${sufixo}@exemplo.com`;

  let tokenPersonal: string;
  let tokenAluno: string;
  let idPersonal: string;
  let idAluno: string;
  let idSupino: string;

  const midia = (token: string) =>
    request(servidor)
      .post(url('/exercicios/midia'))
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: [idSupino] });

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
    idPersonal = login.body.usuario.id;

    const conta = await criarAlunoVerificado(servidor, {
      nome: 'Aluno Demonstracao',
      email: emailAluno,
      senha,
      dataNascimento: '1992-02-02',
    });
    tokenAluno = conta.accessToken;
    idAluno = conta.usuario.id;

    const convite = await request(servidor)
      .post(url('/vinculos/convidar'))
      .set('Authorization', `Bearer ${tokenPersonal}`)
      .send({ email: emailAluno })
      .expect(201);
    await request(servidor)
      .patch(url(`/vinculos/${convite.body.id}/aceitar`))
      .set('Authorization', `Bearer ${tokenAluno}`)
      .expect(200);
    await request(servidor)
      .post(url('/consentimentos'))
      .set('Authorization', `Bearer ${tokenAluno}`)
      .send({ escopo: 'TREINO' })
      .expect(201);

    const supino = await prisma.exercicio.findFirstOrThrow({
      where: { nome: 'Supino reto com barra', escopo: 'GLOBAL' },
    });
    idSupino = supino.id;
  });

  afterAll(async () => {
    await prisma.demonstracaoProfissional.deleteMany({ where: { profissionalId: idPersonal } });
    const u = await prisma.user.findUnique({ where: { email: emailAluno } });
    if (u) {
      await prisma.logAuditoria.deleteMany({ where: { OR: [{ alunoId: u.id }, { atorId: u.id }] } });
      await prisma.consentimento.deleteMany({ where: { alunoId: u.id } });
      await prisma.vinculo.deleteMany({ where: { alunoId: u.id } });
      await prisma.sessaoRefresh.deleteMany({ where: { userId: u.id } });
      await prisma.perfilAluno.deleteMany({ where: { userId: u.id } });
      await prisma.user.delete({ where: { id: u.id } });
    }
    await app.close();
  });

  describe('gravar em cima do exercício global', () => {
    /*
      O `vincularVideo` recusa exercício global — e faz bem, porque o vídeo
      iria para os alunos de todo mundo. A demonstração é o caminho que existe
      para isso.
    */
    it('vincularVideo continua recusando o global', async () => {
      await request(servidor)
        .patch(url(`/exercicios/${idSupino}/video`))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .send({ chave: `exercicios/${idPersonal}/qualquer.mp4` })
        .expect(403);
    });

    it('mas a demonstração própria é aceita', async () => {
      await request(servidor)
        .post(url(`/exercicios/${idSupino}/minha-demonstracao`))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .send({ chave: `exercicios/${idPersonal}/supino-demo.mp4` })
        .expect(204);
    });

    /* Sem isto, dava para apontar a demonstração para o arquivo de outra pessoa. */
    it('recusa chave que não pertence a quem grava', async () => {
      await request(servidor)
        .post(url(`/exercicios/${idSupino}/minha-demonstracao`))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .send({ chave: 'exercicios/outra-pessoa/roubado.mp4' })
        .expect(409);
    });

    it('aluno não grava demonstração', async () => {
      await request(servidor)
        .post(url(`/exercicios/${idSupino}/minha-demonstracao`))
        .set('Authorization', `Bearer ${tokenAluno}`)
        .send({ chave: `exercicios/${idAluno}/tentativa.mp4` })
        .expect(403);
    });
  });

  describe('quem vê o quê', () => {
    /*
      A regra central. O aluno do Diego vê a gravação do Diego no supino, e não
      o vídeo do acervo — é o aparelho da academia dele e a variação que ele
      prescreve.
    */
    it('o aluno vinculado recebe a gravação do seu profissional', async () => {
      const r = await midia(tokenAluno).expect(200);
      expect(r.body[idSupino]?.videoUrl).toBeTruthy();
    });

    it('aluno de outro profissional não recebe essa gravação', async () => {
      const estranho = await criarAlunoVerificado(servidor, {
        nome: 'Estranho Demo',
        email: `estranho-demo.${sufixo}@exemplo.com`,
        senha,
        dataNascimento: '1990-01-01',
      });

      const r = await request(servidor)
        .post(url('/exercicios/midia'))
        .set('Authorization', `Bearer ${estranho.accessToken}`)
        .send({ ids: [idSupino] })
        .expect(200);

      // O supino global não tem vídeo próprio; sem a gravação do Diego, nada.
      expect(r.body[idSupino]?.videoUrl ?? null).toBeNull();

      const u = await prisma.user.findUnique({
        where: { email: `estranho-demo.${sufixo}@exemplo.com` },
      });
      if (u) {
        await prisma.logAuditoria.deleteMany({
          where: { OR: [{ alunoId: u.id }, { atorId: u.id }] },
        });
        await prisma.sessaoRefresh.deleteMany({ where: { userId: u.id } });
        await prisma.perfilAluno.deleteMany({ where: { userId: u.id } });
        await prisma.user.delete({ where: { id: u.id } });
      }
    });

    it('o próprio profissional vê a gravação dele, para conferir', async () => {
      const r = await midia(tokenPersonal).expect(200);
      expect(r.body[idSupino]?.videoUrl).toBeTruthy();
    });
  });

  describe('regravar e remover', () => {
    it('regravar substitui, não acumula', async () => {
      await request(servidor)
        .post(url(`/exercicios/${idSupino}/minha-demonstracao`))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .send({ chave: `exercicios/${idPersonal}/supino-v2.mp4` })
        .expect(204);

      const quantas = await prisma.demonstracaoProfissional.count({
        where: { profissionalId: idPersonal, exercicioId: idSupino },
      });
      expect(quantas).toBe(1);
    });

    it('removida, o aluno volta a não ter vídeo naquele exercício', async () => {
      await request(servidor)
        .delete(url(`/exercicios/${idSupino}/minha-demonstracao`))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .expect(204);

      const r = await midia(tokenAluno).expect(200);
      expect(r.body[idSupino]?.videoUrl ?? null).toBeNull();
    });
  });

  /*
    Este bloco fica por último de propósito: ele grava a própria demonstração,
    e rodando antes estragaria as asserções de ausência dos blocos acima.
  */
  describe('gravar o acervo sem se perder', () => {
    const achar = (corpo: ExercicioResumo[]) => corpo.find((e) => e.id === idSupino);

    it('antes de gravar, o supino global não tem vídeo nem demonstração', async () => {
      const r = await request(servidor)
        .get(url('/exercicios?q=Supino reto com barra'))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .expect(200);

      const supino = achar(r.body);
      expect(supino?.temVideo).toBe(false);
      expect(supino?.temDemonstracao).toBe(false);
    });

    /*
      O defeito que isto tranca: `temVideo` só olhava `Exercicio.videoChave`,
      então gravar em cima de um global não mudava nada na lista. Quem grava
      159 exercícios não tem como lembrar o que já fez — regravaria por cima
      do próprio trabalho.
    */
    it('depois de gravar, a lista mostra a demonstração — sem inventar vídeo de acervo', async () => {
      await request(servidor)
        .post(url(`/exercicios/${idSupino}/minha-demonstracao`))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .send({ chave: `exercicios/${idPersonal}/supino-acervo.mp4` })
        .expect(204);

      const r = await request(servidor)
        .get(url('/exercicios?q=Supino reto com barra'))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .expect(200);

      const supino = achar(r.body);
      expect(supino?.temDemonstracao).toBe(true);
      // Continua sendo falso: o acervo não ganhou vídeo, quem tem sou eu.
      expect(supino?.temVideo).toBe(false);
    });

    /*
      O segundo defeito: sem `videoChave` no exercício, o link morria em 404 e
      o profissional não conseguia rever o que acabara de enviar — justamente
      quando ele quer conferir o enquadramento para regravar na hora.
    */
    it('e dá para rever a própria gravação num exercício global', async () => {
      const r = await request(servidor)
        .get(url(`/exercicios/${idSupino}/video`))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .expect(200);

      expect(r.body.url).toBeTruthy();
    });

    it('aluno de fora continua sem alcançar esse vídeo', async () => {
      const estranho = await criarAlunoVerificado(servidor, {
        nome: 'Estranho Video',
        email: `estranho-video.${sufixo}@exemplo.com`,
        senha,
        dataNascimento: '1991-03-03',
      });

      await request(servidor)
        .get(url(`/exercicios/${idSupino}/video`))
        .set('Authorization', `Bearer ${estranho.accessToken}`)
        .expect(404);

      const u = await prisma.user.findUnique({
        where: { email: `estranho-video.${sufixo}@exemplo.com` },
      });
      if (u) {
        await prisma.logAuditoria.deleteMany({
          where: { OR: [{ alunoId: u.id }, { atorId: u.id }] },
        });
        await prisma.sessaoRefresh.deleteMany({ where: { userId: u.id } });
        await prisma.perfilAluno.deleteMany({ where: { userId: u.id } });
        await prisma.user.delete({ where: { id: u.id } });
      }
    });

    describe('a fila de gravação', () => {
      it('não lista o que já foi gravado — é fila de pendência', async () => {
        const r = await request(servidor)
          .get(url('/exercicios/plano-de-gravacao'))
          .set('Authorization', `Bearer ${tokenPersonal}`)
          .expect(200);

        expect(r.body.some((e: ExercicioAGravar) => e.id === idSupino)).toBe(false);
      });

      /* Se a ordem não for por prescrição, a fila não ajuda a decidir nada. */
      it('vem do mais prescrito para o menos', async () => {
        const r = await request(servidor)
          .get(url('/exercicios/plano-de-gravacao'))
          .set('Authorization', `Bearer ${tokenPersonal}`)
          .expect(200);

        const vezes = (r.body as ExercicioAGravar[]).map((e) => e.vezesPrescrito);
        expect(vezes).toEqual([...vezes].sort((a, b) => b - a));
      });

      it('aluno não tem fila de gravação', async () => {
        await request(servidor)
          .get(url('/exercicios/plano-de-gravacao'))
          .set('Authorization', `Bearer ${tokenAluno}`)
          .expect(403);
      });

      /*
        A rota é literal e vem antes de `:id` no controller. Se alguém a mover
        para depois, ela cai em `obter` com o id "plano-de-gravacao" e volta
        404 — este teste é o que avisa.
      */
      it('a rota não é engolida pelo :id', async () => {
        const r = await request(servidor)
          .get(url('/exercicios/plano-de-gravacao'))
          .set('Authorization', `Bearer ${tokenPersonal}`)
          .expect(200);

        expect(Array.isArray(r.body)).toBe(true);
      });
    });
  });
});
