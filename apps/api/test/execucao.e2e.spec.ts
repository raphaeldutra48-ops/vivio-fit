import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { ErroFilter } from '../src/common/filters/erro.filter';
import { PrismaService } from '../src/infra/prisma.service';

describe('Execução de treino (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const senha = 'Senha@123';
  let tokenPersonal: string;
  let tokenAna: string;
  let idAna: string;
  let idSessao: string;
  let idItemSupino: string;
  let idExercicioSupino: string;
  let idPlano: string;

  const url = (c: string) => `/api/v1${c}`;

  async function logar(email: string): Promise<string> {
    const r = await request(app.getHttpServer()).post(url('/auth/login')).send({ email, senha });
    return r.body.accessToken as string;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new ErroFilter());
    await app.init();
    prisma = app.get(PrismaService);

    [tokenPersonal, tokenAna] = await Promise.all([
      logar('personal@viviofit.com.br'),
      logar('ana@exemplo.com'),
    ]);

    idAna = (await prisma.user.findUniqueOrThrow({ where: { email: 'ana@exemplo.com' } })).id;
    const supino = await prisma.exercicio.findFirstOrThrow({
      where: { nome: 'Supino reto com barra', escopo: 'GLOBAL' },
    });

    // Plano dedicado a este teste, para não depender do estado deixado por outros.
    const plano = await request(app.getHttpServer())
      .post(url(`/alunos/${idAna}/planos-treino`))
      .set('Authorization', `Bearer ${tokenPersonal}`)
      .send({
        nome: `Plano de execução ${Date.now()}`,
        ativar: true,
        sessoes: [
          {
            nome: 'Treino de teste',
            itens: [{ exercicioId: supino.id, series: 3, repsAlvo: '10', cargaSugeridaKg: 40 }],
          },
        ],
      });

    idPlano = plano.body.id;
    idSessao = plano.body.sessoes[0].id;
    idItemSupino = plano.body.sessoes[0].itens[0].id;
    idExercicioSupino = supino.id;
  });

  afterAll(async () => {
    await prisma.execucaoTreino.deleteMany({ where: { alunoId: idAna } });
    await prisma.planoTreino.deleteMany({ where: { id: idPlano } });
    await app.close();
  });

  const treinoRealizado = (clienteUuid: string) => ({
    clienteUuid,
    sessaoId: idSessao,
    iniciadoEm: '2026-07-28T10:00:00.000Z',
    finalizadoEm: '2026-07-28T10:52:00.000Z',
    series: [
      { itemTreinoId: idItemSupino, serieNum: 1, repsFeitas: 12, cargaKg: 40, rpe: 7 },
      { itemTreinoId: idItemSupino, serieNum: 2, repsFeitas: 10, cargaKg: 42.5, rpe: 8 },
      {
        itemTreinoId: idItemSupino,
        serieNum: 3,
        repsFeitas: 8,
        cargaKg: 42.5,
        rpe: 9,
        tipo: 'FALHA',
      },
    ],
    feedback: { dificuldade: 4, teveDor: false, sensacao: 'Boa', comentario: 'Peito bem ativado' },
  });

  describe('registro', () => {
    it('o aluno registra o treino que executou', async () => {
      const r = await request(app.getHttpServer())
        .post(url(`/alunos/${idAna}/execucoes`))
        .set('Authorization', `Bearer ${tokenAna}`)
        .send(treinoRealizado(randomUUID()))
        .expect(201);

      expect(r.body.totalSeries).toBe(3);
      expect(r.body.duracaoSeg).toBe(52 * 60);
      // 40*12 + 42.5*10 + 42.5*8 = 480 + 425 + 340
      expect(r.body.volumeTotalKg).toBe(1245);
      expect(r.body.feedback.dificuldade).toBe(4);
      expect(r.body.jaRegistrada).toBeUndefined();
    });

    /**
     * O caso que existe por causa do modo offline: a fila local reenvia o mesmo
     * treino. Duplicar aqui estragaria o histórico de carga do aluno.
     */
    it('reenviar o mesmo clienteUuid NÃO duplica', async () => {
      const uuid = randomUUID();
      const primeira = await request(app.getHttpServer())
        .post(url(`/alunos/${idAna}/execucoes`))
        .set('Authorization', `Bearer ${tokenAna}`)
        .send(treinoRealizado(uuid))
        .expect(201);

      const segunda = await request(app.getHttpServer())
        .post(url(`/alunos/${idAna}/execucoes`))
        .set('Authorization', `Bearer ${tokenAna}`)
        .send(treinoRealizado(uuid))
        .expect(201);

      expect(segunda.body.id).toBe(primeira.body.id);
      expect(segunda.body.jaRegistrada).toBe(true);

      const total = await prisma.execucaoTreino.count({ where: { clienteUuid: uuid } });
      expect(total).toBe(1);
    });

    it('dois envios simultâneos do mesmo uuid resultam em uma execução só', async () => {
      const uuid = randomUUID();
      const envio = () =>
        request(app.getHttpServer())
          .post(url(`/alunos/${idAna}/execucoes`))
          .set('Authorization', `Bearer ${tokenAna}`)
          .send(treinoRealizado(uuid));

      const [a, b] = await Promise.all([envio(), envio()]);
      expect(a.status).toBe(201);
      expect(b.status).toBe(201);
      expect(a.body.id).toBe(b.body.id);

      expect(await prisma.execucaoTreino.count({ where: { clienteUuid: uuid } })).toBe(1);
    });

    it('recusa série que não pertence à sessão executada', async () => {
      const r = await request(app.getHttpServer())
        .post(url(`/alunos/${idAna}/execucoes`))
        .set('Authorization', `Bearer ${tokenAna}`)
        .send({
          ...treinoRealizado(randomUUID()),
          series: [{ itemTreinoId: 'cmxxxxxxxxxxxxxxxxxxxxxxx', serieNum: 1, repsFeitas: 10, cargaKg: 30 }],
        })
        .expect(409);

      expect(r.body.erro.codigo).toBe('CONFLITO');
    });

    it('recusa clienteUuid que não seja UUID', async () => {
      await request(app.getHttpServer())
        .post(url(`/alunos/${idAna}/execucoes`))
        .set('Authorization', `Bearer ${tokenAna}`)
        .send({ ...treinoRealizado('nao-e-uuid'), clienteUuid: 'nao-e-uuid' })
        .expect(422);
    });
  });

  describe('coluna ANTERIOR e histórico de carga', () => {
    it('devolve a última execução de cada exercício da sessão', async () => {
      const r = await request(app.getHttpServer())
        .get(url(`/alunos/${idAna}/sessoes/${idSessao}/anteriores`))
        .set('Authorization', `Bearer ${tokenAna}`)
        .expect(200);

      const previas = r.body.porExercicio[idExercicioSupino];
      expect(previas).toHaveLength(3);
      expect(previas[0]).toMatchObject({ serieNum: 1, cargaKg: 40, repsFeitas: 12 });
      expect(previas[2]).toMatchObject({ cargaKg: 42.5, tipo: 'FALHA' });
      expect(r.body.ultimaVezEm[idExercicioSupino]).toBeTruthy();
    });

    it('traz apenas a ÚLTIMA execução, não a soma de todas', async () => {
      // Já existem várias execuções deste teste; o "anterior" precisa ser de uma só.
      const r = await request(app.getHttpServer())
        .get(url(`/alunos/${idAna}/sessoes/${idSessao}/anteriores`))
        .set('Authorization', `Bearer ${tokenAna}`)
        .expect(200);

      expect(r.body.porExercicio[idExercicioSupino]).toHaveLength(3);
    });

    it('monta a progressão de carga do exercício', async () => {
      const r = await request(app.getHttpServer())
        .get(url(`/alunos/${idAna}/exercicios/${idExercicioSupino}/historico-carga`))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .expect(200);

      expect(r.body.exercicioNome).toBe('Supino reto com barra');
      expect(r.body.pontos.length).toBeGreaterThan(0);
      const ponto = r.body.pontos[r.body.pontos.length - 1];
      expect(ponto.cargaMaximaKg).toBe(42.5);
      // Epley com a melhor série: 40 × (1 + 12/30) = 56
      expect(ponto.estimativa1rmKg).toBeGreaterThanOrEqual(56);
    });

    /** Exercício nunca executado não pode quebrar a tela — devolve vazio. */
    it('exercício sem histórico devolve lista vazia', async () => {
      const outro = await prisma.exercicio.findFirstOrThrow({
        where: { nome: 'Prancha abdominal', escopo: 'GLOBAL' },
      });
      const r = await request(app.getHttpServer())
        .get(url(`/alunos/${idAna}/exercicios/${outro.id}/historico-carga`))
        .set('Authorization', `Bearer ${tokenAna}`)
        .expect(200);

      expect(r.body.pontos).toHaveLength(0);
    });

    it('sem consentimento de TREINO o personal não vê o histórico', async () => {
      const bruno = await prisma.user.findUniqueOrThrow({
        where: { email: 'bruno@exemplo.com' },
      });
      const r = await request(app.getHttpServer())
        .get(url(`/alunos/${bruno.id}/exercicios/${idExercicioSupino}/historico-carga`))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .expect(403);

      expect(r.body.erro.codigo).toBe('CONSENTIMENTO_AUSENTE');
    });
  });

  describe('leitura pelo profissional', () => {
    it('personal vê os treinos executados pela aluna', async () => {
      const r = await request(app.getHttpServer())
        .get(url(`/alunos/${idAna}/execucoes`))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .expect(200);

      expect(r.body.length).toBeGreaterThan(0);
      expect(r.body[0].sessaoNome).toBe('Treino de teste');
      expect(r.body[0].feedback.comentario).toBe('Peito bem ativado');
    });

    it('gera trilha de auditoria da leitura', async () => {
      const registro = await prisma.logAuditoria.findFirst({
        where: { alunoId: idAna, recursoTipo: 'EXECUCAO_TREINO', acao: 'LER' },
        orderBy: { criadoEm: 'desc' },
      });
      expect(registro).toBeTruthy();
      expect(registro?.escopo).toBe('TREINO');
    });
  });
});
