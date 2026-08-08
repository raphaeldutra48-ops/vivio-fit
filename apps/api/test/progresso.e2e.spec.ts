import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { ErroFilter } from '../src/common/filters/erro.filter';
import { PrismaService } from '../src/infra/prisma.service';
import { criarAlunoVerificado, url } from './apoio';

/**
 * Painel de progresso.
 *
 * Não guarda nada: é leitura conjunta de execuções, check-ins e medidas. O que
 * estes testes protegem são as **decisões de leitura** — as que dariam número
 * plausível e errado se mudassem sem querer.
 */
describe('Painel de progresso (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let servidor: ReturnType<INestApplication['getHttpServer']>;

  const senha = 'Senha@123';
  const sufixo = Date.now().toString(36);
  const emailAluno = `progresso.${sufixo}@exemplo.com`;

  let tokenPersonal: string;
  let tokenAluno: string;
  let idAluno: string;
  let idSessao: string;
  let idItem: string;

  const painel = (dias = 30, token = tokenPersonal) =>
    request(servidor)
      .get(url(`/alunos/${idAluno}/progresso?dias=${dias}`))
      .set('Authorization', `Bearer ${token}`);

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

    const aluno = await criarAlunoVerificado(servidor, {
      nome: 'Aluno Progresso',
      email: emailAluno,
      senha,
      dataNascimento: '1993-03-03',
    });
    tokenAluno = aluno.accessToken;
    idAluno = aluno.usuario.id;

    const convite = await request(servidor)
      .post(url('/vinculos/convidar'))
      .set('Authorization', `Bearer ${tokenPersonal}`)
      .send({ email: emailAluno })
      .expect(201);
    await request(servidor)
      .patch(url(`/vinculos/${convite.body.id}/aceitar`))
      .set('Authorization', `Bearer ${tokenAluno}`)
      .expect(200);

    for (const escopo of ['TREINO', 'EVOLUCAO']) {
      await request(servidor)
        .post(url('/consentimentos'))
        .set('Authorization', `Bearer ${tokenAluno}`)
        .send({ escopo })
        .expect(201);
    }

    const supino = await prisma.exercicio.findFirstOrThrow({
      where: { nome: 'Supino reto com barra', escopo: 'GLOBAL' },
    });

    const plano = await request(servidor)
      .post(url(`/alunos/${idAluno}/planos-treino`))
      .set('Authorization', `Bearer ${tokenPersonal}`)
      .send({
        nome: 'Plano Progresso',
        ativar: true,
        sessoes: [
          {
            nome: 'A',
            itens: [{ exercicioId: supino.id, series: 3, repsAlvo: '10' }],
          },
        ],
      })
      .expect(201);

    idSessao = plano.body.sessoes[0].id;
    idItem = plano.body.sessoes[0].itens[0].id;
  });

  const apagarConta = async (email: string) => {
    const u = await prisma.user.findUnique({ where: { email } });
    if (!u) return;
    await prisma.logAuditoria.deleteMany({ where: { OR: [{ alunoId: u.id }, { atorId: u.id }] } });
    await prisma.serieExecutada.deleteMany({ where: { execucao: { alunoId: u.id } } });
    await prisma.execucaoTreino.deleteMany({ where: { alunoId: u.id } });
    await prisma.medida.deleteMany({ where: { alunoId: u.id } });
    await prisma.consentimento.deleteMany({ where: { alunoId: u.id } });
    await prisma.vinculo.deleteMany({ where: { OR: [{ alunoId: u.id }, { profissionalId: u.id }] } });
    await prisma.sessaoRefresh.deleteMany({ where: { userId: u.id } });
    await prisma.perfilAluno.deleteMany({ where: { userId: u.id } });
    await prisma.planoTreino.deleteMany({ where: { alunoId: u.id } });
    await prisma.user.delete({ where: { id: u.id } });
  };

  afterAll(async () => {
    await apagarConta(emailAluno);
    await app.close();
  });

  describe('aluno sem nada registrado', () => {
    /*
      Painel vazio não pode parecer painel ruim. Zero treinos é zero; adesão
      sem check-in é `null`, e a tela mostra "sem registro" em vez de "0%".
    */
    it('devolve zeros e nulos, não erro', async () => {
      const r = await painel().expect(200);

      expect(r.body.treino.total).toBe(0);
      expect(r.body.treino.volumeKg).toBe(0);
      expect(r.body.treino.duracaoMediaMin).toBeNull();
      expect(r.body.treino.diasSemTreinar).toBeNull();
      expect(r.body.checkins).toBeNull();
      expect(r.body.cargas).toEqual([]);
      expect(r.body.variacaoPesoKg).toBeNull();
    });
  });

  describe('com treino registrado', () => {
    const registrar = (dias: number, cargaKg: number, minutos: number) => {
      const inicio = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
      const fim = new Date(inicio.getTime() + minutos * 60 * 1000);
      return request(servidor)
        .post(url(`/alunos/${idAluno}/execucoes`))
        .set('Authorization', `Bearer ${tokenAluno}`)
        .send({
          clienteUuid: randomUUID(),
          sessaoId: idSessao,
          iniciadoEm: inicio.toISOString(),
          finalizadoEm: fim.toISOString(),
          series: [
            { itemTreinoId: idItem, serieNum: 1, repsFeitas: 15, cargaKg: 20, tipo: 'AQUECIMENTO' },
            { itemTreinoId: idItem, serieNum: 2, repsFeitas: 10, cargaKg },
          ],
        })
        .expect(201);
    };

    beforeAll(async () => {
      // Duas sessões leves no começo, duas mais pesadas no fim: tendência de alta.
      await registrar(20, 60, 40);
      await registrar(18, 60, 50);
      await registrar(4, 80, 60);
      await registrar(2, 80, 60);
    });

    it('conta sessões, volume e tempo', async () => {
      const r = await painel().expect(200);

      expect(r.body.treino.total).toBe(4);
      // Só as séries de trabalho: (60×10)×2 + (80×10)×2 = 1200 + 1600.
      // O aquecimento somaria 300×4 = 1200 a mais.
      expect(r.body.treino.volumeKg).toBe(2800);
      expect(r.body.treino.minutos).toBe(210);
      expect(r.body.treino.duracaoMediaMin).toBe(53);
    });

    /** "12 treinos" quer dizer coisas diferentes em 30 e em 90 dias. */
    it('frequência por semana muda com a janela, o total não', async () => {
      const trintaDias = await painel(30).expect(200);
      const noventaDias = await painel(90).expect(200);

      expect(trintaDias.body.treino.total).toBe(noventaDias.body.treino.total);
      expect(trintaDias.body.treino.porSemana).toBeGreaterThan(
        noventaDias.body.treino.porSemana,
      );
    });

    /*
      Compara a primeira metade do período com a segunda, e não a primeira
      sessão com a última: um dia ruim no fim viraria "regrediu 8%".
    */
    it('mostra a evolução de carga por exercício', async () => {
      const r = await painel().expect(200);

      expect(r.body.cargas).toHaveLength(1);
      const supino = r.body.cargas[0];
      expect(supino.exercicioNome).toBe('Supino reto com barra');
      expect(supino.fim1rmKg).toBeGreaterThan(supino.inicio1rmKg);
      expect(supino.variacaoPercentual).toBeCloseTo(33.3, 0);
    });

    it('o próprio aluno também lê o painel', async () => {
      const r = await painel(30, tokenAluno).expect(200);
      expect(r.body.treino.total).toBe(4);
    });
  });

  describe('com check-in', () => {
    beforeAll(async () => {
      const hoje = new Date();
      const dia = (n: number) =>
        new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate() - n))
          .toISOString()
          .slice(0, 10);

      for (const [n, treinou] of [
        [0, true],
        [1, true],
        [2, false],
      ] as const) {
        await request(servidor)
          .post(url(`/alunos/${idAluno}/checkins`))
          .set('Authorization', `Bearer ${tokenAluno}`)
          .send({ data: dia(n), treinou, energia: 4 })
          .expect(201);
      }
    });

    it('a adesão do painel é a mesma do módulo de check-in', async () => {
      const doPainel = await painel().expect(200);
      const doModulo = await request(servidor)
        .get(url(`/alunos/${idAluno}/checkins/resumo?dias=30`))
        .set('Authorization', `Bearer ${tokenPersonal}`)
        .expect(200);

      expect(doPainel.body.checkins.aderencia).toBe(doModulo.body.aderencia);
      expect(doPainel.body.checkins.comCheckin).toBe(3);
    });
  });

  describe('isolamento', () => {
    it('sem vínculo não lê', async () => {
      const outro = await criarAlunoVerificado(servidor, {
        nome: 'Estranho Progresso',
        email: `estranho-prog.${sufixo}@exemplo.com`,
        senha,
        dataNascimento: '1990-01-01',
      });

      await painel(30, outro.accessToken).expect(403);
      await apagarConta(`estranho-prog.${sufixo}@exemplo.com`);
    });

    it('sem token não passa', async () => {
      await request(servidor).get(url(`/alunos/${idAluno}/progresso`)).expect(401);
    });
  });
});
